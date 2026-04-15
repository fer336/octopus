/**
 * Página placeholder de Cuenta Corriente.
 * Se habilita visualmente por feature flag desde CMS.
 */
import { ClipboardList, Construction } from 'lucide-react'

export default function CurrentAccount() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-primary-100 dark:bg-primary-900/30 p-2">
          <ClipboardList className="text-primary-600 dark:text-primary-300" size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Cuenta Corriente</h1>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Módulo habilitado desde CMS. Diseño y flujo operativo en construcción.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/20 p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-primary-100 dark:bg-primary-800/40 p-2">
            <Construction className="text-primary-600 dark:text-primary-300" size={18} />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              Próximo paso: construcción funcional de Cuenta Corriente
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              Vamos a implementar tabla de clientes, remitos retirados y flujo de cierre/liquidación
              según el modo configurado en CMS (automático/manual).
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
