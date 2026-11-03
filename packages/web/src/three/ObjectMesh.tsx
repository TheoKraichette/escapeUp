import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { ReactElement } from 'react';
import type { ClientObjectView, MechanismControls } from '@escapeup/engine';
import type { PlacedObject } from '../layout';
import { FAMILY_COLORS, hashString } from '../theme';
import { primaryVerb } from '../hud/affordances';
import { playSound } from '../audio';
import { Burst } from './BurstParticles';
import { BlobShadow } from './BlobShadow';

interface Props {
  placed: PlacedObject;
  hovered: boolean;
  selected: boolean;
  accent: string;
  onSelect: (obj: ClientObjectView) => void;
  onHover: (id: string | null) => void;
}

/** Un objet interactif attire l'attention ; le décor reste discret (anti pixel-hunting). */
function isDecor(obj: ClientObjectView): boolean {
  return obj.family === 'decor';
}

/**
 * Marque posée sur un mesh (via userData) dont le matériau participe au halo
 * d'interaction. L'émissif de ces matériaux est piloté en IMPÉRATIF par le
 * useFrame d'ObjectMesh — jamais par le JSX, sinon chaque re-render React
 * écraserait la valeur animée.
 */
interface GlowMark {
  /** intensité émissive au repos */
  rest: number;
  /** intensité émissive au survol (k = 1) */
  peak: number;
  /** couleur émissive de repos (défaut : noir → aucun halo au repos) */
  color?: string;
  /** true : garde sa couleur au survol (gemme déjà teintée accent) */
  keep?: boolean;
}

/** Rayon (m) en-deçà duquel un interactif pulse doucement pour se signaler. */
const PROXIMITY_RADIUS = 3.5;

