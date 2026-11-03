// Disposition 3D déterministe d'une ClientRoomView.
// Chaque zone accessible devient une "boîte-pièce" ; ses POIs sont répartis
// le long des murs ; les objets sont posés à leur POI. Pur, sans état.

import type { ClientObjectView, ClientRoomView, ClientZoneView } from '@escapeup/engine';
import { hashString } from './theme';

export const ROOM = {
  half: 5, // demi-largeur de RÉFÉRENCE (les pièces varient autour, voir zoneDims)
  height: 4.2,
  gap: 6, // espace entre deux pièces adjacentes
} as const;

export type Vec3 = [number, number, number];

export interface PlacedObject {
  obj: ClientObjectView;
  /** position monde (au sol pour les mécanismes, en hauteur sinon) */
  position: Vec3;
  /** rotation Y pour faire face au centre de la pièce */
  rotationY: number;
}

/** Un point d'intérêt OCCUPÉ : reçoit un meuble-présentoir et son étiquette. */
export interface PlacedPoi {
  id: string;
  name: string;
  /** position monde du meuble */
  x: number;
  z: number;
  /** orientation face au centre de la pièce */
  angle: number;
  /** envergure du groupe d'objets posés (longueur du meuble) */
  span: number;
}

export interface PlacedZone {
  zone: ClientZoneView;
  index: number;
  /** centre monde de la pièce */
  center: Vec3;
  /** demi-largeur (axe X, sens de l'enfilade) — varie par pièce */
  halfX: number;
  /** demi-profondeur (axe Z) — varie par pièce */
  halfZ: number;
  /** hauteur sous plafond — varie par pièce */
  height: number;
  objects: PlacedObject[];
  /** meubles à rendre sous les groupes d'objets */
  pois: PlacedPoi[];
}

/** Dimensions d'une pièce, déterministes (seed + zone) : casse l'uniformité. */
function zoneDims(seed: string, zoneId: string): { halfX: number; halfZ: number; height: number } {
  const h = hashString(`${seed}|dims|${zoneId}`);
  const u = (shift: number) => ((h >>> shift) & 0xff) / 255;
  return {
    halfX: 4.2 + u(0) * 2.0, // 4.2 .. 6.2
    halfZ: 4.2 + u(8) * 2.0,
    height: 3.7 + u(16) * 1.1, // 3.7 .. 4.8
  };
}

export interface RoomLayout {
  zones: PlacedZone[];
  byId: Map<string, PlacedZone>;
  /** nom de la prochaine zone encore verrouillée (porte fermée à afficher), sinon null */
  nextLockedName: string | null;
}

function isPlacedLocation(
  loc: ClientObjectView['location'],
): loc is { zoneId: string; poiId: string } {
  return typeof loc === 'object' && loc !== null && 'zoneId' in loc;
}

/** Angle et rayon d'un POI répartis contre les murs, EN ÉVITANT l'entrée.
 *  L'arc utile fait ~285° centré sur le fond (−Z) : le secteur autour de
 *  z=+halfZ (où le joueur apparaît) reste vide — fini le spawn dans une fiche. */
function poiAnchor(
  poiIndex: number,
  poiCount: number,
  ring: number,
): { x: number; z: number; angle: number } {
  const arc = (285 * Math.PI) / 180;
  const t = poiCount <= 1 ? 0.5 : poiIndex / (poiCount - 1);
  const angle = -Math.PI / 2 + (t - 0.5) * arc;
  return { x: Math.cos(angle) * ring, z: Math.sin(angle) * ring, angle };
}

/** Demi-encombrement au sol d'un objet (pour l'espacement et l'anti-chevauchement). */
function objectRadius(obj: ClientObjectView): number {
  switch (obj.family) {
    case 'mechanism':
      return 0.75;
    case 'decor':
      return 0.45;
    case 'info_carrier':
      return 0.42;
    case 'instrument':
    default:
      return 0.3;
  }
}

/** Rotation pour orienter un objet vers le centre de la pièce. */
function facingCenter(x: number, z: number): number {
  return Math.atan2(-x, -z);
}

function objectHeight(obj: ClientObjectView): number {
  switch (obj.family) {
    case 'mechanism':
      return 0; // posé au sol, sa géométrie gère sa hauteur
    case 'info_carrier':
      return 1.3;
    case 'instrument':
      return 1.05;
    case 'decor':
    default:
      return 0;
  }
}

