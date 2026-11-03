// Post-processing de la scène (chunk séparé « postfx », importé uniquement par
// Scene.tsx — l'écran d'accueil reste sans Three). Stratégie « HDR sélectif » :
// le composer rend en HalfFloat, seuls les matériaux marqués toneMapped=false
// avec une émission > 1 franchissent le seuil du Bloom — les murs et surfaces
// mates passent par le tone mapping ACES et ne rayonnent jamais.
import {
  Bloom,
  BrightnessContrast,
  EffectComposer,
  HueSaturation,
  Vignette,
} from '@react-three/postprocessing';

interface Grading {
  /** rotation de teinte (radians) */
  hue: number;
  /** saturation relative (−1..1) */
  saturation: number;
  /** luminosité relative (−1..1) */
  brightness: number;
  /** contraste relatif (−1..1) */
  contrast: number;
}

/** Étalonnage léger par thème : renforce l'identité sans délaver la scène. */
const GRADING: Record<string, Grading> = {
  laboratoire: { hue: 0, saturation: 0.04, brightness: 0, contrast: 0.07 },
  navire: { hue: 0, saturation: 0.09, brightness: 0, contrast: 0.05 },
  manoir: { hue: 0, saturation: 0.12, brightness: 0.01, contrast: 0.09 },
  bunker: { hue: 0, saturation: -0.05, brightness: 0, contrast: 0.08 },
};

const GRADING_DEFAULT: Grading = { hue: 0, saturation: 0.06, brightness: 0, contrast: 0.05 };

export function SceneEffects({ themeId }: { themeId: string }) {
  const grade = GRADING[themeId] ?? GRADING_DEFAULT;
  return (
    // MSAA matériel (WebGL2 garanti par three ≥ r163) : moins cher qu'une passe
    // SMAA sur GPU intégré, meilleure qualité géométrique.
    <EffectComposer multisampling={4}>
      <Bloom
        mipmapBlur
        intensity={0.55}
        luminanceThreshold={1.0}
        luminanceSmoothing={0.05}
        levels={7}
      />
      <Vignette eskil={false} offset={0.25} darkness={0.65} />
      <HueSaturation hue={grade.hue} saturation={grade.saturation} />
      <BrightnessContrast brightness={grade.brightness} contrast={grade.contrast} />
    </EffectComposer>
  );
}
