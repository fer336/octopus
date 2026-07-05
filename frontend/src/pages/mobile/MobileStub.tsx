/**
 * Fallback screen for mobile modules not yet ported to native mobile UI.
 * Rendered by MobileShell/MobileDrawer for any route outside the V1 scope
 * (everything except Inicio, Productos, Ventas).
 */
import { useNavigate } from 'react-router-dom'

interface MobileStubProps {
  stubTitle: string
}

export default function MobileStub({ stubTitle }: MobileStubProps) {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col items-center px-7 py-14 text-center">
      <img
        src="/images/logos/logo-header@2x.png"
        alt=""
        className="h-16 w-16 object-contain opacity-90"
        style={{ filter: 'drop-shadow(0 8px 18px rgba(92,58,140,.3))' }}
      />
      <h1 className="font-display mt-5 mb-2 text-2xl font-extrabold" style={{ color: '#121325' }}>
        {stubTitle}
      </h1>
      <p className="max-w-[260px] text-sm leading-relaxed" style={{ color: '#7b6b95' }}>
        Este módulo ya funciona en la versión completa de OctopusTrack. Lo estamos adaptando a
        mobile.
      </p>
      <button
        type="button"
        onClick={() => navigate('/')}
        className="mt-5 rounded-xl px-5 py-3 text-[11.5px] font-bold text-white"
        style={{ background: '#7c5ca8', boxShadow: '0 8px 18px rgba(92,58,140,.35)' }}
      >
        Volver al inicio
      </button>
    </div>
  )
}