export function buildLayout(view: ClientRoomView): RoomLayout {
  const accessible = view.zones.filter((z) => z.accessible);

  // Centres cumulés : chaque pièce a SES dimensions, l'enfilade s'adapte.
  const dims = accessible.map((z) => zoneDims(view.seed, z.id));
  const centersX: number[] = [];
  for (let i = 0; i < accessible.length; i++) {
    centersX.push(
      i === 0 ? 0 : centersX[i - 1]! + dims[i - 1]!.halfX + ROOM.gap + dims[i]!.halfX,
    );
  }

  // Index des objets par (zoneId, poiId) pour placer plusieurs objets par POI.
  const zones: PlacedZone[] = accessible.map((zone, index) => {
    const { halfX, halfZ, height } = dims[index]!;
    const center: Vec3 = [centersX[index]!, 0, 0];
    const ring = Math.min(halfX, halfZ) - 1.1;

    const poiPositions = new Map<string, { x: number; z: number; angle: number }>();
    zone.pois.forEach((poi, i) => {
      poiPositions.set(poi.id, poiAnchor(i, zone.pois.length, ring));
    });

    const objectsHere = view.objects.filter((o) => {
      if (!isPlacedLocation(o.location)) return false;
      if (o.location.zoneId !== zone.id) return false;
      if (o.state === 'taken' || o.state === 'hidden') return false;
      if (view.inventory.includes(o.id)) return false;
      return true;
    });

    // Regrouper par POI pour disperser les objets partageant un même point.
    const grouped = new Map<string, ClientObjectView[]>();
    for (const o of objectsHere) {
      const loc = o.location as { zoneId: string; poiId: string };
      const arr = grouped.get(loc.poiId) ?? [];
      arr.push(o);
      grouped.set(loc.poiId, arr);
    }

    const objects: PlacedObject[] = [];
    const placedPois: PlacedPoi[] = [];
    for (const [poiId, list] of grouped) {
      const anchor = poiPositions.get(poiId) ?? poiAnchor(hashString(poiId) % 8, 8, ring);
      placedPois.push({
        id: poiId,
        name: zone.pois.find((p) => p.id === poiId)?.name ?? '',
        x: center[0] + anchor.x,
        z: center[2] + anchor.z,
        angle: facingCenter(anchor.x, anchor.z),
        span: 0, // complété après le calcul des offsets
      });
      // tangente pour étaler les objets d'un même POI le long du mur
      const tangent = { x: -Math.sin(anchor.angle), z: Math.cos(anchor.angle) };
      // Espacement RÉEL : la somme des demi-encombrements voisins (+ marge),
      // pas un pas fixe — une fiche ne rentre plus dans un coffre.
      const offsets: number[] = [];
      let cursor = 0;
      list.forEach((o, k) => {
        if (k > 0) cursor += objectRadius(list[k - 1]!) + objectRadius(o) + 0.25;
        offsets.push(cursor);
      });
      const half = (offsets[offsets.length - 1] ?? 0) / 2;
      placedPois[placedPois.length - 1]!.span = (offsets[offsets.length - 1] ?? 0) + 1.0;
      list.forEach((o, k) => {
        const spread = offsets[k]! - half;
        const x = center[0] + anchor.x + tangent.x * spread;
        const z = center[2] + anchor.z + tangent.z * spread;
        objects.push({
          obj: o,
          position: [x, objectHeight(o), z],
          rotationY: facingCenter(anchor.x, anchor.z),
        });
      });
    }

    // Relaxation anti-chevauchement entre POI voisins : on écarte les paires
    // trop proches (quelques itérations suffisent), en restant dans la pièce.
    for (let iter = 0; iter < 3; iter++) {
      for (let a = 0; a < objects.length; a++) {
        for (let b = a + 1; b < objects.length; b++) {
          const A = objects[a]!;
          const B = objects[b]!;
          const minDist = objectRadius(A.obj) + objectRadius(B.obj) + 0.15;
          let dx = B.position[0] - A.position[0];
          let dz = B.position[2] - A.position[2];
          const d = Math.hypot(dx, dz);
          if (d >= minDist) continue;
          if (d < 1e-4) {
            dx = 1;
            dz = 0;
          } else {
            dx /= d;
            dz /= d;
          }
          const push = (minDist - Math.max(d, 1e-4)) / 2;
          A.position[0] -= dx * push;
          A.position[2] -= dz * push;
          B.position[0] += dx * push;
          B.position[2] += dz * push;
        }
      }
      // Clamp dans les murs de la pièce (marge 0.5).
      for (const o of objects) {
        o.position[0] = Math.min(center[0] + halfX - 0.5, Math.max(center[0] - halfX + 0.5, o.position[0]));
        o.position[2] = Math.min(halfZ - 0.5, Math.max(-halfZ + 0.5, o.position[2]));
      }
    }

    return { zone, index, center, halfX, halfZ, height, objects, pois: placedPois };
  });

  const byId = new Map(zones.map((z) => [z.zone.id, z] as const));
  // Les zones accessibles forment un préfixe (portes en chaîne) : la première
  // zone non accessible est celle derrière la porte fermée de la dernière pièce.
  const nextLocked = view.zones.find((z) => !z.accessible);
  return { zones, byId, nextLockedName: nextLocked?.name ?? null };
}