export function ObjectMesh({ placed, hovered, selected, accent, onSelect, onHover }: Props) {
  const { obj, position, rotationY } = placed;
  const decor = isDecor(obj);
  const group = useRef<THREE.Group>(null);
  const floater = useRef<THREE.Group>(null);
  const [downPos, setDownPos] = useState<[number, number] | null>(null);

  const emphasis = !decor && (hovered || selected);

  // Collecte des matériaux marqués `glow` (voir GlowMark). La silhouette d'un
  // objet est stable au runtime : une collecte au montage suffit.
  const glowMats = useRef<THREE.MeshStandardMaterial[]>([]);
  useEffect(() => {
    const mats: THREE.MeshStandardMaterial[] = [];
    group.current?.traverse((o) => {
      const mark = (o.userData as { glow?: GlowMark }).glow;
      const mesh = o as THREE.Mesh;
      if (!mark || !(mesh.material instanceof THREE.MeshStandardMaterial)) return;
      const m = mesh.material;
      m.userData.rest = mark.rest;
      m.userData.peak = mark.peak;
      m.userData.restColor = new THREE.Color(mark.color ?? '#000000');
      m.userData.glowColor = new THREE.Color(mark.keep ? (mark.color ?? accent) : accent);
      m.emissive.copy(m.userData.restColor as THREE.Color);
      m.emissiveIntensity = mark.rest;
      mats.push(m);
    });
    glowMats.current = mats;
  }, [accent]);

  const worldPos = useMemo(() => new THREE.Vector3(...position), [position]);
  /** déphasage du pulse propre à l'objet (déterministe) */
  const phase = useMemo(() => hashString(obj.id) % 7, [obj.id]);
  const glowK = useRef(0);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const dt = Math.min(delta, 0.05);

    // Flottement des objets ramassables : seul le SOUS-groupe flotte — l'ombre
    // blob et la position logique (distance caméra) restent au sol.
    if (obj.family === 'instrument' && floater.current) {
      floater.current.position.y = Math.sin(t * 1.6 + position[0]) * 0.06;
      floater.current.rotation.y += 0.01;
    }

    // Halo d'interaction : éteint sur le décor, pulsé à l'approche, franc au
    // survol/sélection. Un facteur k unique, dampé, pilote tous les matériaux.
    if (!decor && glowMats.current.length) {
      let targetK = 0;
      if (hovered || selected) targetK = 1;
      else if (state.camera.position.distanceTo(worldPos) < PROXIMITY_RADIUS) {
        targetK = 0.35 + 0.2 * Math.sin(t * 2.2 + phase);
      }
      glowK.current = THREE.MathUtils.damp(glowK.current, targetK, 8, dt);
      const k = glowK.current;
      for (const m of glowMats.current) {
        const rest = m.userData.rest as number;
        const peak = m.userData.peak as number;
        m.emissiveIntensity = rest + (peak - rest) * k;
        m.emissive
          .copy(m.userData.restColor as THREE.Color)
          .lerp(m.userData.glowColor as THREE.Color, k);
      }
    }
  });

  const handleOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    onHover(obj.id);
    document.body.style.cursor = decor ? 'default' : 'pointer';
  };
  const handleOut = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    onHover(null);
    document.body.style.cursor = 'auto';
  };
  const handleDown = (e: ThreeEvent<PointerEvent>) => {
    setDownPos([e.clientX, e.clientY]);
  };
  const handleUp = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    // N'ouvrir le panneau que si le geste n'était pas un drag caméra.
    if (downPos && Math.hypot(e.clientX - downPos[0], e.clientY - downPos[1]) < 6) {
      onSelect(obj);
    }
    setDownPos(null);
  };

  const showLabel = emphasis || selected;

  return (
    <group
      ref={group}
      position={position}
      rotation={[0, rotationY, 0]}
      onPointerOver={handleOver}
      onPointerOut={handleOut}
      onPointerDown={handleDown}
      onPointerUp={handleUp}
    >
      <group ref={floater}>
        {obj.family === 'mechanism' && <MechanismMesh obj={obj} accent={accent} />}
        {obj.family === 'info_carrier' && <InfoMesh id={obj.id} />}
        {obj.family === 'instrument' && <InstrumentMesh id={obj.id} accent={accent} />}
        {obj.family === 'decor' && <DecorMesh id={obj.id} />}
      </group>

      {/* ancrage au sol de l'objet flottant */}
      {obj.family === 'instrument' && (
        <BlobShadow size={[0.9, 0.9]} position={[0, -position[1] + 0.03, 0]} />
      )}

      {/* lumière de contact : modelé immédiat de l'objet inspecté (un seul
          hover à la fois → au plus une lumière supplémentaire dans la scène) */}
      {emphasis && (
        <pointLight position={[0, 1.6, 0.9]} intensity={1.2} distance={2.2} decay={2} color={accent} />
      )}

      {showLabel && (
        // zIndexRange bas : les étiquettes 3D restent SOUS le HUD (z-index ≥ 10).
        <Html position={[0, labelHeight(obj), 0]} center zIndexRange={[8, 0]}>
          <div className="floating-label">
            {obj.name}
            {!decor && <span className="aff">{primaryVerb(obj)}</span>}
          </div>
        </Html>
      )}
    </group>
  );
}

function labelHeight(obj: ClientObjectView): number {
  switch (obj.family) {
    case 'mechanism':
      // La porte à battant (keyhole) est plus haute que les autres mécanismes.
      return obj.controls?.kind === 'keyhole' ? 2.6 : 2.0;
    case 'info_carrier':
      return 0.75;
    case 'instrument':
      return 0.5;
    default:
      return 1.2;
  }
}

// ————————————————————————————————— Voyant d'état —————————————————————————————————

function indicatorColor(state: string): string {
  if (state === 'open' || state === 'activated') return '#7CFC9B';
  if (state === 'locked') return '#ff5d52';
  return '#ffcf5d';
}

/**
 * Voyant d'état d'un mécanisme : couleur fondue (rouge→vert…) + « pop »
 * d'échelle à chaque changement, émission HDR (toneMapped=false) pour rayonner
 * via le Bloom.
 */
