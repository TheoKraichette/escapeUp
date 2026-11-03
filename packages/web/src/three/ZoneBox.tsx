import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { PointLight, Mesh, MeshStandardMaterial, CanvasTexture } from 'three';
import type { PlacedZone } from '../layout';
import { NAV } from '../layout';
import type { Palette } from '../theme';
import { Burst } from './BurstParticles';
import { floorTexture, repeated, wallTexture } from './textures';

interface Props {
  zone: PlacedZone;
  palette: Palette;
  /** id du theme pack : habillage identitaire (néons, hublots, lambris…) */
  themeId: string;
  focused: boolean;
  /** ouverture dans le mur −X (voisin de gauche accessible) */
  doorLeft: boolean;
  /** ouverture dans le mur +X (voisin de droite accessible) */
  doorRight: boolean;
  /** nom de la zone verrouillée derrière le mur +X : rend une porte FERMÉE */
  lockedRightLabel?: string | null;
  /** incrémenté quand CETTE zone vient d'être déverrouillée (0 = jamais) */
  pulseSeq?: number;
}

/** Durée du flash lumineux de déverrouillage (s). */
const PULSE_DURATION = 2.2;

/**
 * Une "boîte-pièce" navigable aux DIMENSIONS PROPRES (halfX/halfZ/height varient
 * par pièce — l'enfilade ne se répète plus). Sol, plafond et murs texturés
 * procéduralement par thème ; les murs latéraux (±X) laissent une ouverture de
 * porte vers la pièce voisine.
 */
