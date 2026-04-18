import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import toast from 'react-hot-toast'

import { useAuthStore } from '../stores/authStore'

type TourStep = {
  element: string
  popover: {
    title: string
    description: string
    side?: 'top' | 'bottom' | 'left' | 'right'
    align?: 'start' | 'center' | 'end'
    onNextClick?: () => void
  }
}

type RouteTour = {
  title: string
  steps: TourStep[]
}

type SalesTourMode = 'quotation' | 'receipt' | 'invoice' | 'current_account'

const SALES_FLOW_STEPS: TourStep[] = [
  {
    element: '[data-tour-sales-product-search]',
    popover: {
      title: 'Buscá y agregá productos',
      description: 'Escribí código o descripción, seleccioná y cargá cantidades/descuentos.',
      side: 'top',
    },
  },
  {
    element: '[data-tour-sales-product-row="true"]',
    popover: {
      title: 'Seleccioná el producto',
      description:
        'En este ejemplo, al tocar Siguiente te marco este producto automáticamente. Para cargar varios, repetí doble click (o Enter) en otras filas.',
      side: 'top',
    },
  },
  {
    element: '[data-tour-sales-esc-hint]',
    popover: {
      title: 'Abrir configuración',
      description:
        'Cuando termines de marcar uno o varios productos, presioná ESC para abrir el modal “Configurar productos seleccionados”.',
      side: 'top',
    },
  },
  {
    element: '[data-tour-sales-configure-modal]',
    popover: {
      title: 'Modal de configuración',
      description:
        'Este es el paso que querías: ajustás cantidad/descuento y luego confirmás la carga al comprobante.',
      side: 'top',
    },
  },
  {
    element: '[data-tour-sales-add-to-table]',
    popover: {
      title: 'Agregar al carrito',
      description:
        'En este paso, al tocar Siguiente se presiona automáticamente “Agregar al carrito” para completar el ejemplo.',
      side: 'top',
    },
  },
]