function StateIndicator({
  state,
  position,
}: {
  state: string;
  position: [number, number, number];
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const target = useMemo(() => new THREE.Color(indicatorColor(state)), [state]);
  /** −1 = repos, −2 = pop armé (capturé au prochain frame) */
  const popStart = useRef(-1);
  const prev = useRef(state);
  // Couleur initiale FIGÉE : le JSX ne doit jamais réappliquer la couleur
  // (le lerp du useFrame s'en charge).
  const initial = useRef(indicatorColor(state));

  useEffect(() => {
    if (prev.current !== state) {
      prev.current = state;
      popStart.current = -2;
    }
  }, [state]);

  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.05);
    if (popStart.current === -2) popStart.current = clock.elapsedTime;
    if (mat.current) {
      mat.current.color.lerp(target, 1 - Math.exp(-6 * dt));
      mat.current.emissive.copy(mat.current.color);
    }
    if (mesh.current) {
      let s = 1;
      if (popStart.current >= 0) {
        const age = clock.elapsedTime - popStart.current;
        if (age < 0.3) s = 1 + 0.5 * Math.sin((age / 0.3) * Math.PI);
        else popStart.current = -1;
      }
      mesh.current.scale.setScalar(s);
    }
  });

  return (
    <mesh ref={mesh} position={position}>
      <sphereGeometry args={[0.05, 12, 12]} />
      <meshStandardMaterial
        ref={mat}
        color={initial.current}
        emissive={initial.current}
        emissiveIntensity={2.6}
        toneMapped={false}
      />
    </mesh>
  );
}

// ————————————————————————————————— Mécanismes —————————————————————————————————

/**
 * Silhouettes DIFFÉRENCIÉES par type de contrôle (retour joueur : tous les
 * mécanismes avaient la même armoire) : porte à battant (serrure), boîtier
 * mural (code chiffré), console à barillets (code lettres), pupitre à plots
 * (séquence), panneau encadré (surface à révéler).
 */
