/**
 * Componente que muestra el screenshot de una ventana con zoom suave y efecto de entrada.
 * Es la base visual de todos los videos instructivos.
 */
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig, staticFile } from 'remotion';

interface ScreenCaptureProps {
  src: string;
  /** Zoom final (1.0 = sin zoom, 1.1 = 10% más grande) */
  zoomTo?: number;
  /** Posición X del zoom (0-1, 0.5 = centro) */
  zoomX?: number;
  /** Posición Y del zoom (0-1, 0.5 = centro) */
  zoomY?: number;
}

export const ScreenCapture: React.FC<ScreenCaptureProps> = ({
  src,
  zoomTo = 1.0,
  zoomX = 0.5,
  zoomY = 0.5,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Fade in suave al inicio
  const opacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Zoom progresivo durante el video
  const zoomProgress = spring({
    fps,
    frame,
    config: { damping: 80, mass: 0.5 },
    durationInFrames: durationInFrames,
  });
  const currentZoom = interpolate(zoomProgress, [0, 1], [1, zoomTo]);

  // Punto de origen del zoom
  const originX = zoomX * 100;
  const originY = zoomY * 100;

  return (
    <AbsoluteFill style={{ backgroundColor: '#111827', opacity }}>
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <Img
          src={staticFile(src)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'top left',
            transform: `scale(${currentZoom})`,
            transformOrigin: `${originX}% ${originY}%`,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
