// Confettis de victoire : canvas 2D maison, zéro dépendance. Deux salves
// depuis les coins bas, gravité + traînée + rotation, fondu et arrêt du rAF à
// ~4 s (pas de fuite). Respecte prefers-reduced-motion. PRNG seedé (cohérence
// avec le reste du rendu procédural) ; le temps vient de requestAnimationFrame.
import { useEffect, useRef } from 'react';

const COUNT = 140;
const DURATION = 4000; // ms
const SECOND_SALVO = 600; // départ de la 2e salve (ms)

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function Confetti() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    // Palette : tokens du design + accent de la salle courante.
    const uiAccent = getComputedStyle(document.documentElement)
      .getPropertyValue('--ui-accent')
      .trim();
    const colors = ['#6cd0ff', '#ffd166', '#7CFC9B', '#ffffff', uiAccent || '#6cd0ff'];

    interface Part {
      x: number;
      y: number;
      vx: number;
      vy: number;
      w: number;
      h: number;
      rot: number;
      vr: number;
      color: string;
      delay: number;
    }
    const rnd = mulberry(0xc0ffee);
    const parts: Part[] = [];
    for (let i = 0; i < COUNT; i++) {
      const fromLeft = i % 2 === 0;
      parts.push({
        x: fromLeft ? -10 : canvas.width + 10,
        y: canvas.height * (0.72 + rnd() * 0.22),
        vx: (fromLeft ? 1 : -1) * (3.5 + rnd() * 4.5),
        vy: -(7 + rnd() * 5),
        w: 5 + rnd() * 5,
        h: 3 + rnd() * 4,
        rot: rnd() * Math.PI,
        vr: (rnd() - 0.5) * 0.3,
        color: colors[Math.floor(rnd() * colors.length)]!,
        delay: i < COUNT / 2 ? 0 : SECOND_SALVO,
      });
    }

    let raf = 0;
    let start = -1;
    let prev = -1;
    const step = (now: number) => {
      if (start < 0) {
        start = now;
        prev = now;
      }
      const t = now - start;
      const dt = Math.min((now - prev) / 16.7, 3); // en « frames 60 fps »
      prev = now;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = t > DURATION - 800 ? Math.max(0, (DURATION - t) / 800) : 1;
      for (const p of parts) {
        if (t < p.delay) continue;
        p.vy += 0.18 * dt; // gravité
        p.vx *= Math.pow(0.99, dt); // traînée
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        // hauteur modulée par la rotation : illusion de feuille qui tournoie
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * (0.4 + 0.6 * Math.abs(Math.sin(p.rot * 2))));
        ctx.restore();
      }
      if (t < DURATION) raf = requestAnimationFrame(step);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={canvasRef} className="confetti" />;
}