function MechanismMesh({ obj, accent }: { obj: ClientObjectView; accent: string }) {
  const c = FAMILY_COLORS.mechanism;
  const opened = obj.state === 'open' || obj.state === 'activated';
  const kind = obj.controls?.kind;
  const isLetters = obj.controls?.kind === 'code' && obj.controls.alphabet === 'letters';
  const coffreLarge = hashString(`mech|${obj.id}`) % 2 === 1;

  /** vrai si le gabarit possède un élément mobile SONORE (battant/volet) */
  const animated = kind === 'keyhole' || !(kind === 'sequence' || kind === 'use_target' || isLetters);
  // Angle d'ouverture du battant — ou course de l'aiguille du cadran (sequence).
  const openAngle =
    kind === 'keyhole' ? -1.6 : kind === 'sequence' ? -2.4 : coffreLarge ? -1.4 : -1.2;

  // Battant animé : ouverture progressive (ease-out via damp), initialisé
  // directement dans l'état courant (pas d'animation au chargement d'une
  // partie reprise). Jamais de rotation pilotée par le JSX.
  const doorRef = useRef<THREE.Group>(null);
  const initialOpened = useRef(opened);
  useEffect(() => {
    if (doorRef.current) doorRef.current.rotation.y = initialOpened.current ? openAngle : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useFrame((_, delta) => {
    if (!doorRef.current) return;
    const dt = Math.min(delta, 0.05);
    doorRef.current.rotation.y = THREE.MathUtils.damp(
      doorRef.current.rotation.y,
      opened ? openAngle : 0,
      5,
      dt,
    );
  });

  // Front fermé→ouvert : son mécanique + gerbe de particules de résolution.
  const prevOpened = useRef(opened);
  const [burstSeq, setBurstSeq] = useState(0);
  useEffect(() => {
    if (opened === prevOpened.current) return;
    prevOpened.current = opened;
    if (!opened) return;
    if (animated) playSound(kind === 'keyhole' ? 'door' : 'latch');
    setBurstSeq((s) => s + 1);
  }, [opened, animated, kind]);

  const bodyMark = { glow: { rest: 0, peak: 0.55 } };
  const bodyMat = <meshStandardMaterial color={c.base} metalness={0.6} roughness={0.4} />;

  // Écran de statut des coffres à code : passe au vert HDR (→ Bloom) une fois
  // résolu. toneMapped=false constant : seule l'émission varie (< 1 au repos,
  // donc jamais bloomé fermé).
  const statusScreen = (x: number, y: number, z: number, w: number) =>
    kind === 'code' ? (
      <mesh position={[x, y, z]}>
        <boxGeometry args={[w, 0.09, 0.02]} />
        <meshStandardMaterial
          color={opened ? '#0f3d22' : '#0d2433'}
          emissive={opened ? '#42ff86' : '#1d4a63'}
          emissiveIntensity={opened ? 2.2 : 0.5}
          toneMapped={false}
        />
      </mesh>
    ) : null;

  let body: ReactElement;
  if (kind === 'keyhole') {
    // Serrure : porte haute à gonds ; le battant pivote une fois déverrouillé.
    body = (
      <group>
        <mesh position={[0, 1.15, -0.03]} castShadow receiveShadow userData={bodyMark}>
          <boxGeometry args={[1.18, 2.3, 0.08]} />
          {bodyMat}
        </mesh>
        <group ref={doorRef} position={[-0.5, 1.12, 0.04]}>
          <mesh position={[0.5, 0, 0]} castShadow>
            <boxGeometry args={[0.98, 2.12, 0.09]} />
            <meshStandardMaterial color={c.panel} metalness={0.35} roughness={0.55} />
          </mesh>
          {/* écusson + béquille en L (remplace l'ancienne poignée-boule) */}
          <group position={[0.86, 0, 0]}>
            <mesh position={[0, 0, 0.05]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.07, 0.07, 0.02, 16]} />
              <meshStandardMaterial color={c.metal} metalness={0.7} roughness={0.35} />
            </mesh>
            <mesh position={[0, 0, 0.09]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.02, 0.02, 0.08, 10]} />
              <meshStandardMaterial color={c.metal} metalness={0.8} roughness={0.3} />
            </mesh>
            <mesh position={[-0.06, 0, 0.12]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.018, 0.018, 0.14, 10]} />
              <meshStandardMaterial color={c.metal} metalness={0.8} roughness={0.3} />
            </mesh>
          </group>
        </group>
        {[0.45, 1.8].map((y) => (
          <mesh key={y} position={[-0.52, y, 0.03]}>
            <cylinderGeometry args={[0.035, 0.035, 0.16, 10]} />
            <meshStandardMaterial color={c.metal} metalness={0.8} roughness={0.35} />
          </mesh>
        ))}
        <StateIndicator state={obj.state} position={[0.48, 2.15, 0.06]} />
        <ControlDetail controls={obj.controls} />
      </group>
    );
  } else if (kind === 'sequence') {
    // Pupitre bas au plateau incliné, plots de commande dessus.
    body = (
      <group>
        <mesh position={[0, 0.45, 0]} castShadow receiveShadow userData={bodyMark}>
          <boxGeometry args={[1.3, 0.9, 0.55]} />
          {bodyMat}
        </mesh>
        <mesh position={[0, 0.98, 0.08]} rotation={[-0.5, 0, 0]} castShadow>
          <boxGeometry args={[1.24, 0.5, 0.07]} />
          <meshStandardMaterial color={c.panel} metalness={0.3} roughness={0.6} />
        </mesh>
        {/* cadran à aiguille : l'aiguille (doorRef) pivote à la résolution */}
        <group position={[0, 0.92, -0.14]}>
          <mesh>
            <cylinderGeometry args={[0.16, 0.16, 0.03, 20]} />
            <meshStandardMaterial color="#1a2531" metalness={0.4} roughness={0.5} />
          </mesh>
          {Array.from({ length: 8 }, (_, i) => (
            <mesh
              key={i}
              position={[
                Math.cos((i * Math.PI) / 4) * 0.12,
                0.02,
                Math.sin((i * Math.PI) / 4) * 0.12,
              ]}
            >
              <boxGeometry args={[0.02, 0.01, 0.02]} />
              <meshStandardMaterial color={c.metal} metalness={0.5} roughness={0.4} />
            </mesh>
          ))}
          <group ref={doorRef}>
            <mesh position={[0.06, 0.03, 0]}>
              <boxGeometry args={[0.12, 0.01, 0.02]} />
              <meshStandardMaterial color="#ffcf5d" emissive="#ffcf5d" emissiveIntensity={0.8} />
            </mesh>
          </group>
        </group>
        <StateIndicator state={obj.state} position={[0.55, 1.05, 0.2]} />
        <ControlDetail controls={obj.controls} />
      </group>
    );
  } else if (kind === 'use_target') {
    // Surface encadrée : quelque chose s'y cache, un outil le révélera.
    body = (
      <group>
        <mesh position={[0, 1.2, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.08, 1.5, 0.07]} />
          <meshStandardMaterial color={c.panel} metalness={0.15} roughness={0.8} />
        </mesh>
        {[
          [0, 1.98, 0.01, 1.16, 0.07] as const,
          [0, 0.42, 0.01, 1.16, 0.07] as const,
        ].map(([x, y, z, w, h], i) => (
          <mesh key={`h${i}`} position={[x, y, z]} userData={bodyMark}>
            <boxGeometry args={[w, h, 0.09]} />
            {bodyMat}
          </mesh>
        ))}
        {[-0.575, 0.575].map((x) => (
          <mesh key={`v${x}`} position={[x, 1.2, 0.01]} userData={bodyMark}>
            <boxGeometry args={[0.07, 1.63, 0.09]} />
            {bodyMat}
          </mesh>
        ))}
        <StateIndicator state={obj.state} position={[0.44, 1.85, 0.08]} />
        <ControlDetail controls={obj.controls} />
      </group>
    );
  } else if (isLetters) {
    // Console à barillets de lettres, plateau incliné.
    body = (
      <group>
        <mesh position={[0, 0.55, 0]} castShadow receiveShadow userData={bodyMark}>
          <boxGeometry args={[0.95, 1.1, 0.45]} />
          {bodyMat}
        </mesh>
        {/* barillets de lettres : 4 rouleaux au décalage seedé */}
        <group position={[0, 1.16, 0.12]} rotation={[-0.4, 0, 0]}>
          {Array.from({ length: 4 }, (_, i) => (
            <mesh
              key={i}
              position={[(i - 1.5) * 0.2, 0, 0]}
              rotation={[((hashString(`${obj.id}|b${i}`) % 7) * Math.PI) / 7, 0, Math.PI / 2]}
              castShadow
            >
              <cylinderGeometry args={[0.08, 0.08, 0.16, 12]} />
              <meshStandardMaterial color={c.metal} metalness={0.6} roughness={0.35} />
            </mesh>
          ))}
        </group>
        <StateIndicator state={obj.state} position={[0.4, 1.32, 0.18]} />
        <ControlDetail controls={obj.controls} />
      </group>
    );
  } else if (coffreLarge) {
    // Coffre-armoire trapu sur pieds. Le panneau pivote sur sa CHARNIÈRE
    // (pivot au bord, mesh décalé de la demi-largeur — pas de téléportation).
    body = (
      <group>
        {[-0.4, 0.4].map((px) => (
          <mesh key={px} position={[px, 0.12, 0]}>
            <boxGeometry args={[0.1, 0.24, 0.3]} />
            <meshStandardMaterial color={c.panel} metalness={0.4} roughness={0.6} />
          </mesh>
        ))}
        <mesh position={[0, 0.85, 0]} castShadow receiveShadow userData={bodyMark}>
          <boxGeometry args={[1.05, 1.25, 0.5]} />
          {bodyMat}
        </mesh>
        <group ref={doorRef} position={[-0.45, 0.85, 0.26]}>
          <mesh position={[0.45, 0, 0]}>
            <boxGeometry args={[0.9, 1.08, 0.06]} />
            <meshStandardMaterial color={c.panel} metalness={0.3} roughness={0.6} />
          </mesh>
        </group>
        {statusScreen(0, 1.43, 0.26, 0.4)}
        <StateIndicator state={obj.state} position={[0.42, 1.32, 0.28]} />
        <ControlDetail controls={obj.controls} />
      </group>
    );
  } else {
    body = (
      <group>
        <mesh position={[0, 0.45, 0]} castShadow>
          <boxGeometry args={[0.12, 0.9, 0.12]} />
          <meshStandardMaterial color={c.panel} metalness={0.4} roughness={0.6} />
        </mesh>
        <mesh position={[0, 1.15, 0]} castShadow receiveShadow userData={bodyMark}>
          <boxGeometry args={[0.72, 0.95, 0.32]} />
          {bodyMat}
        </mesh>
        {/* volet frontal sur charnière (s'entrouvre si résolu) */}
        <group ref={doorRef} position={[-0.3, 1.15, 0.17]}>
          <mesh position={[0.3, 0, 0]}>
            <boxGeometry args={[0.6, 0.8, 0.05]} />
            <meshStandardMaterial color={c.panel} metalness={0.3} roughness={0.6} />
          </mesh>
        </group>
        {statusScreen(0, 1.58, 0.175, 0.3)}
        <StateIndicator state={obj.state} position={[0.28, 1.5, 0.19]} />
        <ControlDetail controls={obj.controls} />
      </group>
    );
  }

  return (
    <group>
      <Burst
        sourceId={obj.id}
        seq={burstSeq}
        color="#8dffa8"
        position={[0, kind === 'keyhole' ? 1.4 : 1.1, 0.35]}
        count={70}
      />
      {body}
    </group>
  );
}

