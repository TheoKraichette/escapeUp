// Ombre « blob » : plane portant un dégradé radial noir→transparent, posé sous
// un objet pour l'ancrer visuellement au sol à moindre coût (aucune ombre
// portée GPU nécessaire).
import { useMemo } from 'react';
import { blobShadowTexture } from './textures';

interface Props {
  /** empreinte au sol [largeur, profondeur] (m) */
  size: [number, number];
  position?: [number, number, number];
  opacity?: number;
}

export function BlobShadow({ size, position = [0, 0.03, 0], opacity = 0.35 }: Props) {
  const tex = useMemo(() => blobShadowTexture(), []);
  if (!tex) return null;
  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={size} />
      <meshBasicMaterial map={tex} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}