const SALES_TOURS_BY_MODE: Record<SalesTourMode, RouteTour> = {
  quotation: {
    title: 'Tour de Ventas · Cotización',
    steps: [
      {
        element: '[data-tour-nav-sales]',
        popover: {
          title: 'Módulo Ventas',
          description: 'Desde acá entrás al flujo principal para cotizar, remitar y facturar.',
          side: 'right',
        },
      },
      {
        element: '[data-tour-sales-client-selector]',
        popover: {
          title: 'Seleccioná cliente',
          description: 'Primero elegí el cliente. Si no existe, podés crearlo al instante.',
          side: 'bottom',
        },
      },
      {
        element: '[data-tour-sales-new-client]',
        popover: {
          title: 'Alta rápida de cliente',
          description: 'Con este botón abrís el alta rápida sin salir de Ventas.',
          side: 'bottom',
        },
      },
      {
        element: '[data-tour-sales-voucher-types]',
        popover: {
          title: 'Tipo de comprobante',
          description:
            'Para este tour trabajamos en Cotización. Requisito mínimo: cliente seleccionado + al menos un producto cargado.',
          side: 'bottom',
        },
      },
      ...SALES_FLOW_STEPS,
      {
        element: '[data-tour-sales-generate]',
        popover: {
          title: 'Generar cotización',
          description: 'Con cliente + productos listos, generás la cotización desde este botón.',
          side: 'left',
        },
      },
    ],
  },
  receipt: {
    title: 'Tour de Ventas · Remito',
    steps: [
      {
        element: '[data-tour-sales-mode-receipt]',
        popover: {
          title: 'Modo Remito',
          description:
            'Antes de emitir remito necesitás: cliente seleccionado + productos cargados. Este botón te deja explícitamente en modo Remito.',
          side: 'top',
        },
      },
      {
        element: '[data-tour-sales-price-toggle]',
        popover: {
          title: 'Remito con/sin precios',
          description:
            'Este toggle define la impresión: Precios ON incluye importes, Precios OFF emite remito solo con detalle y cantidades.',
          side: 'top',
        },
      },
      ...SALES_FLOW_STEPS,
      {
        element: '[data-tour-sales-generate]',
        popover: {
          title: 'Generar remito',
          description: 'Con todo cargado, acá generás el remito (con o sin precios según el toggle).',
          side: 'left',
        },
      },
    ],
  },
  invoice: {
    title: 'Tour de Ventas · Factura',
    steps: [
      {
        element: '[data-tour-sales-voucher-types]',
        popover: {
          title: 'Antes de facturar',
          description:
            'Para Factura tenés que tener cliente con datos fiscales correctos + facturación electrónica habilitada + productos cargados.',
          side: 'bottom',
        },
      },
      {
        element: '[data-tour-sales-client-selector]',
        popover: {
          title: 'Validá cliente fiscal',
          description: 'Chequeá CUIT/DNI, condición IVA y datos necesarios antes de emitir.',
          side: 'bottom',
        },
      },
      ...SALES_FLOW_STEPS,
      {
        element: '[data-tour-sales-generate]',
        popover: {
          title: 'Emitir factura electrónica',
          description: 'Este botón dispara la emisión fiscal electrónica del comprobante.',
          side: 'left',
        },
      },
      {
        element: '[data-tour-sales-bill-pending]',
        popover: {
          title: 'Facturar pendientes',
          description: 'Si ya existe remito/cotización, desde acá lo convertís a factura.',
          side: 'left',
        },
      },
    ],
  },
  current_account: {
    title: 'Tour de Ventas · Cta Cte',
    steps: [
      {
        element: '[data-tour-sales-mode-current-account]',
        popover: {
          title: 'Modo Cuenta Corriente',
          description:
            'Antes de usar Cta Cte necesitás: cliente con CC habilitada + autorización titular/subcliente + remitos pendientes para cerrar.',
          side: 'top',
        },
      },
      {
        element: '[data-tour-sales-price-toggle]',
        popover: {
          title: 'Impresión en Cta Cte',
          description:
            'También aplica acá: Precios ON imprime valores, Precios OFF imprime comprobante sin importes para despacho.',
          side: 'top',
        },
      },
      {
        element: '[data-tour-sales-client-selector]',
        popover: {
          title: 'Cliente apto para Cta Cte',
          description: 'Seleccioná cliente con modo Cuenta Corriente activo (con límite o sin límite).',
          side: 'bottom',
        },
      },
      ...SALES_FLOW_STEPS,
      {
        element: '[data-tour-sales-generate]',
        popover: {
          title: 'Generar comprobante Cta Cte',
          description: 'Con productos listos, generás el comprobante de Cuenta Corriente.',
          side: 'left',
        },
      },
      {
        element: '[data-tour-nav-current-account]',
        popover: {
          title: 'Luego gestionás cierre acá',
          description: 'Para cierre/preview/histórico pasás al módulo Cuenta Corriente del menú lateral.',
          side: 'right',
        },
      },
    ],
  },
}