function ControlDetail({ controls }: { controls?: MechanismControls }) {
  if (!controls) return null;
  const z = 0.28;
  if (controls.kind === 'code') {
    const cells = Array.from({ length: 9 }, (_, i) => i);
    return (
      <group position={[0, 1.0, z]}>
        {cells.map((i) => {
          const col = i % 3;
          const row = Math.floor(i / 3);
          return (
            <mesh key={i} position={[(col - 1) * 0.16, (1 - row) * 0.16, 0]}>
              <boxGeometry args={[0.12, 0.12, 0.03]} />
              <meshStandardMaterial color="#1a2531" metalness={0.2} roughness={0.7} />
            </mesh>
          );
        })}
      </group>
    );
  }
  if (controls.kind === 'sequence') {
    const n = Math.min(controls.options.length, 5);
    const opts = Array.from({ length: n }, (_, i) => i);
    return (
      <group position={[0, 1.0, z]}>
        {opts.map((i) => (
          <mesh key={i} position={[(i - (n - 1) / 2) * 0.18, 0, 0]}>
            <cylinderGeometry args={[0.06, 0.06, 0.04, 16]} />
            <meshStandardMaterial color="#243447" metalness={0.3} roughness={0.6} />
          </mesh>
        ))}
      </group>
    );
  }
  if (controls.kind === 'keyhole') {
    return (
      <mesh position={[0, 0.9, z]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.08, 12]} />
        <meshStandardMaterial color="#0a0f14" metalness={0.5} roughness={0.5} />
      </mesh>
    );
  }
  if (controls.kind === 'switch') {
    return (
      <mesh position={[0, 1.0, z]} rotation={[0.5, 0, 0]}>
        <boxGeometry args={[0.08, 0.28, 0.08]} />
        <meshStandardMaterial color="#cf5d3a" metalness={0.4} roughness={0.5} />
      </mesh>
    );
  }
  // use_target
  return (
    <mesh position={[0, 1.0, z]}>
      <torusGeometry args={[0.14, 0.03, 10, 24]} />
      <meshStandardMaterial color="#8fa2b3" metalness={0.6} roughness={0.4} />
    </mesh>
  );
}

