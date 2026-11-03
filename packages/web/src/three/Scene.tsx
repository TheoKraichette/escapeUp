import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { Points, BufferAttribute } from 'three';
import type { ClientObjectView } from '@escapeup/engine';
import { hashString } from '../theme';
import type { PlacedPoi } from '../layout';
import {
  NAV,
  ROOM,
  buildNavmesh,
  entranceFor,
  isWalkable,
  zoneIndexAt,
  type Navmesh,
  type RoomLayout,
} from '../layout';
import type { Palette } from '../theme';
import { ZoneBox } from './ZoneBox';
import { ObjectMesh } from './ObjectMesh';
import { AimProbe } from './AimProbe';
import { BlobShadow } from './BlobShadow';
import { SceneEffects } from './effects';
import { floorTexture, repeated } from './textures';

export interface TravelRequest {
  index: number;
  /** incrémenté à chaque demande de voyage rapide ; 0 = aucune */
  seq: number;
}

export interface ZonePulse {
  zoneId: string;
  /** incrémenté à chaque déverrouillage ; 0 = aucun */
  seq: number;
}

export interface CameraShake {
  /** incrémenté à chaque secousse demandée ; 0 = aucune */
  seq: number;
  /** amplitude relative (1 = échec de code, 0.5 = « thump » de déverrouillage) */
  force: number;
}

interface Props {
  layout: RoomLayout;
  palette: Palette;
  /** id du theme pack (laboratoire, navire…) : habillage 3D identitaire */
  themeId: string;
  focusIndex: number;
  hoveredId: string | null;
  selectedId: string | null;
  travel: TravelRequest;
  pulse: ZonePulse;
  shake: CameraShake;
  onSelect: (obj: ClientObjectView) => void;
  onHover: (id: string | null) => void;
  onDeselect: () => void;
  onEnterZone: (index: number) => void;
  /** objet interactif actuellement devant le joueur (réticule du HUD) */
  onAim: (id: string | null) => void;
}

/** Interpolation d'angle par le plus court chemin. */
function lerpAngle(a: number, b: number, t: number): number {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * t;
}

const MOVE_KEYS = new Set([
  'w',
  'a',
  's',
  'd',
  'z',
  'q',
  'arrowup',
  'arrowdown',
  'arrowleft',
  'arrowright',
]);

/**
 * Contrôleur PREMIÈRE PERSONNE (sans pointer-lock, curseur visible) :
 * - déplacement clavier ZQSD/WASD/flèches sur le plan XZ, relatif au yaw ;
 * - regard par clic-glisser (seuil px pour distinguer clic/glisser) ;
 * - collisions clampées à la zone marchable ;
 * - voyage rapide fluide vers l'entrée d'une pièce.
 */