const TOURS_BY_ROUTE: Record<string, RouteTour> = {
  '/products': {
    title: 'Tour de Productos',
    steps: [
      {
        element: '[data-tour-nav-products]',
        popover: {
          title: 'Catálogo de Productos',
          description: 'Acá administrás todo tu catálogo: altas, bajas, edición e importaciones.',
          side: 'right',
        },
      },
      {
        element: '[data-tour-products-actions]',
        popover: {
          title: 'Acciones rápidas',
          description: 'Tenés import/export Excel, backup SQL y limpieza masiva desde este bloque.',
          side: 'bottom',
        },
      },
      {
        element: '[data-tour-products-import-sql]',
        popover: {
          title: 'Importar SQL',
          description: 'Permite restaurar productos/categorías/proveedores desde backup SQL.',
          side: 'bottom',
        },
      },
      {
        element: '[data-tour-products-new]',
        popover: {
          title: 'Nuevo producto',
          description: 'Alta manual de producto con precio, stock y configuración comercial.',
          side: 'left',
        },
      },
      {
        element: '[data-tour-products-search]',
        popover: {
          title: 'Buscador y filtros',
          description: 'Filtrá por código, descripción, categoría y proveedor.',
          side: 'bottom',
        },
      },
      {
        element: '[data-tour-products-table]',
        popover: {
          title: 'Tabla de productos',
          description: 'Desde acá editás o eliminás y controlás precios/stock.',
          side: 'top',
        },
      },
    ],
  },
  '/price-update': {
    title: 'Tour de Actualización de Precios',
    steps: [
      {
        element: '[data-tour-nav-price-update]',
        popover: {
          title: 'Actualizar Precios',
          description:
            'Este módulo sirve para ajustar precios en lote. Recomendado: definir filtro (categoría/proveedor/búsqueda) antes de editar.',
          side: 'right',
        },
      },
      {
        element: '[data-tour-price-filters-panel]',
        popover: {
          title: 'Paso 1: filtrar productos',
          description:
            'Acotá el universo para no tocar precios incorrectos. Podés combinar categoría, proveedor y texto.',
          side: 'bottom',
        },
      },
      {
        element: '[data-tour-price-search]',
        popover: {
          title: 'Búsqueda rápida',
          description: 'Buscá por código o nombre para trabajar sobre un subconjunto exacto.',
          side: 'bottom',
        },
      },
      {
        element: '[data-tour-price-select-all]',
        popover: {
          title: 'Selección masiva',
          description: 'Este check selecciona todos los productos visibles con los filtros actuales.',
          side: 'top',
        },
      },
      {
        element: '[data-tour-price-drafts]',
        popover: {
          title: 'Borradores',
          description:
            'Guardá y retomá ediciones de precios. Útil cuando hacés cambios grandes en varias tandas.',
          side: 'bottom',
        },
      },
      {
        element: '[data-tour-price-table]',
        popover: {
          title: 'Paso 2: revisar tabla',
          description:
            'Validá precios actuales y stock antes de aplicar cambios. Desde acá confirmás que seleccionaste lo correcto.',
          side: 'top',
        },
      },
      {
        element: '[data-tour-price-update-open]',
        popover: {
          title: 'Actualizar productos',
          description:
            'Este es el botón clave para abrir la edición masiva. En este tour, al tocar Siguiente se abre automáticamente.',
          side: 'top',
        },
      },
      {
        element: '[data-tour-price-modal-quick-actions]',
        popover: {
          title: 'Edición masiva moderna',
          description:
            'Este bloque aplica cambios en lote al conjunto cargado. Si venís filtrando por categoría/proveedor, el impacto será sobre ese grupo.',
          side: 'top',
        },
      },
      {
        element: '[data-tour-price-modal-discount]',
        popover: {
          title: 'Bonificaciones (10+5+2)',
          description:
            'Escribí bonificaciones en cadena. Se aplican a todos los productos abiertos en el modal (por ejemplo toda la categoría/proveedor filtrado).',
          side: 'top',
        },
      },
      {
        element: '[data-tour-price-modal-category]',
        popover: {
          title: 'Campo Categoría',
          description:
            'Acá reasignás la categoría en bloque. Útil para normalizar catálogo cuando importaste productos mezclados.',
          side: 'top',
        },
      },
      {
        element: '[data-tour-price-modal-supplier]',
        popover: {
          title: 'Campo Proveedor',
          description:
            'Mismo concepto: al aplicar proveedor, lo cambia para todos los productos del conjunto actual.',
          side: 'top',
        },
      },
      {
        element: '[data-tour-price-modal-extra-cost]',
        popover: {
          title: 'Cargo Extra %',
          description: 'Suma costo antes de ganancia. Ideal para absorber flete o gastos de reposición.',
          side: 'top',
        },
      },
      {
        element: '[data-tour-price-modal-profit]',
        popover: {
          title: 'Ganancia %',
          description: 'Define el margen comercial que se aplica después del cargo extra.',
          side: 'top',
        },
      },
      {
        element: '[data-tour-price-modal-stock]',
        popover: {
          title: 'Stock en bloque',
          description: 'Te permite actualizar stock inicial para todos los productos de la selección.',
          side: 'top',
        },
      },
      {
        element: '[data-tour-price-modal-formula]',
        popover: {
          title: 'Cómo se calcula el precio final',
          description: 'Seguí la fórmula mostrada acá para entender por qué cambia el P. Final.',
          side: 'top',
        },
      },
      {
        element: '[data-tour-price-modal-save]',
        popover: {
          title: 'Guardar cambios',
          description: 'Cuando terminás, confirmás acá y aplicás la actualización masiva.',
          side: 'top',
        },
      },
    ],
  },
  '/inventory': {
    title: 'Tour de Inventario',
    steps: [
      {
        element: '[data-tour-nav-inventory]',
        popover: {
          title: 'Inventario (qué necesitás antes)',
          description:
            'Antes de crear órdenes, conviene tener proveedores y categorías cargadas para filtrar y generar pedidos correctos.',
          side: 'right',
        },
      },
      {
        element: '[data-tour-inventory-header]',
        popover: {
          title: 'Panel de control de órdenes',
          description:
            'Acá ves rápidamente el estado general del módulo y arrancás el flujo operativo.',
          side: 'bottom',
        },
      },
      {
        element: '[data-tour-inventory-new-order]',
        popover: {
          title: 'Nueva orden',
          description:
            'Iniciá una orden de compra. Requisito: elegir proveedor y productos para calcular costos y PDF.',
          side: 'bottom',
        },
      },
      {
        element: '[data-tour-inventory-filters]',
        popover: {
          title: 'Filtros de órdenes',
          description: 'Filtrá por proveedor, categoría y estado para controlar rápido.',
          side: 'bottom',
        },
      },
      {
        element: '[data-tour-inventory-table]',
        popover: {
          title: 'Listado de órdenes',
          description:
            'Controlás borradores/confirmadas y trazabilidad de cada pedido con estado e importes.',
          side: 'top',
        },
      },
      {
        element: '[data-tour-inventory-action-view]',
        popover: {
          title: 'Ver detalle',
          description: 'Abrí la orden para revisar ítems, costos y edición antes de confirmar.',
          side: 'left',
        },
      },
      {
        element: '[data-tour-inventory-action-preview-pdf]',
        popover: {
          title: 'Previsualizar PDF',
          description: 'Chequeá cómo va a salir el documento de orden antes de descargar o enviar.',
          side: 'left',
        },
      },
      {
        element: '[data-tour-inventory-action-confirm]',
        popover: {
          title: 'Confirmar borrador',
          description:
            'Cuando está todo validado, confirmás la orden y pasa a estado final (ya no editable como borrador).',
          side: 'left',
        },
      },
    ],
  },
  '/clients': {
    title: 'Tour de Clientes (alta para Cuenta Corriente)',
    steps: [
      {
        element: '[data-tour-nav-clients]',
        popover: {
          title: 'Módulo Clientes',
          description: 'Desde acá gestionás padrón y configurás cuenta corriente por cliente.',
          side: 'right',
        },
      },
      {
        element: '[data-tour-clients-new]',
        popover: {
          title: 'Alta de cliente',
          description:
            'Abrí “Nuevo Cliente” y completá datos fiscales. Es requisito para operar Cuenta Corriente.',
          side: 'left',
        },
      },
      {
        element: '[data-tour-clients-search]',
        popover: {
          title: 'Buscador de clientes',
          description: 'Te permite encontrar y editar rápido un cliente existente.',
          side: 'bottom',
        },
      },
      {
        element: '[data-tour-clients-new]',
        popover: {
          title: 'Clave para Cuenta Corriente',
          description:
            'Dentro del modal de alta, configurá “Modo Cuenta Corriente” (Con límite / Sin límite) y guardá.',
          side: 'left',
        },
      },
    ],
  },
  '/current-account': {
    title: 'Tour de Cuenta Corriente',
    steps: [
      {
        element: '[data-tour-nav-current-account]',
        popover: {
          title: 'Cuenta Corriente (requisitos previos)',
          description:
            'Antes de operar acá necesitás: clientes habilitados en CC + remitos de CC generados en Ventas + autorizaciones activas si retira un tercero.',
          side: 'right',
        },
      },
      {
        element: '[data-tour-current-account-auth-section]',
        popover: {
          title: 'Autorizaciones titular/subcliente',
          description:
            'Primero definí quién paga (titular) y quién retira (subcliente autorizado).',
          side: 'top',
        },
      },
      {
        element: '[data-tour-current-account-billing-select]',
        popover: {
          title: 'Titular',
          description: 'Seleccioná el cliente titular de la cuenta corriente.',
          side: 'bottom',
        },
      },
      {
        element: '[data-tour-current-account-operating-select]',
        popover: {
          title: 'Subcliente autorizado',
          description: 'Elegí quién está autorizado para retirar mercadería.',
          side: 'bottom',
        },
      },
      {
        element: '[data-tour-current-account-close-section]',
        popover: {
          title: 'Control de remitos para cierre',
          description: 'Seleccioná remitos a cerrar, revisá total y estado antes de confirmar.',
          side: 'top',
        },
      },
      {
        element: '[data-tour-current-account-preview]',
        popover: {
          title: 'Vista previa',
          description: 'Generá PDF preliminar para validar antes del cierre definitivo.',
          side: 'left',
        },
      },
      {
        element: '[data-tour-current-account-close-all]',
        popover: {
          title: 'Cerrar toda la cuenta',
          description: 'Confirma el cierre y deja el comprobante pendiente para facturación.',
          side: 'left',
        },
      },
    ],
  },
}