// ————————————————————————————————— Porteurs d'info —————————————————————————————————

function InfoMesh({ id }: { id: string }) {
  const c = FAMILY_COLORS.info_carrier;
  const variant = useMemo(() => hashString(`info|${id}`) % 3, [id]);
  const paperMark = { glow: { rest: 0, peak: 0.3 } };
  const paperMat = <meshStandardMaterial color={c.paper} roughness={0.9} metalness={0} />;
  const textLines = (w: number, z: number) =>
    [0.08, -0.02, -0.12, -0.22].map((y, i) => (
      <mesh key={i} position={[-0.06, y, z]}>
        <boxGeometry args={[w - i * 0.05, 0.02, 0.01]} />
        <meshStandardMaterial color={c.ink} roughness={0.9} />
      </mesh>
    ));

  if (variant === 1) {
    // Affiche fixée sur panneau haut (lecture debout).
    return (
      <group>
        <mesh position={[0, -0.2, -0.05]}>
          <boxGeometry args={[0.9, 1.9, 0.06]} />
          <meshStandardMaterial color="#233240" roughness={0.8} metalness={0.2} />
        </mesh>
        <mesh position={[0, 0.05, 0]} castShadow userData={paperMark}>
          <boxGeometry args={[0.68, 0.92, 0.03]} />
          {paperMat}
        </mesh>
        <mesh position={[0, 0.42, 0.02]}>
          <boxGeometry args={[0.68, 0.13, 0.02]} />
          <meshStandardMaterial color={c.screen} roughness={0.7} />
        </mesh>
        {textLines(0.48, 0.02)}
      </group>
    );
  }

  if (variant === 2) {
    // Registre épais ouvert sur un support bas.
    return (
      <group>
        <mesh position={[0, -0.45, 0]}>
          <boxGeometry args={[0.75, 0.5, 0.5]} />
          <meshStandardMaterial color="#2a3a48" roughness={0.85} />
        </mesh>
        <group position={[0, -0.14, 0]} rotation={[-0.5, 0, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.82, 0.62, 0.08]} />
            <meshStandardMaterial color="#5b4632" roughness={0.85} />
          </mesh>
          <mesh position={[0, 0, 0.05]} userData={paperMark}>
            <boxGeometry args={[0.74, 0.54, 0.02]} />
            {paperMat}
          </mesh>
          <mesh position={[0, 0, 0.07]}>
            <boxGeometry args={[0.02, 0.54, 0.02]} />
            <meshStandardMaterial color={c.screen} roughness={0.8} />
          </mesh>
        </group>
      </group>
    );
  }

  // Variante 0 : pupitre sur pied (feuille inclinée).
  return (
    <group>
      <mesh position={[0, -0.55, -0.02]}>
        <boxGeometry args={[0.06, 1.1, 0.06]} />
        <meshStandardMaterial color="#20303c" metalness={0.5} roughness={0.5} />
      </mesh>
      <group rotation={[-0.28, 0, 0]}>
        <mesh castShadow userData={paperMark}>
          <boxGeometry args={[0.7, 0.9, 0.04]} />
          {paperMat}
        </mesh>
        <mesh position={[0, 0.33, 0.03]}>
          <boxGeometry args={[0.7, 0.14, 0.02]} />
          <meshStandardMaterial color={c.screen} roughness={0.7} />
        </mesh>
        {textLines(0.5, 0.03)}
      </group>
    </group>
  );
}

