// Textures PROCÉDURALES par thème (CanvasTexture générée au runtime, zéro
// asset) : carrelage de labo, lattes de pont, parquet de manoir, béton de
// bunker. Dessinées en NIVEAUX DE GRIS clairs : la teinte vient du matériau
// (map × color), donc la palette par salle continue de s'appliquer.

import * as THREE from 'three';
import { hashString } from '../theme';

/** PRNG déterministe (mulberry32) : même seed → même séquence. */
export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cache = new Map<string, THREE.CanvasTexture>();
const SIZE = 256;

function makeTexture(
  key: string,
  draw: (ctx: CanvasRenderingContext2D, rnd: () => number) => void,
): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  draw(ctx, mulberry(hashString(key)));
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}

const g = (v: number) => `rgb(${v},${v},${v})`;

/** Granulation légère (béton, pierre) par pixels épars. */
function grain(ctx: CanvasRenderingContext2D, rnd: () => number, n: number, lo: number, hi: number) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = g(lo + Math.floor(rnd() * (hi - lo)));
    ctx.fillRect(Math.floor(rnd() * SIZE), Math.floor(rnd() * SIZE), 2, 2);
  }
}

export function floorTexture(themeId: string): THREE.CanvasTexture | null {
  return makeTexture(`floor|${themeId}`, (ctx, rnd) => {
    switch (themeId) {
      case 'laboratoire': {
        // Carrelage : dalles claires, joints nets, quelques dalles ternies.
        ctx.fillStyle = g(215);
        ctx.fillRect(0, 0, SIZE, SIZE);
        const cell = 64;
        for (let y = 0; y < SIZE; y += cell) {
          for (let x = 0; x < SIZE; x += cell) {
            ctx.fillStyle = g(rnd() < 0.18 ? 196 : 210 + Math.floor(rnd() * 14));
            ctx.fillRect(x + 2, y + 2, cell - 4, cell - 4);
          }
        }
        ctx.strokeStyle = g(150);
        ctx.lineWidth = 2;
        for (let p = 0; p <= SIZE; p += cell) {
          ctx.beginPath();
          ctx.moveTo(p, 0);
          ctx.lineTo(p, SIZE);
          ctx.moveTo(0, p);
          ctx.lineTo(SIZE, p);
          ctx.stroke();
        }
        break;
      }
      case 'navire': {
        // Lattes de pont horizontales, rainures sombres, nuances par latte.
        const lath = 32;
        for (let y = 0; y < SIZE; y += lath) {
          ctx.fillStyle = g(185 + Math.floor(rnd() * 40));
          ctx.fillRect(0, y, SIZE, lath);
          ctx.fillStyle = g(130);
          ctx.fillRect(0, y, SIZE, 3);
          // veinage discret
          ctx.strokeStyle = g(165 + Math.floor(rnd() * 20));
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, y + 8 + rnd() * (lath - 12));
          ctx.bezierCurveTo(SIZE * 0.3, y + rnd() * lath, SIZE * 0.7, y + rnd() * lath, SIZE, y + 8 + rnd() * (lath - 12));
          ctx.stroke();
        }
        break;
      }
      case 'manoir': {
        // Parquet : planches verticales larges, joints décalés, tons chauds variés.
        const plank = 52;
        for (let x = 0, col = 0; x < SIZE; x += plank, col++) {
          ctx.fillStyle = g(180 + Math.floor(rnd() * 45));
          ctx.fillRect(x, 0, plank, SIZE);
          ctx.fillStyle = g(120);
          ctx.fillRect(x, 0, 3, SIZE);
          const offset = (col % 2) * (SIZE / 2);
          ctx.fillRect(x, (offset + SIZE / 2) % SIZE, plank, 3);
        }
        break;
      }
      case 'bunker': {
        // Béton : fond neutre, granulation, fissures fines, taches.
        ctx.fillStyle = g(200);
        ctx.fillRect(0, 0, SIZE, SIZE);
        grain(ctx, rnd, 1400, 178, 212);
        ctx.strokeStyle = g(160);
        ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          let x = rnd() * SIZE;
          let y = rnd() * SIZE;
          ctx.moveTo(x, y);
          for (let s = 0; s < 5; s++) {
            x += (rnd() - 0.5) * 90;
            y += (rnd() - 0.5) * 90;
            ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        break;
      }
      default: {
        ctx.fillStyle = g(205);
        ctx.fillRect(0, 0, SIZE, SIZE);
        grain(ctx, rnd, 700, 190, 215);
        break;
      }
    }
  });
}

export function wallTexture(themeId: string): THREE.CanvasTexture | null {
  return makeTexture(`wall|${themeId}`, (ctx, rnd) => {
    ctx.fillStyle = g(212);
    ctx.fillRect(0, 0, SIZE, SIZE);
    switch (themeId) {
      case 'laboratoire': {
        // Panneaux muraux verticaux, joints fins.
        ctx.strokeStyle = g(170);
        ctx.lineWidth = 2;
        for (let x = 0; x <= SIZE; x += 128) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, SIZE);
          ctx.stroke();
        }
        grain(ctx, rnd, 200, 200, 218);
        break;
      }
      case 'navire': {
        // Tôles rivetées : lignes horizontales + points de rivets.
        ctx.strokeStyle = g(165);
        ctx.lineWidth = 2;
        for (let y = 0; y <= SIZE; y += 96) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(SIZE, y);
          ctx.stroke();
          ctx.fillStyle = g(150);
          for (let x = 12; x < SIZE; x += 32) {
            ctx.beginPath();
            ctx.arc(x, y + 8, 2.6, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        break;
      }
      case 'manoir': {
        // Lambris : cadre de moulures en partie basse, frise en partie haute.
        ctx.strokeStyle = g(172);
        ctx.lineWidth = 3;
        ctx.strokeRect(14, SIZE * 0.55, SIZE - 28, SIZE * 0.38);
        ctx.strokeRect(24, SIZE * 0.6, SIZE - 48, SIZE * 0.28);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, SIZE * 0.5);
        ctx.lineTo(SIZE, SIZE * 0.5);
        ctx.stroke();
        break;
      }
      case 'bunker': {
        // Béton banché : lignes de coffrage horizontales + granulation.
        ctx.strokeStyle = g(178);
        ctx.lineWidth = 2;
        for (let y = 0; y <= SIZE; y += 64) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(SIZE, y);
          ctx.stroke();
        }
        grain(ctx, rnd, 900, 185, 214);
        break;
      }
      default:
        grain(ctx, rnd, 400, 198, 216);
        break;
    }
  });
}

/** Ombre « blob » : dégradé radial noir→transparent (voir BlobShadow.tsx). */
export function blobShadowTexture(): THREE.CanvasTexture | null {
  return makeTexture('blob-shadow', (ctx) => {
    ctx.clearRect(0, 0, SIZE, SIZE);
    const grad = ctx.createRadialGradient(SIZE / 2, SIZE / 2, 0, SIZE / 2, SIZE / 2, SIZE / 2);
    grad.addColorStop(0, 'rgba(0,0,0,0.85)');
    grad.addColorStop(0.55, 'rgba(0,0,0,0.38)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SIZE, SIZE);
  });
}

/** Clone repeat-ajusté (≈ une tuile de texture tous les 2,5 m). */
export function repeated(
  tex: THREE.CanvasTexture | null,
  w: number,
  h: number,
): THREE.CanvasTexture | null {
  if (!tex) return null;
  const c = tex.clone();
  c.needsUpdate = true;
  c.repeat.set(Math.max(1, w / 2.5), Math.max(1, h / 2.5));
  return c;
}