// ————————————————————————————————— Navigation 1re personne —————————————————————————————————
// Constantes partagées entre le rendu (portes/couloirs) et le contrôleur (collisions),
// pour garantir un alignement parfait et déterministe.

export const NAV = {
  eyeHeight: 1.6, // hauteur des yeux (m)
  wallMargin: 0.4, // marge de collision par rapport aux murs (m)
  doorHalf: 1.5, // demi-largeur de l'ouverture de porte (m)
  doorHeight: 2.8, // hauteur de l'ouverture de porte (m)
  wallThickness: 0.2, // épaisseur visuelle des murs (m)
  speed: 3.4, // vitesse de marche (m/s)
  accel: 9, // lissage d'accélération/inertie
  lookSensitivity: 0.0026, // rad par pixel de glissement
  maxPitch: (75 * Math.PI) / 180, // tangage borné (±75°)
  dragThreshold: 6, // px : au-delà, c'est un « regard » et non un « clic »
} as const;

/** Boîte englobante alignée aux axes, sur le plan XZ. */
export interface AABB {
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
}

export interface Navmesh {
  /** intérieurs pleins des pièces (pour savoir dans quelle pièce est la caméra) */
  rooms: AABB[];
  /** zones marchables : intérieurs rétrécis d'une marge + couloirs de porte */
  walk: AABB[];
}

/** Construit la zone marchable : pièces accessibles + couloirs reliant les pièces adjacentes. */
export function buildNavmesh(layout: RoomLayout): Navmesh {
  const m = NAV.wallMargin;
  const dh = NAV.doorHalf;
  const rooms: AABB[] = [];
  const walk: AABB[] = [];

  for (const z of layout.zones) {
    const cx = z.center[0];
    rooms.push({ xMin: cx - z.halfX, xMax: cx + z.halfX, zMin: -z.halfZ, zMax: z.halfZ });
    walk.push({
      xMin: cx - z.halfX + m,
      xMax: cx + z.halfX - m,
      zMin: -z.halfZ + m,
      zMax: z.halfZ - m,
    });
  }

  for (let i = 0; i < layout.zones.length - 1; i++) {
    const a = layout.zones[i];
    const b = layout.zones[i + 1];
    if (!a || !b) continue;
    walk.push({
      xMin: a.center[0] + a.halfX - m, // recouvre l'intérieur de la pièce i
      xMax: b.center[0] - b.halfX + m, // recouvre l'intérieur de la pièce i+1
      zMin: -(dh - m),
      zMax: dh - m,
    });
  }

  return { rooms, walk };
}

/** La position (x,z) est-elle dans une zone marchable ? */
export function isWalkable(nav: Navmesh, x: number, z: number): boolean {
  for (const a of nav.walk) {
    if (x >= a.xMin && x <= a.xMax && z >= a.zMin && z <= a.zMax) return true;
  }
  return false;
}

/** Index de la pièce contenant (x,z), ou -1 si dans un couloir / dehors. */
export function zoneIndexAt(nav: Navmesh, x: number, z: number): number {
  for (let i = 0; i < nav.rooms.length; i++) {
    const a = nav.rooms[i];
    if (a && x >= a.xMin && x <= a.xMax && z >= a.zMin && z <= a.zMax) return i;
  }
  return -1;
}

export interface Entrance {
  x: number;
  z: number;
  yaw: number;
}

/** Point d'entrée d'une pièce : près du mur avant (+Z), regard tourné vers le
 *  centre — reculé de 1,6 m, dans le secteur que les POI laissent libre. */
export function entranceFor(layout: RoomLayout, index: number): Entrance {
  const zone = layout.zones[index] ?? layout.zones[0];
  const cx = zone?.center[0] ?? 0;
  return { x: cx, z: (zone?.halfZ ?? ROOM.half) - 1.6, yaw: 0 };
}