// ————————————————————————————————— Instruments —————————————————————————————————

function InstrumentMesh({ id, accent }: { id: string; accent: string }) {
  const c = FAMILY_COLORS.instrument;
  const variant = useMemo(() => hashString(`inst|${id}`) % 3, [id]);
  const bodyMark = { glow: { rest: 0.12, peak: 0.6, color: c.base } };
  // Gemme HDR : émission > 1 + toneMapped=false → rayonne via le Bloom.
  const gemMark = { glow: { rest: 2, peak: 4, color: accent, keep: true } };
  const bodyMat = <meshStandardMaterial color={c.base} metalness={0.7} roughness={0.3} />;
  const gem = (y: number) => (
    <mesh position={[0, y, 0]} userData={gemMark}>
      <sphereGeometry args={[0.07, 16, 16]} />
      <meshStandardMaterial color={accent} toneMapped={false} />
    </mesh>
  );

  if (variant === 1) {
    // Clé / outil allongé : tige + anneau.
    return (
      <group rotation={[0, 0, Math.PI / 5]}>
        <mesh castShadow userData={bodyMark}>
          <cylinderGeometry args={[0.045, 0.045, 0.42, 10]} />
          {bodyMat}
        </mesh>
        <mesh position={[0, 0.26, 0]} rotation={[Math.PI / 2, 0, 0]} userData={bodyMark}>
          <torusGeometry args={[0.09, 0.03, 8, 18]} />
          {bodyMat}
        </mesh>
        {gem(-0.24)}
      </group>
    );
  }
  if (variant === 2) {
    // Boîtier plat (passe, plaque) posé de chant.
    return (
      <group rotation={[0, 0.5, 0]}>
        <mesh castShadow userData={bodyMark}>
          <boxGeometry args={[0.34, 0.24, 0.05]} />
          {bodyMat}
        </mesh>
        {gem(0.2)}
      </group>
    );
  }
  // Variante 0 : bloc compact + gemme.
  return (
    <group>
      <mesh castShadow userData={bodyMark}>
        <boxGeometry args={[0.16, 0.34, 0.16]} />
        {bodyMat}
      </mesh>
      {gem(0.22)}
    </group>
  );
}