function FirstPersonControls({
  layout,
  nav,
  travel,
  shake,
  onEnterZone,
}: {
  layout: RoomLayout;
  nav: Navmesh;
  travel: TravelRequest;
  shake: CameraShake;
  onEnterZone: (index: number) => void;
}) {
  const { camera, gl } = useThree();

  const keys = useRef<Set<string>>(new Set());
  const yaw = useRef(0); // angle RENDU (lissé)
  const pitch = useRef(0);
  const yawT = useRef(0); // angle CIBLE (piloté par la souris)
  const pitchT = useRef(0);
  const vel = useRef({ x: 0, z: 0 });
  const glide = useRef<{ x: number; z: number; yaw: number } | null>(null);
  const curZone = useRef(-1);

  // état de glissement souris
  const pointerDown = useRef(false);
  const dragging = useRef(false);
  const moved = useRef(0);
  const last = useRef({ x: 0, y: 0 });

  // callback toujours à jour sans relancer les effets
  const onEnterZoneRef = useRef(onEnterZone);
  onEnterZoneRef.current = onEnterZone;
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  // Placement initial : entrée de la 1re pièce. Scene se remonte à chaque
  // nouvelle partie, donc un effet au montage suffit (pas de re-téléport aux actions).
  useEffect(() => {
    const e = entranceFor(layoutRef.current, 0);
    camera.rotation.order = 'YXZ';
    camera.position.set(e.x, NAV.eyeHeight, e.z);
    yaw.current = e.yaw;
    yawT.current = e.yaw;
    pitch.current = 0;
    pitchT.current = 0;
    camera.rotation.set(0, e.yaw, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Voyage rapide : sur nouvelle demande, glisse vers l'entrée de la pièce.
  useEffect(() => {
    if (travel.seq === 0) return;
    const e = entranceFor(layoutRef.current, travel.index);
    glide.current = { x: e.x, z: e.z, yaw: e.yaw };
    pitchT.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [travel.seq]);

  // Secousse caméra (échec, déverrouillage) : armée ici, datée au prochain
  // frame (clock.elapsedTime). −1 = repos, −2 = armée.
  const shakeStart = useRef(-1);
  const shakeAmp = useRef(0);
  useEffect(() => {
    if (shake.seq === 0) return;
    shakeAmp.current = 0.012 * shake.force;
    shakeStart.current = -2;
  }, [shake.seq, shake.force]);

  // Clavier (nettoyé). e.key => WASD et ZQSD (AZERTY) marchent tous deux.
  useEffect(() => {
    const isTyping = () => {
      const el = document.activeElement as HTMLElement | null;
      return (
        !!el &&
        (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable === true)
      );
    };
    const down = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTyping()) return;
      const k = e.key.toLowerCase();
      if (MOVE_KEYS.has(k)) {
        keys.current.add(k);
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (MOVE_KEYS.has(k)) keys.current.delete(k);
    };
    const clear = () => keys.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
    };
  }, []);

  // Regard par clic-glisser sur le canvas (curseur non verrouillé).
  useEffect(() => {
    const el = gl.domElement;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      pointerDown.current = true;
      dragging.current = false;
      moved.current = 0;
      last.current = { x: e.clientX, y: e.clientY };
    };
    const onMove = (e: PointerEvent) => {
      if (!pointerDown.current) return;
      const dx = e.clientX - last.current.x;
      const dy = e.clientY - last.current.y;
      last.current = { x: e.clientX, y: e.clientY };
      moved.current += Math.hypot(dx, dy);
      if (moved.current > NAV.dragThreshold) dragging.current = true;
      if (dragging.current) {
        // On pilote la CIBLE ; useFrame l'atteint en douceur (mouvement fluide).
        yawT.current -= dx * NAV.lookSensitivity;
        pitchT.current = Math.max(
          -NAV.maxPitch,
          Math.min(NAV.maxPitch, pitchT.current - dy * NAV.lookSensitivity),
        );
        glide.current = null; // un regard manuel interrompt un voyage en cours
      }
    };
    const onUp = () => {
      pointerDown.current = false;
      dragging.current = false;
    };
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [gl]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);

    if (glide.current) {
      // Voyage rapide fluide vers l'entrée choisie (on vise la cible de regard).
      const g = glide.current;
      const k = 1 - Math.pow(0.0016, dt);
      camera.position.x += (g.x - camera.position.x) * k;
      camera.position.z += (g.z - camera.position.z) * k;
      yawT.current = g.yaw;
      if (Math.hypot(g.x - camera.position.x, g.z - camera.position.z) < 0.03) {
        camera.position.x = g.x;
        camera.position.z = g.z;
        vel.current.x = 0;
        vel.current.z = 0;
        glide.current = null;
      }
    } else {
      // Entrée directionnelle -> direction monde selon le yaw.
      const kdn = keys.current;
      const fa = (kdn.has('w') || kdn.has('z') || kdn.has('arrowup') ? 1 : 0) -
        (kdn.has('s') || kdn.has('arrowdown') ? 1 : 0);
      const ra = (kdn.has('d') || kdn.has('arrowright') ? 1 : 0) -
        (kdn.has('a') || kdn.has('q') || kdn.has('arrowleft') ? 1 : 0);

      let tx = 0;
      let tz = 0;
      const mag = Math.hypot(fa, ra);
      if (mag > 0) {
        const nf = fa / mag;
        const nr = ra / mag;
        const s = Math.sin(yaw.current);
        const c = Math.cos(yaw.current);
        // avant monde = (−sin, 0, −cos) ; droite monde = (cos, 0, −sin)
        tx = (-s * nf + c * nr) * NAV.speed;
        tz = (-c * nf - s * nr) * NAV.speed;
      }

      // Inertie légère.
      const a = Math.min(1, NAV.accel * dt);
      vel.current.x += (tx - vel.current.x) * a;
      vel.current.z += (tz - vel.current.z) * a;

      // Déplacement + collisions, axe par axe (glisse le long des murs).
      let px = camera.position.x;
      let pz = camera.position.z;
      const nx = px + vel.current.x * dt;
      if (isWalkable(nav, nx, pz)) px = nx;
      else vel.current.x = 0;
      const nz = pz + vel.current.z * dt;
      if (isWalkable(nav, px, nz)) pz = nz;
      else vel.current.z = 0;
      camera.position.x = px;
      camera.position.z = pz;
    }

    camera.position.y = NAV.eyeHeight;

    // Lissage du regard : l'angle rendu rattrape la cible avec une constante de
    // temps courte (~55 ms) → mouvement fluide même si les événements souris
    // arrivent par à-coups.
    const lookK = 1 - Math.exp(-dt / 0.055);
    yaw.current = lerpAngle(yaw.current, yawT.current, lookK);
    pitch.current += (pitchT.current - pitch.current) * lookK;
    camera.rotation.set(pitch.current, yaw.current, 0);

    // Secousse : offsets sinusoïdaux amortis appliqués APRÈS le set() — jamais
    // dans les refs yaw/pitch (le lissage du regard reste intact) ni sur la
    // position XZ (collisions/navmesh intacts).
    const t = state.clock.elapsedTime;
    if (shakeStart.current === -2) shakeStart.current = t;
    if (shakeStart.current >= 0) {
      const age = t - shakeStart.current;
      if (age > 0.45) {
        shakeStart.current = -1;
      } else {
        const env = Math.exp(-6 * age);
        const a = shakeAmp.current * env;
        camera.rotation.z += a * Math.sin(t * 43);
        camera.rotation.x += a * 0.6 * Math.sin(t * 31 + 1.7);
      }
    }

    // Focalisation auto quand la caméra entre dans une pièce.
    const idx = zoneIndexAt(nav, camera.position.x, camera.position.z);
    if (idx >= 0 && idx !== curZone.current) {
      curZone.current = idx;
      onEnterZoneRef.current(idx);
    }
  });

  return null;
}

