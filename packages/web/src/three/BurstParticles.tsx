// Jaillissement de particules à un événement (déverrouillage de zone, mécanisme
// résolu). Même pattern BufferGeometry que DustParticles : buffer alloué une
// seule fois, invisible au repos (coût nul hors événement). Directions seedées
// par mulberry32 (déterminisme) ; la datation passe par clock.elapsedTime —
// jamais Math.random() ni Date.now().
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { hashString } from '../theme';
import { mulberry } from './textures';

interface Props {
  /** identifiant stable de la source (seed des directions) */
  sourceId: string;
  /** incrémenté à chaque déclenchement ; 0 = jamais déclenché */
  seq: number;
  color: string;
  position?: [number, number, number];
  count?: number;
}

const LIFE = 1.2; // durée de vie (s)
const GRAVITY = -2.5; // m/s²

export function Burst({ sourceId, seq, color, position = [0, 0, 0], count = 90 }: Props) {
  const points = useRef<THREE.Points>(null);
  const velocities = useMemo(() => new Float32Array(count * 3), [count]);
  const positions = useMemo(() => new Float32Array(count * 3), [count]);
  /** instant de départ (clock.elapsedTime) ; −1 = au repos, −2 = armé */
  const startAt = useRef(-1);
  const pendingSeq = useRef(0);

  // Couleur poussée au-delà de 1 : combinée à toneMapped=false, les particules
  // franchissent le seuil du Bloom et rayonnent.
  const hdrColor = useMemo(() => new THREE.Color(color).multiplyScalar(2.2), [color]);

  // Un nouveau seq ARME le burst ; l'initialisation réelle attend le prochain
  // frame pour capturer clock.elapsedTime (pas d'horloge externe).
  useEffect(() => {
    if (seq > 0) {
      pendingSeq.current = seq;
      startAt.current = -2;
    }
  }, [seq]);

  useFrame(({ clock }, delta) => {
    const pts = points.current;
    if (!pts) return;

    if (startAt.current === -2) {
      // (Ré)initialisation seedée : gerbe de directions biaisées vers le haut.
      const rnd = mulberry(hashString(`${sourceId}#${pendingSeq.current}`));
      const attr = pts.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      for (let i = 0; i < count; i++) {
        arr[i * 3] = 0;
        arr[i * 3 + 1] = 0;
        arr[i * 3 + 2] = 0;
        const theta = rnd() * Math.PI * 2;
        const up = 0.35 + rnd() * 0.65;
        const radial = Math.sqrt(Math.max(0, 1 - up * up));
        const speed = 1.5 + rnd() * 1.5;
        velocities[i * 3] = Math.cos(theta) * radial * speed;
        velocities[i * 3 + 1] = up * speed;
        velocities[i * 3 + 2] = Math.sin(theta) * radial * speed;
      }
      attr.needsUpdate = true;
      startAt.current = clock.elapsedTime;
      pts.visible = true;
    }

    if (startAt.current < 0) return;

    const age = clock.elapsedTime - startAt.current;
    if (age > LIFE) {
      startAt.current = -1;
      pts.visible = false;
      return;
    }

    const dt = Math.min(delta, 0.05);
    const attr = pts.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < count; i++) {
      velocities[i * 3 + 1] += GRAVITY * dt;
      arr[i * 3] += velocities[i * 3]! * dt;
      arr[i * 3 + 1] += velocities[i * 3 + 1]! * dt;
      arr[i * 3 + 2] += velocities[i * 3 + 2]! * dt;
    }
    attr.needsUpdate = true;
    (pts.material as THREE.PointsMaterial).opacity = 1 - age / LIFE;
  });

  return (
    <points ref={points} position={position} visible={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.055}
        color={hdrColor}
        transparent
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  );
}