// ————————————————————————————————— Décor —————————————————————————————————

function DecorMesh({ id }: { id: string }) {
  const shape = useMemo(() => hashString(id) % 5, [id]);
  const color = FAMILY_COLORS.decor.base;
  if (shape === 0) {
    return (
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.22, 0.28, 1.0, 12]} />
        <meshStandardMaterial color={color} roughness={0.95} metalness={0} />
      </mesh>
    );
  }
  if (shape === 1) {
    return (
      <mesh position={[0, 0.4, 0]}>
        <boxGeometry args={[0.6, 0.8, 0.12]} />
        <meshStandardMaterial color={color} roughness={0.9} metalness={0.05} />
      </mesh>
    );
  }
  if (shape === 2) {
    return (
      <mesh position={[0, 0.35, 0]}>
        <boxGeometry args={[0.5, 0.7, 0.5]} />
        <meshStandardMaterial color={color} roughness={0.95} metalness={0} />
      </mesh>
    );
  }
  if (shape === 3) {
    // Étagère : deux montants + deux planches.
    return (
      <group>
        {[-0.42, 0.42].map((x) => (
          <mesh key={x} position={[x, 0.7, 0]}>
            <boxGeometry args={[0.08, 1.4, 0.34]} />
            <meshStandardMaterial color={color} roughness={0.9} />
          </mesh>
        ))}
        {[0.5, 1.05].map((y) => (
          <mesh key={y} position={[0, y, 0]}>
            <boxGeometry args={[0.92, 0.05, 0.34]} />
            <meshStandardMaterial color={color} roughness={0.9} />
          </mesh>
        ))}
      </group>
    );
  }
  // Pile de caisses décalées.
  return (
    <group>
      <mesh position={[0, 0.26, 0]}>
        <boxGeometry args={[0.62, 0.52, 0.55]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
      <mesh position={[0.12, 0.72, -0.06]} rotation={[0, 0.35, 0]}>
        <boxGeometry args={[0.44, 0.4, 0.42]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
    </group>
  );
}
