// Sonde de visée : détecte l'objet interactif devant le joueur (distance +
// cône) et le remonte au HUD (réticule). Composant SANS rendu, throttlé à
// ~10 Hz, qui ne notifie que sur CHANGEMENT d'objet visé — pas de raycast ni
// de re-rendus React en rafale.
import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { PlacedObject, RoomLayout } from '../layout';

interface Props {
  layout: RoomLayout;
  onAim: (id: string | null) => void;
}

const MAX_DIST = 3.2; // portée de détection (m)
const COS_CONE = Math.cos((16 * Math.PI) / 180); // demi-angle du cône de visée
const PERIOD = 0.1; // s (≈ 10 Hz)

export function AimProbe({ layout, onAim }: Props) {
  const { camera } = useThree();
  const acc = useRef(0);
  const lastId = useRef<string | null>(null);
  const dir = useMemo(() => new THREE.Vector3(), []);
  const to = useMemo(() => new THREE.Vector3(), []);

  // Les objets pris ne sont plus placés (location 'inventory') : le layout ne
  // contient que les objets présents dans la salle.
  const targets = useMemo(
    () => layout.zones.flatMap((z) => z.objects).filter((p) => p.obj.family !== 'decor'),
    [layout],
  );

  useFrame((_, delta) => {
    acc.current += delta;
    if (acc.current < PERIOD) return;
    acc.current = 0;

    camera.getWorldDirection(dir);
    let best: PlacedObject | null = null;
    let bestScore = -Infinity;
    for (const p of targets) {
      // Point visé : ~1,1 m de haut pour les mécanismes (posés au sol),
      // la position réelle pour le reste.
      const aimY = p.obj.family === 'mechanism' ? 1.1 : p.position[1];
      to.set(
        p.position[0] - camera.position.x,
        aimY - camera.position.y,
        p.position[2] - camera.position.z,
      );
      const d = to.length();
      if (d > MAX_DIST || d < 0.001) continue;
      const cos = to.normalize().dot(dir);
      if (cos < COS_CONE) continue;
      // privilégie l'alignement, départage par la distance
      const score = cos - d * 0.02;
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    const id = best?.obj.id ?? null;
    if (id !== lastId.current) {
      lastId.current = id;
      onAim(id);
    }
  });

  return null;
}
