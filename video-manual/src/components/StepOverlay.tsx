/**
 * Overlay de paso instructivo que aparece sobre el screenshot.
 * Muestra número de paso, texto explicativo y una flecha/highlight opcional.
 */
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

interface StepOverlayProps {
  /** Número del paso */
  step: number;
  /** Texto principal del paso */
  text: string;
  /** Descripción adicional */
  description?: string;
  /** Posición del panel (top-left, top-right, bottom-left, bottom-right) */
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center-bottom';
  /** Color de acento */
  accentColor?: string;
  /** Coordenadas del punto de interés a destacar (% del ancho/alto) */
  highlight?: { x: number; y: number; width: number; height: number };
  /** Frame en que comienza la animación de entrada */
  startFrame?: number;
}

export const StepOverlay: React.FC<StepOverlayProps> = ({
  step,
  text,
  description,
  position = 'bottom-left',
  accentColor = '#3B82F6',
  highlight,
  startFrame = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const localFrame = frame - startFrame;

  // Entrada del panel
  const panelSpring = spring({
    fps,
    frame: localFrame,
    config: { damping: 14, mass: 0.8 },
    durationInFrames: 20,
  });

  // Posiciones del panel según ubicación
  const positions: Record<string, React.CSSProperties> = {
    'top-left': { top: 24, left: 24 },
    'top-right': { top: 24, right: 24 },
    'bottom-left': { bottom: 24, left: 24 },
    'bottom-right': { bottom: 24, right: 24 },
    'center-bottom': { bottom: 24, left: '50%', transform: 'translateX(-50%)' },
  };

  // Dirección de entrada según posición
  const getEntryTransform = () => {
    const progress = interpolate(panelSpring, [0, 1], [0, 1]);
    if (position === 'bottom-left' || position === 'bottom-right' || position === 'center-bottom') {
      const y = interpolate(progress, [0, 1], [30, 0]);
      return `translateY(${y}px)`;
    }
    const y = interpolate(progress, [0, 1], [-30, 0]);
    return `translateY(${y}px)`;
  };

  const panelOpacity = interpolate(localFrame, [0, 12], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Pulso del highlight
  const pulse = interpolate(
    Math.sin((frame / 30) * Math.PI * 2),
    [-1, 1],
    [0.5, 1]
  );

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {/* Highlight de zona de interés */}
      {highlight && localFrame >= 0 && (
        <div
          style={{
            position: 'absolute',
            left: `${highlight.x}%`,
            top: `${highlight.y}%`,
            width: `${highlight.width}%`,
            height: `${highlight.height}%`,
            border: `3px solid ${accentColor}`,
            borderRadius: 8,
            boxShadow: `0 0 0 ${pulse * 6}px ${accentColor}44, 0 0 20px ${accentColor}66`,
            opacity: panelOpacity,
          }}
        />
      )}

      {/* Panel de paso */}
      <div
        style={{
          position: 'absolute',
          ...positions[position],
          opacity: panelOpacity,
          transform: getEntryTransform(),
          maxWidth: 420,
        }}
      >
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.95)',
            backdropFilter: 'blur(12px)',
            border: `1px solid ${accentColor}44`,
            borderLeft: `4px solid ${accentColor}`,
            borderRadius: 12,
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px ${accentColor}22`,
          }}
        >
          {/* Número de paso */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                backgroundColor: accentColor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <span style={{ color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: 'sans-serif' }}>
                {step}
              </span>
            </div>
            <p
              style={{
                margin: 0,
                color: '#F1F5F9',
                fontSize: 16,
                fontWeight: 600,
                fontFamily: 'sans-serif',
                lineHeight: 1.3,
              }}
            >
              {text}
            </p>
          </div>

          {/* Descripción */}
          {description && (
            <p
              style={{
                margin: 0,
                color: '#94A3B8',
                fontSize: 13,
                fontFamily: 'sans-serif',
                lineHeight: 1.5,
                paddingLeft: 38,
              }}
            >
              {description}
            </p>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};
