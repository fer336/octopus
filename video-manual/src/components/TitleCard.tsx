/**
 * Tarjeta de título con animación de entrada.
 * Usada al inicio de cada video para identificar la sección.
 */
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

interface TitleCardProps {
  /** Ícono emoji de la sección */
  icon: string;
  /** Nombre de la sección */
  title: string;
  /** Descripción breve */
  subtitle: string;
  /** Color de acento (hex) */
  accentColor?: string;
}

export const TitleCard: React.FC<TitleCardProps> = ({
  icon,
  title,
  subtitle,
  accentColor = '#3B82F6',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Entrada del logo Octopus
  const logoSpring = spring({ fps, frame, config: { damping: 12 }, durationInFrames: 30 });
  const logoY = interpolate(logoSpring, [0, 1], [-40, 0]);
  const logoOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });

  // Entrada del ícono de sección
  const iconSpring = spring({ fps, frame: frame - 8, config: { damping: 10 }, durationInFrames: 25 });
  const iconScale = interpolate(iconSpring, [0, 1], [0.3, 1]);
  const iconOpacity = interpolate(frame, [8, 22], [0, 1], { extrapolateRight: 'clamp' });

  // Entrada del título
  const titleSpring = spring({ fps, frame: frame - 16, config: { damping: 14 }, durationInFrames: 25 });
  const titleY = interpolate(titleSpring, [0, 1], [20, 0]);
  const titleOpacity = interpolate(frame, [16, 28], [0, 1], { extrapolateRight: 'clamp' });

  // Entrada del subtítulo
  const subtitleOpacity = interpolate(frame, [24, 36], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      style={{
        background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #0F172A 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0,
      }}
    >
      {/* Barra de acento top */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 6,
          background: `linear-gradient(90deg, ${accentColor}, #8B5CF6)`,
        }}
      />

      {/* Logo OctopusTrack */}
      <div
        style={{
          opacity: logoOpacity,
          transform: `translateY(${logoY}px)`,
          marginBottom: 40,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <span style={{ fontSize: 32 }}>🐙</span>
        <span style={{ color: '#94A3B8', fontSize: 20, fontFamily: 'sans-serif', fontWeight: 600, letterSpacing: 2 }}>
          OCTOPUSTRACK
        </span>
      </div>

      {/* Ícono de sección */}
      <div
        style={{
          opacity: iconOpacity,
          transform: `scale(${iconScale})`,
          fontSize: 80,
          marginBottom: 24,
          filter: 'drop-shadow(0 0 30px rgba(59,130,246,0.4))',
        }}
      >
        {icon}
      </div>

      {/* Título */}
      <h1
        style={{
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
          color: '#F1F5F9',
          fontSize: 52,
          fontFamily: 'sans-serif',
          fontWeight: 800,
          margin: 0,
          textAlign: 'center',
          letterSpacing: -1,
        }}
      >
        {title}
      </h1>

      {/* Línea divisora */}
      <div
        style={{
          width: 80,
          height: 3,
          borderRadius: 2,
          background: accentColor,
          marginTop: 20,
          marginBottom: 20,
          opacity: titleOpacity,
        }}
      />

      {/* Subtítulo */}
      <p
        style={{
          opacity: subtitleOpacity,
          color: '#64748B',
          fontSize: 22,
          fontFamily: 'sans-serif',
          margin: 0,
          textAlign: 'center',
          maxWidth: 600,
          lineHeight: 1.5,
        }}
      >
        {subtitle}
      </p>

      {/* Indicador "Manual de Usuario" */}
      <div
        style={{
          position: 'absolute',
          bottom: 40,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          opacity: subtitleOpacity,
        }}
      >
        <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: accentColor }} />
        <span style={{ color: '#475569', fontSize: 14, fontFamily: 'sans-serif', letterSpacing: 1 }}>
          MANUAL DE USUARIO
        </span>
        <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: accentColor }} />
      </div>
    </AbsoluteFill>
  );
};