export function ZoneBox({
  zone,
  palette,
  themeId,
  focused,
  doorLeft,
  doorRight,
  lockedRightLabel = null,
  pulseSeq = 0,
}: Props) {
  const [cx, , cz] = zone.center;
  const hx = zone.halfX;
  const hz = zone.halfZ;
  const h = zone.height;
  const t = NAV.wallThickness;

  // Textures procédurales (clonées avec le bon repeat pour CETTE pièce).
  const floorMap = useMemo(() => repeated(floorTexture(themeId), hx * 2, hz * 2), [themeId, hx, hz]);
  const wallMapZ = useMemo(() => repeated(wallTexture(themeId), hx * 2, h), [themeId, hx, h]);
  const wallMapX = useMemo(() => repeated(wallTexture(themeId), hz * 2, h), [themeId, hz, h]);

  // Flash de déverrouillage : la lampe et la plinthe pulsent ~2 s.
  // Datation sur clock.elapsedTime (même horloge que le useFrame).
  const clock = useThree((s) => s.clock);
  const lampRef = useRef<PointLight>(null);
  const skirtRef = useRef<Mesh>(null);
  const pulseStart = useRef(-1);
  useEffect(() => {
    if (pulseSeq > 0) pulseStart.current = clock.elapsedTime;
  }, [pulseSeq, clock]);

  useFrame(({ clock: c }) => {
    const base = focused ? palette.key * 12 : palette.key * 6;
    let boost = 0;
    let skirtBoost = 0;
    if (pulseStart.current >= 0) {
      const age = c.elapsedTime - pulseStart.current;
      if (age < PULSE_DURATION) {
        const decay = 1 - age / PULSE_DURATION;
        const wave = 0.6 + 0.4 * Math.sin(c.elapsedTime * 14);
        boost = palette.key * 18 * decay * wave;
        // Plinthe poussée en HDR au flash (toneMapped=false) : le Bloom l'attrape.
        skirtBoost = 4 * decay * wave;
      } else {
        pulseStart.current = -1;
      }
    }
    if (lampRef.current) lampRef.current.intensity = base + boost;
    if (skirtRef.current) {
      const m = skirtRef.current.material as MeshStandardMaterial;
      m.emissiveIntensity = (focused ? 1.2 : 0.25) + skirtBoost;
    }
  });

  return (
    <group position={[cx, 0, cz]}>
      {/* sol */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[hx * 2, hz * 2]} />
        <meshStandardMaterial
          color={palette.floor}
          map={floorMap ?? undefined}
          roughness={0.85}
          metalness={0.05}
        />
      </mesh>

      {/* plafond */}
      <mesh position={[0, h, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[hx * 2, hz * 2]} />
        <meshStandardMaterial color={palette.ceiling} roughness={0.95} metalness={0.02} />
      </mesh>

      {/* murs avant/arrière (±Z) : toujours pleins */}
      <mesh position={[0, h / 2, hz]} receiveShadow>
        <boxGeometry args={[hx * 2, h, t]} />
        <meshStandardMaterial
          color={palette.wall}
          map={wallMapZ ?? undefined}
          roughness={0.95}
          metalness={0.02}
        />
      </mesh>
      <mesh position={[0, h / 2, -hz]} receiveShadow>
        <boxGeometry args={[hx * 2, h, t]} />
        <meshStandardMaterial
          color={palette.wall}
          map={wallMapZ ?? undefined}
          roughness={0.95}
          metalness={0.02}
        />
      </mesh>

      {/* mur droit (+X) */}
      <SideWall
        sign={1}
        palette={palette}
        door={doorRight}
        lockedLabel={lockedRightLabel}
        hx={hx}
        hz={hz}
        h={h}
        map={wallMapX}
      />
      {/* mur gauche (−X) */}
      <SideWall sign={-1} palette={palette} door={doorLeft} hx={hx} hz={hz} h={h} map={wallMapX} />

      {/* plinthe d'accent au ras du sol (intensité pilotée par le useFrame) */}
      <mesh ref={skirtRef} position={[0, 0.06, 0]}>
        <boxGeometry args={[hx * 2 - 0.05, 0.12, hz * 2 - 0.05]} />
        <meshStandardMaterial
          color={palette.accent}
          emissive={palette.accent}
          emissiveIntensity={focused ? 1.2 : 0.25}
          transparent
          opacity={0.25}
          toneMapped={false}
        />
      </mesh>

      {/* lampe centrale (teinte identitaire du thème). Seule la pièce COURANTE
          projette des ombres : une unique shadow map cube dans la scène. */}
      <pointLight
        ref={lampRef}
        position={[0, h - 0.6, 0]}
        intensity={focused ? palette.key * 12 : palette.key * 6}
        distance={(hx + hz) * 1.8}
        decay={2}
        color={palette.lamp}
        castShadow={focused}
        shadow-mapSize={[512, 512]}
        shadow-bias={-0.004}
        shadow-camera-near={0.3}
      />

      {/* gerbe de particules au déverrouillage (même déclencheur que le flash) */}
      <Burst
        sourceId={zone.zone.id}
        seq={pulseSeq}
        color={palette.accent}
        position={[0, h * 0.45, 0]}
        count={140}
      />

      {/* lumière d'accent colorée dans un coin : modelé + identité de la salle */}
      <pointLight
        position={[-hx * 0.55, h * 0.45, -hz * 0.55]}
        intensity={palette.key * 2.4}
        distance={(hx + hz) * 0.9}
        decay={2}
        color={palette.accent}
      />

      {/* habillage identitaire du thème */}
      <ThemeDress themeId={themeId} hx={hx} hz={hz} h={h} />

      {/* étiquette de zone au plafond (zIndexRange bas : ne recouvre jamais le HUD) */}
      <Html position={[0, h - 0.25, 0]} center zIndexRange={[8, 0]}>
        <div className="floating-label" style={{ opacity: focused ? 1 : 0.5 }}>
          {zone.zone.name}
        </div>
      </Html>
    </group>
  );
}

/**
 * Habillage 3D identitaire par thème — quelques éléments forts et peu coûteux
 * pour que « labo », « navire », « manoir » et « bunker » se distinguent au
 * premier regard, adaptés aux dimensions de la pièce.
 */
function ThemeDress({ themeId, hx, hz, h }: { themeId: string; hx: number; hz: number; h: number }) {
  switch (themeId) {
    case 'laboratoire':
      // Tubes fluorescents froids au plafond.
      return (
        <group>
          {[-hz * 0.38, hz * 0.38].map((z) => (
            <mesh key={z} position={[0, h - 0.07, z]}>
              <boxGeometry args={[hx * 1.1, 0.07, 0.18]} />
              {/* tube HDR : émission > 1 + toneMapped=false → halo de Bloom */}
              <meshStandardMaterial
                color="#dff2ff"
                emissive="#cfeaff"
                emissiveIntensity={3}
                toneMapped={false}
              />
            </mesh>
          ))}
        </group>
      );
    case 'navire':
      // Hublots en laiton sur le mur du fond, lueur d'abysse derrière le verre.
      return (
        <group>
          {[-hx * 0.55, 0, hx * 0.55].map((x) => (
            <group key={x} position={[x, 2.3, -hz + 0.14]}>
              <mesh>
                <torusGeometry args={[0.42, 0.07, 12, 28]} />
                <meshStandardMaterial color="#c9b169" metalness={0.8} roughness={0.35} />
              </mesh>
              <mesh>
                <circleGeometry args={[0.38, 24]} />
                <meshStandardMaterial color="#0d2b45" emissive="#123c5e" emissiveIntensity={0.8} />
              </mesh>
            </group>
          ))}
        </group>
      );
    case 'manoir':
      // Lambris sombre sur les murs pleins + poutres apparentes au plafond.
      return (
        <group>
          {[1, -1].map((s) => (
            <mesh key={s} position={[0, 0.75, s * (hz - 0.12)]}>
              <boxGeometry args={[hx * 2 - 0.2, 1.5, 0.07]} />
              <meshStandardMaterial color="#3d2b20" roughness={0.85} metalness={0.05} />
            </mesh>
          ))}
          {[-hx * 0.5, 0, hx * 0.5].map((x) => (
            <mesh key={x} position={[x, h - 0.13, 0]}>
              <boxGeometry args={[0.24, 0.26, hz * 2]} />
              <meshStandardMaterial color="#2e211a" roughness={0.9} />
            </mesh>
          ))}
        </group>
      );
    case 'bunker':
      // Bandes de signalisation à mi-hauteur + poutre de béton au plafond.
      return (
        <group>
          {[1, -1].map((s) => (
            <mesh key={s} position={[0, 1.15, s * (hz - 0.12)]}>
              <boxGeometry args={[hx * 2 - 0.2, 0.15, 0.05]} />
              <meshStandardMaterial
                color="#d9b13b"
                emissive="#8a6f1f"
                emissiveIntensity={0.3}
                roughness={0.7}
              />
            </mesh>
          ))}
          <mesh position={[0, h - 0.25, 0]}>
            <boxGeometry args={[0.55, 0.5, hz * 2]} />
            <meshStandardMaterial color="#4a4f52" roughness={0.95} metalness={0.02} />
          </mesh>
        </group>
      );
    default:
      return null;
  }
}

/**
 * Mur latéral (le long de Z) : plein, percé d'une porte OUVERTE (voisin
 * accessible), ou fermé par un BATTANT verrouillé (zone suivante à débloquer).
 */
function SideWall({
  sign,
  palette,
  door,
  lockedLabel = null,
  hx,
  hz,
  h,
  map,
}: {
  sign: 1 | -1;
  palette: Palette;
  door: boolean;
  lockedLabel?: string | null;
  hx: number;
  hz: number;
  h: number;
  map: CanvasTexture | null;
}) {
  const t = NAV.wallThickness;
  const x = sign * hx;
  const color = palette.wall;
  const wallMat = (
    <meshStandardMaterial color={color} map={map ?? undefined} roughness={0.95} metalness={0.02} />
  );

  if (!door && lockedLabel) {
    // Porte FERMÉE : encadrement percé + battant plein + serrure + plaque.
    const dh = NAV.doorHalf;
    const dHeight = NAV.doorHeight;
    const segLen = hz - dh;
    const segCenter = (hz + dh) / 2;
    const lockedAccent = '#b3574d'; // liseré « verrouillé », distinct de l'accent
    return (
      <group>
        <mesh position={[x, h / 2, -segCenter]} receiveShadow>
          <boxGeometry args={[t, h, segLen]} />
          {wallMat}
        </mesh>
        <mesh position={[x, h / 2, segCenter]} receiveShadow>
          <boxGeometry args={[t, h, segLen]} />
          {wallMat}
        </mesh>
        <mesh position={[x, (dHeight + h) / 2, 0]} receiveShadow>
          <boxGeometry args={[t, h - dHeight, dh * 2]} />
          {wallMat}
        </mesh>
        {/* battant fermé, légèrement en retrait — jamais un « trou noir » : teinte
            plus claire + légère auto-illumination, lisible même vu de loin en
            enfilade (hors de portée des lampes de pièce) */}
        <mesh position={[x, dHeight / 2, 0]} receiveShadow castShadow>
          <boxGeometry args={[t * 0.7, dHeight - 0.06, dh * 2 - 0.08]} />
          <meshStandardMaterial
            color={'#36434f'}
            roughness={0.55}
            metalness={0.3}
            emissive={'#1d2833'}
            emissiveIntensity={0.6}
          />
        </mesh>
        {/* applique au-dessus de la porte : signale l'issue verrouillée de loin */}
        <pointLight
          position={[x - sign * 0.9, dHeight + 0.2, 0]}
          intensity={2.2}
          distance={5}
          decay={2}
          color={'#ffd9c7'}
        />
        {/* poignée */}
        <mesh position={[x - sign * (t * 0.5), 1.05, dh * 0.55]}>
          <sphereGeometry args={[0.07, 12, 12]} />
          <meshStandardMaterial color={'#8b96a3'} roughness={0.3} metalness={0.8} />
        </mesh>
        {/* montants « verrouillé » */}
        <mesh position={[x, dHeight / 2, -dh]}>
          <boxGeometry args={[t + 0.02, dHeight, 0.08]} />
          <meshStandardMaterial color={lockedAccent} emissive={lockedAccent} emissiveIntensity={0.35} />
        </mesh>
        <mesh position={[x, dHeight / 2, dh]}>
          <boxGeometry args={[t + 0.02, dHeight, 0.08]} />
          <meshStandardMaterial color={lockedAccent} emissive={lockedAccent} emissiveIntensity={0.35} />
        </mesh>
        {/* plaque : nom de la zone derrière (sous le HUD, comme tout label 3D) */}
        <Html position={[x - sign * 0.25, dHeight + 0.35, 0]} center zIndexRange={[8, 0]}>
          <div className="floating-label locked-label">🔒 {lockedLabel}</div>
        </Html>
      </group>
    );
  }

  if (!door) {
    return (
      <mesh position={[x, h / 2, 0]} receiveShadow>
        <boxGeometry args={[t, h, hz * 2]} />
        {wallMat}
      </mesh>
    );
  }

  const dh = NAV.doorHalf; // demi-largeur ouverture
  const dHeight = NAV.doorHeight; // hauteur ouverture
  const segLen = hz - dh; // longueur d'un pan latéral
  const segCenter = (hz + dh) / 2; // centre Z d'un pan latéral

  return (
    <group>
      {/* pan proche (−Z) */}
      <mesh position={[x, h / 2, -segCenter]} receiveShadow>
        <boxGeometry args={[t, h, segLen]} />
        {wallMat}
      </mesh>
      {/* pan lointain (+Z) */}
      <mesh position={[x, h / 2, segCenter]} receiveShadow>
        <boxGeometry args={[t, h, segLen]} />
        {wallMat}
      </mesh>
      {/* linteau au-dessus de la porte */}
      <mesh position={[x, (dHeight + h) / 2, 0]} receiveShadow>
        <boxGeometry args={[t, h - dHeight, dh * 2]} />
        {wallMat}
      </mesh>
      {/* montants d'accent qui soulignent l'ouverture */}
      <mesh position={[x, dHeight / 2, -dh]}>
        <boxGeometry args={[t + 0.02, dHeight, 0.08]} />
        <meshStandardMaterial color={palette.accent} emissive={palette.accent} emissiveIntensity={0.25} />
      </mesh>
      <mesh position={[x, dHeight / 2, dh]}>
        <boxGeometry args={[t + 0.02, dHeight, 0.08]} />
        <meshStandardMaterial color={palette.accent} emissive={palette.accent} emissiveIntensity={0.25} />
      </mesh>
    </group>
  );
}