/**
 * Poussière en suspension : nappe de points procéduraux (PRNG local, aucun
 * asset) couvrant l'enfilade des pièces, dérive lente vers le haut avec
 * rebouclage. Donne de la profondeur à la lumière sans post-processing.
 */
function DustParticles({ layout, palette }: { layout: RoomLayout; palette: Palette }) {
  const ref = useRef<Points>(null);

  const { positions, speeds, tops, count } = useMemo(() => {
    // PRNG déterministe minimal (LCG) : même layout → même poussière.
    let s = 0x9e3779b9;
    const rnd = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 2 ** 32;
    };
    const count = Math.min(700, 180 * layout.zones.length);
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    const tops = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // Chaque particule vit DANS une pièce (dimensions propres à la pièce).
      const z = layout.zones[i % layout.zones.length]!;
      positions[i * 3] = z.center[0] + (rnd() * 2 - 1) * (z.halfX - 0.3);
      positions[i * 3 + 1] = 0.15 + rnd() * (z.height - 0.4);
      positions[i * 3 + 2] = (rnd() * 2 - 1) * (z.halfZ - 0.3);
      speeds[i] = 0.03 + rnd() * 0.08;
      tops[i] = z.height - 0.2;
    }
    return { positions, speeds, tops, count };
  }, [layout]);

  useFrame((state, delta) => {
    const pts = ref.current;
    if (!pts) return;
    const attr = pts.geometry.getAttribute('position') as BufferAttribute;
    const arr = attr.array as Float32Array;
    const t = state.clock.elapsedTime;
    const dt = Math.min(delta, 0.05);
    for (let i = 0; i < count; i++) {
      let y = arr[i * 3 + 1]! + speeds[i]! * dt;
      if (y > tops[i]!) y = 0.15;
      arr[i * 3 + 1] = y;
      // léger balancement latéral, déphasé par particule
      arr[i * 3] = arr[i * 3]! + Math.sin(t * 0.6 + i) * 0.0006;
    }
    attr.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.035}
        color={palette.accent}
        transparent
        opacity={0.35}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

/**
 * Meuble-présentoir sous un groupe d'objets : ancre visuelle (les objets ne
 * flottent plus dans le vide) + étiquette du LIEU (les indices parlent de ces
 * meubles — « Bureau du notaire », « Rack de transmissions »…).
 */
function PoiStand({ poi, palette }: { poi: PlacedPoi; palette: Palette }) {
  const variant = useMemo(() => hashString(`poi|${poi.id}`) % 3, [poi.id]);
  const len = Math.max(1.3, poi.span);
  const wood = variant === 0 ? '#3b4653' : variant === 1 ? '#46403a' : '#39434b';

  return (
    <group position={[poi.x, 0, poi.z]} rotation={[0, poi.angle, 0]}>
      {variant === 1 ? (
        // Comptoir : corps + plateau débordant.
        <group position={[0, 0, -0.12]}>
          <mesh position={[0, 0.34, 0]} castShadow receiveShadow>
            <boxGeometry args={[len, 0.68, 0.72]} />
            <meshStandardMaterial color={wood} roughness={0.85} metalness={0.05} />
          </mesh>
          <mesh position={[0, 0.71, 0]} castShadow>
            <boxGeometry args={[len + 0.14, 0.06, 0.86]} />
            <meshStandardMaterial color={'#2c343d'} roughness={0.7} metalness={0.1} />
          </mesh>
        </group>
      ) : variant === 2 ? (
        // Socle bas à liseré lumineux.
        <group position={[0, 0, -0.12]}>
          <mesh position={[0, 0.21, 0]} castShadow receiveShadow>
            <boxGeometry args={[len, 0.42, 0.9]} />
            <meshStandardMaterial color={wood} roughness={0.9} metalness={0.05} />
          </mesh>
          <mesh position={[0, 0.43, 0]}>
            <boxGeometry args={[len - 0.06, 0.03, 0.84]} />
            <meshStandardMaterial
              color={palette.accent}
              emissive={palette.accent}
              emissiveIntensity={0.4}
              transparent
              opacity={0.8}
            />
          </mesh>
        </group>
      ) : (
        // Caisse-établi simple.
        <mesh position={[0, 0.28, -0.12]} castShadow receiveShadow>
          <boxGeometry args={[len, 0.56, 0.8]} />
          <meshStandardMaterial color={wood} roughness={0.9} metalness={0.05} />
        </mesh>
      )}
      {/* ancrage au sol : ombre blob sous le meuble */}
      <BlobShadow size={[len + 0.5, 1.4]} position={[0, 0.02, -0.12]} opacity={0.3} />
      {/* étiquette discrète du lieu */}
      {poi.name && (
        <Html position={[0, 0.95, 0.15]} center zIndexRange={[6, 0]}>
          <div className="poi-label">{poi.name}</div>
        </Html>
      )}
    </group>
  );
}

/** Couloir praticable reliant deux pièces adjacentes (le "gap"). */
function Corridor({
  x0,
  x1,
  palette,
  themeId,
}: {
  x0: number;
  x1: number;
  palette: Palette;
  themeId: string;
}) {
  const dh = NAV.doorHalf;
  const dHeight = NAV.doorHeight;
  const t = NAV.wallThickness;
  const len = x1 - x0;
  const cx = (x0 + x1) / 2;
  const floorMap = useMemo(() => repeated(floorTexture(themeId), len, dh * 2), [themeId, len, dh]);

  return (
    <group position={[cx, 0, 0]}>
      {/* sol du couloir */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[len, dh * 2]} />
        <meshStandardMaterial
          color={palette.floor}
          map={floorMap ?? undefined}
          roughness={0.85}
          metalness={0.05}
        />
      </mesh>
      {/* plafond du couloir */}
      <mesh position={[0, dHeight, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[len, dh * 2]} />
        <meshStandardMaterial color={palette.ceiling} roughness={0.95} metalness={0.02} />
      </mesh>
      {/* parois latérales */}
      <mesh position={[0, dHeight / 2, dh]} receiveShadow>
        <boxGeometry args={[len, dHeight, t]} />
        <meshStandardMaterial color={palette.wall} roughness={0.95} metalness={0.02} />
      </mesh>
      <mesh position={[0, dHeight / 2, -dh]} receiveShadow>
        <boxGeometry args={[len, dHeight, t]} />
        <meshStandardMaterial color={palette.wall} roughness={0.95} metalness={0.02} />
      </mesh>
      {/* éclairage doux du passage */}
      <pointLight
        position={[0, dHeight - 0.3, 0]}
        intensity={palette.key * 3.5}
        distance={len * 1.8}
        decay={2}
        color={palette.lamp}
      />
    </group>
  );
}

export function Scene({
  layout,
  palette,
  themeId,
  focusIndex,
  hoveredId,
  selectedId,
  travel,
  pulse,
  shake,
  onSelect,
  onHover,
  onDeselect,
  onEnterZone,
  onAim,
}: Props) {
  const nav = useMemo(() => buildNavmesh(layout), [layout]);
  const start = entranceFor(layout, 0);

  return (
    <Canvas
      className="scene-root"
      shadows="soft"
      dpr={[1, 2]}
      gl={{ toneMappingExposure: 1.15 }}
      camera={{ position: [start.x, NAV.eyeHeight, start.z], fov: 62, near: 0.1, far: 120 }}
      onPointerMissed={onDeselect}
    >
      <color attach="background" args={[palette.fog]} />
      {/* Le fog ne commence qu'AU-DELÀ de la pièce courante (~14 m) : l'enfilade
          couloir + porte suivante reste lisible (sinon « rectangle noir »). */}
      <fog attach="fog" args={[palette.fog, 14, 60]} />

      <ambientLight intensity={palette.ambient} />
      <directionalLight position={[6, 12, 8]} intensity={0.4} />

      {layout.zones.map((z, i) => (
        <group key={z.zone.id}>
          <ZoneBox
            zone={z}
            palette={palette}
            themeId={themeId}
            focused={z.index === focusIndex}
            doorLeft={i > 0}
            doorRight={i < layout.zones.length - 1}
            lockedRightLabel={i === layout.zones.length - 1 ? layout.nextLockedName : null}
            pulseSeq={pulse.zoneId === z.zone.id ? pulse.seq : 0}
          />
          {z.pois.map((p) => (
            <PoiStand key={p.id} poi={p} palette={palette} />
          ))}
          {z.objects.map((p) => (
            <ObjectMesh
              key={p.obj.id}
              placed={p}
              hovered={hoveredId === p.obj.id}
              selected={selectedId === p.obj.id}
              accent={palette.accent}
              onSelect={onSelect}
              onHover={onHover}
            />
          ))}
        </group>
      ))}

      {layout.zones.slice(0, -1).map((z, i) => {
        const next = layout.zones[i + 1];
        if (!next) return null;
        return (
          <Corridor
            key={`corridor-${z.zone.id}`}
            x0={z.center[0] + z.halfX}
            x1={next.center[0] - next.halfX}
            palette={palette}
            themeId={themeId}
          />
        );
      })}

      <DustParticles layout={layout} palette={palette} />

      <FirstPersonControls
        layout={layout}
        nav={nav}
        travel={travel}
        shake={shake}
        onEnterZone={onEnterZone}
      />

      <AimProbe layout={layout} onAim={onAim} />

      <SceneEffects themeId={themeId} />
    </Canvas>
  );
}