function getSalesModeFromDOM(): SalesTourMode {
  const root = document.querySelector('[data-tour-sales-root]') as HTMLElement | null
  const mode = root?.dataset.tourSalesMode as SalesTourMode | undefined
  if (!mode) {
    return 'quotation'
  }

  return mode
}

function resolveTourByPathname(pathname: string): RouteTour | null {
  if (pathname === '/sales' || pathname.startsWith('/sales/')) {
    const mode = getSalesModeFromDOM()
    return SALES_TOURS_BY_MODE[mode] ?? SALES_TOURS_BY_MODE.quotation
  }

  const ordered = Object.entries(TOURS_BY_ROUTE).sort((a, b) => b[0].length - a[0].length)
  const found = ordered.find(([route]) => pathname === route || pathname.startsWith(`${route}/`))
  return found?.[1] ?? null
}

export function useProductTour() {
  const location = useLocation()
  const userId = useAuthStore((state) => state.user?.id)
  const isRunningRef = useRef(false)
  const activeTour = useMemo(() => resolveTourByPathname(location.pathname), [location.pathname])

  const runTour = useCallback(
    (force = false) => {
      const currentTour = resolveTourByPathname(location.pathname)

      if (!currentTour || isRunningRef.current) {
        return
      }

      const viewedKey = userId
        ? `octopus-tour:${userId}:${location.pathname}`
        : `octopus-tour:anon:${location.pathname}`

      if (!force && localStorage.getItem(viewedKey) === 'seen') {
        return
      }

      const deferredSelectors = new Set<string>([
        '[data-tour-sales-configure-modal]',
        '[data-tour-sales-add-to-table]',
        '[data-tour-price-update-open]',
        '[data-tour-price-modal-quick-actions]',
        '[data-tour-price-modal-discount]',
        '[data-tour-price-modal-category]',
        '[data-tour-price-modal-supplier]',
        '[data-tour-price-modal-extra-cost]',
        '[data-tour-price-modal-profit]',
        '[data-tour-price-modal-stock]',
        '[data-tour-price-modal-formula]',
        '[data-tour-price-modal-save]',
      ])

      const runnableSteps = currentTour.steps.filter(
        (step) => document.querySelector(step.element) || deferredSelectors.has(step.element),
      )

      if (runnableSteps.length === 0) {
        return
      }

      isRunningRef.current = true

      let tour: ReturnType<typeof driver> | null = null

      const runtimeSteps = runnableSteps.map((step) => {
        if (step.element === '[data-tour-price-update-open]') {
          return {
            ...step,
            element: '[data-tour-price-update-floating]',
            popover: {
              ...step.popover,
              onNextClick: () => {
                const updateButton = document.querySelector('[data-tour-price-update-floating]')

                if (updateButton instanceof HTMLElement) {
                  updateButton.click()
                }

                window.setTimeout(() => {
                  tour?.moveNext()
                }, 280)
              },
            },
          }
        }

        if (step.element === '[data-tour-price-select-all]') {
          return {
            ...step,
            popover: {
              ...step.popover,
              onNextClick: () => {
                const selectAll = document.querySelector('[data-tour-price-select-all]')
                if (selectAll instanceof HTMLInputElement && !selectAll.checked) {
                  selectAll.click()
                }

                let attempts = 0
                const waitFloatingButton = () => {
                  const floatingButton = document.querySelector('[data-tour-price-update-floating]')
                  if (floatingButton) {
                    tour?.moveNext()
                    return
                  }

                  attempts += 1
                  if (attempts >= 12) {
                    tour?.moveNext()
                    return
                  }

                  window.setTimeout(waitFloatingButton, 120)
                }

                window.setTimeout(waitFloatingButton, 120)
              },
            },
          }
        }

        if (step.element === '[data-tour-sales-product-row="true"]') {
          return {
            ...step,
            popover: {
              ...step.popover,
              onNextClick: () => {
                const selectedRow = document.querySelector('[data-tour-sales-product-row="true"]')
                if (selectedRow instanceof HTMLElement) {
                  selectedRow.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
                }

                window.setTimeout(() => {
                  tour?.moveNext()
                }, 220)
              },
            },
          }
        }

        if (step.element === '[data-tour-sales-add-to-table]') {
          return {
            ...step,
            popover: {
              ...step.popover,
              onNextClick: () => {
                const addButton = document.querySelector('[data-tour-sales-add-to-table]')
                if (addButton instanceof HTMLElement) {
                  addButton.click()
                }

                window.setTimeout(() => {
                  tour?.moveNext()
                }, 260)
              },
            },
          }
        }

        if (step.element !== '[data-tour-sales-esc-hint]') {
          return step
        }

        return {
          ...step,
          popover: {
            ...step.popover,
            onNextClick: () => {
              const escEvent = new KeyboardEvent('keydown', {
                key: 'Escape',
                code: 'Escape',
                bubbles: true,
              })

              window.dispatchEvent(escEvent)
              window.setTimeout(() => {
                tour?.moveNext()
              }, 220)
            },
          },
        }
      })

      tour = driver({
        showProgress: true,
        animate: true,
        allowClose: true,
        overlayClickBehavior: 'close',
        nextBtnText: 'Siguiente',
        prevBtnText: 'Anterior',
        doneBtnText: 'Listo',
        onDestroyed: () => {
          localStorage.setItem(viewedKey, 'seen')
          isRunningRef.current = false
        },
        steps: runtimeSteps as never,
      })

      tour.drive()
    },
    [location.pathname, userId],
  )

  useEffect(() => {
    if (!activeTour) {
      return
    }

    const timeout = window.setTimeout(() => {
      runTour(false)
    }, 700)

    return () => window.clearTimeout(timeout)
  }, [activeTour, runTour])

  const launchCurrentTour = useCallback(() => {
    const currentTour = resolveTourByPathname(location.pathname)

    if (!currentTour) {
      toast('No hay tutorial para esta pantalla todavía', { icon: 'ℹ️' })
      return
    }

    toast.success(`Iniciando: ${currentTour.title}`)
    runTour(true)
  }, [location.pathname, runTour])

  return {
    hasTourForCurrentPage: Boolean(activeTour),
    currentTourTitle: activeTour?.title,
    launchCurrentTour,
  }
}
