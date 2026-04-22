/**
 * Página de Comprobantes.
 * Visualiza cotizaciones, remitos y facturas generadas.
 */
import { useState } from 'react'
import { FileText, Truck, Receipt, Search, Eye, Download, Trash2, AlertTriangle, RotateCcw, FileMinus, ExternalLink, Pencil, ChevronDown } from 'lucide-react'
import { Button, Table, Pagination, Select, Modal, Input } from '../components/ui'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import vouchersService, { type Voucher, type VoucherPayment } from '../api/vouchersService'
import arcaService from '../api/arcaService'
import businessService from '../api/businessService'
import { usePaymentMethods } from '../hooks/usePaymentMethods'
import CreditNoteModal from '../components/vouchers/CreditNoteModal'
import toast from 'react-hot-toast'
import { formatErrorMessage } from '../utils/errorHelpers'

type VoucherListItem = Voucher

const getCurrentAccountClosureLockInfo = (voucher: VoucherListItem): { isLocked: boolean; reason: string } => {
  const isClosureVoucher = !!voucher.is_current_account_closure
  const isLinkedReceiptByBackendFlag = !!voucher.is_receipt_linked_to_current_account_closure
  const isLinkedReceiptByClosureId = !!voucher.current_account_closure_voucher_id
  const isLinkedReceiptByLegacyHeuristic =
    voucher.voucher_type === 'receipt' && voucher.is_current_account === true && !!voucher.invoiced_voucher_id

  const isLocked =
    isClosureVoucher ||
    isLinkedReceiptByBackendFlag ||
    isLinkedReceiptByClosureId ||
    isLinkedReceiptByLegacyHeuristic

  if (!isLocked) {
    return { isLocked: false, reason: '' }
  }

  if (isClosureVoucher) {
    return {
      isLocked: true,
      reason: 'Bloqueado: comprobante de cierre de Cuenta Corriente',
    }
  }

  return {
    isLocked: true,
    reason: 'Bloqueado: remito incluido en un cierre de Cuenta Corriente',
  }
}

const voucherTypeLabels: Record<string, { label: string; textClass: string; icon: any }> = {
  quotation:      { label: 'Cotización',      textClass: 'text-primary-600 dark:text-primary-400',   icon: FileText  },
  receipt:        { label: 'Remito',           textClass: 'text-orange-600 dark:text-orange-400', icon: Truck     },
  invoice_a:      { label: 'Factura A',        textClass: 'text-green-600 dark:text-green-400',  icon: Receipt   },
  invoice_b:      { label: 'Factura B',        textClass: 'text-green-600 dark:text-green-400',  icon: Receipt   },
  invoice_c:      { label: 'Factura C',        textClass: 'text-green-600 dark:text-green-400',  icon: Receipt   },
  credit_note_a:  { label: 'Nota de Crédito A', textClass: 'text-red-600 dark:text-red-400',  icon: FileMinus },
  credit_note_b:  { label: 'Nota de Crédito B', textClass: 'text-red-600 dark:text-red-400',  icon: FileMinus },
  credit_note_c:  { label: 'Nota de Crédito C', textClass: 'text-red-600 dark:text-red-400',  icon: FileMinus },
  debit_note_a:   { label: 'Nota de Débito A',  textClass: 'text-primary-600 dark:text-primary-400', icon: FileMinus },
  debit_note_b:   { label: 'Nota de Débito B',  textClass: 'text-primary-600 dark:text-primary-400', icon: FileMinus },
  debit_note_c:   { label: 'Nota de Débito C',  textClass: 'text-primary-600 dark:text-primary-400', icon: FileMinus },
}

const statusLabels: Record<string, { label: string; className: string }> = {
  draft: { label: 'Borrador', className: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400' },
  confirmed: { label: 'Confirmado', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  cancelled: { label: 'Anulado', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
}

export default function Vouchers() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: business } = useQuery({
    queryKey: ['business-me-vouchers'],
    queryFn: () => businessService.getMyBusiness(),
    staleTime: 60_000,
  })
  const invoicingEnabled = business?.invoicing_enabled ?? true
  const receiptsEnabled = business?.receipts_enabled ?? true
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPaymentMethod, setFilterPaymentMethod] = useState('')
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [voucherToDelete, setVoucherToDelete] = useState<VoucherListItem | null>(null)
  const [deleteReason, setDeleteReason] = useState('')
  const [deleteReasonError, setDeleteReasonError] = useState('')
  const [showCreditNoteModal, setShowCreditNoteModal] = useState(false)
  const [selectedVoucherForNC, setSelectedVoucherForNC] = useState<any>(null)
  const [selectedQuotationIds, setSelectedQuotationIds] = useState<string[]>([])
const [showCompileModal, setShowCompileModal] = useState(false)
  const [compileSelectedPaymentMethodId, setCompileSelectedPaymentMethodId] = useState<string | null>(null)
  const [compilePaymentReferences, setCompilePaymentReferences] = useState<Record<string, string>>({})
  const [compileGeneralDiscount, setCompileGeneralDiscount] = useState<string>('0')
  const [compilePaymentError, setCompilePaymentError] = useState<string>('')
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null)

  // Query para comprobantes
  const { data: vouchersData, isLoading, error } = useQuery({
    queryKey: ['vouchers', page, search, filterType, filterStatus, filterPaymentMethod],
    queryFn: () => vouchersService.getAll({ 
      page, 
      per_page: 20, 
      search,
      voucher_type: filterType || undefined,
      status: filterStatus || undefined,
      payment_method_id: filterPaymentMethod || undefined,
    }),
    retry: false,
  })

  const vouchers = vouchersData?.items || []
  const paymentMethods = usePaymentMethods(false).data || []
  const sourceParentInvoiceIds = new Set(
    vouchers
      .filter(
        (v) =>
          (v.voucher_type === 'quotation' || v.voucher_type === 'receipt') &&
          !!v.invoiced_voucher_id,
      )
      .map((v) => v.invoiced_voucher_id as string),
  )
  const hasCompiledSources = (voucher: VoucherListItem) => {
    if (!voucher.voucher_type?.startsWith('invoice_')) return false
    if (sourceParentInvoiceIds.has(voucher.id)) return true
    const notes = (voucher.notes || '').toLowerCase()
    return notes.includes('facturado desde cotizaciones') || notes.includes('facturado desde remito') || notes.includes('facturado desde remitos')
  }

  // Query para cotizaciones origen de una factura expandida
  const { data: sourceQuotations, isFetching: isSourceQuotationsFetching } = useQuery({
    queryKey: ['voucher-source-quotations', expandedInvoiceId],
    queryFn: () =>
      expandedInvoiceId
        ? vouchersService.getSourceQuotations(expandedInvoiceId)
        : Promise.resolve([]),
    enabled: !!expandedInvoiceId,
    retry: false,
  })

  // Mutation para eliminar comprobante
  const deleteMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      vouchersService.delete(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vouchers'] })
      toast.success('Comprobante eliminado correctamente', { icon: '✅' })
      setShowDeleteModal(false)
      setVoucherToDelete(null)
      setDeleteReason('')
      setDeleteReasonError('')
    },
    onError: (error: any) => {
      toast.error(formatErrorMessage(error))
    },
  })

  const compileMutation = useMutation({
    mutationFn: ({ quotationIds, payments, general_discount }: { quotationIds: string[]; payments: VoucherPayment[]; general_discount?: number }) =>
      vouchersService.compileToInvoice(quotationIds, payments, general_discount),
    onSuccess: async (invoice: any) => {
      queryClient.invalidateQueries({ queryKey: ['vouchers'] })
      setShowCompileModal(false)
      setSelectedQuotationIds([])
      setCompileSelectedPaymentMethodId(null)
      setCompilePaymentReferences({})
      setCompileGeneralDiscount('0')
      setCompilePaymentError('')
      toast.success('Factura generada correctamente', { icon: '✅' })

      if (invoice?.voucher_type?.startsWith('invoice_')) {
        toast.loading('Emitiendo factura electrónica en ARCA/AFIP...', {
          id: 'emitting-compiled-invoice',
        })
        try {
          const emitResponse = await arcaService.emitInvoice({ voucher_id: invoice.id })
          if (emitResponse.success) {
            toast.success(`Factura ARCA emitida\nCAE: ${emitResponse.cae}`, {
              id: 'emitting-compiled-invoice',
              duration: 5000,
              icon: '🎉',
            })
          } else {
            toast.error(`Error ARCA: ${emitResponse.message}`, {
              id: 'emitting-compiled-invoice',
              duration: 7000,
            })
          }
        } catch (emitError: any) {
          toast.error(
            `Error al emitir en ARCA: ${emitError?.response?.data?.detail || emitError?.message || 'Error desconocido'}`,
            { id: 'emitting-compiled-invoice', duration: 7000 },
          )
        }
      }

      // Descargar PDF
      try {
        const pdfBlob = await vouchersService.getPdf(invoice.id)
        const pdfUrl = URL.createObjectURL(pdfBlob)
        window.open(pdfUrl, '_blank')
        setTimeout(() => URL.revokeObjectURL(pdfUrl), 10000)
      } catch {
        toast.error('Factura creada pero no se pudo abrir el PDF')
      }
    },
    onError: (error: any) => {
      toast.error(formatErrorMessage(error))
    },
  })

  const handleConfirmDelete = () => {
    if (!voucherToDelete) {
      return
    }

    const trimmedReason = deleteReason.trim()
    if (!trimmedReason) {
      setDeleteReasonError('El motivo de eliminación es obligatorio.')
      return
    }

    setDeleteReasonError('')
    deleteMutation.mutate({
      id: voucherToDelete.id,
      reason: trimmedReason,
    })
  }

  const handleViewPdf = async (voucherId: string) => {
    try {
      const pdfBlob = await vouchersService.getPdf(voucherId)
      const pdfUrl = URL.createObjectURL(pdfBlob)
      window.open(pdfUrl, '_blank')
      
      // Limpiar después de 10 segundos
      setTimeout(() => URL.revokeObjectURL(pdfUrl), 10000)
    } catch (error) {
      console.error('Error al abrir PDF:', error)
      toast.error(`Error al abrir el PDF: ${formatErrorMessage(error)}`)
    }
  }

  // Mapa de ID → número formateado, construido desde los items cargados
  const voucherNumberMap: Record<string, string> = {}
  if (vouchersData?.items) {
    for (const v of vouchersData.items) {
      voucherNumberMap[v.id] = `${v.sale_point}-${v.number}`
    }
  }

  const handleViewRelatedPdf = async (relatedId: string) => {
    try {
      const pdfBlob = await vouchersService.getPdf(relatedId)
      const pdfUrl = URL.createObjectURL(pdfBlob)
      window.open(pdfUrl, '_blank')
      setTimeout(() => URL.revokeObjectURL(pdfUrl), 10000)
    } catch (error) {
      toast.error(`No se pudo abrir el comprobante relacionado: ${formatErrorMessage(error)}`)
    }
  }

  const handleDownloadPdf = async (voucherId: string, voucherNumber: string) => {
    try {
      const pdfBlob = await vouchersService.getPdf(voucherId)
      const pdfUrl = URL.createObjectURL(pdfBlob)
      const link = document.createElement('a')
      link.href = pdfUrl
      link.download = `comprobante-${voucherNumber}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      // Limpiar
      setTimeout(() => URL.revokeObjectURL(pdfUrl), 1000)
    } catch (error) {
      console.error('Error al descargar PDF:', error)
      toast.error(`Error al descargar el PDF: ${formatErrorMessage(error)}`)
    }
  }

  const handleEditQuotation = (voucher: any) => {
    const isQuotation = voucher.voucher_type === 'quotation'
    const isInvoiced = !!voucher.invoiced_voucher_id
    if (!isQuotation || isInvoiced || voucher.is_current_account_closure) {
      toast.error('Solo podés editar cotizaciones pendientes de facturar')
      return
    }

    if (!voucher.client) {
      toast.error('No se pudo cargar el cliente de la cotización')
      return
    }

    const payload = {
      id: voucher.id,
      voucher_type: 'quotation' as const,
      client: voucher.client,
      date: voucher.date,
      notes: voucher.notes,
      show_prices: voucher.show_prices,
      items: (voucher.items || []).map((item: any) => ({
        id: item.product_id,
        code: item.code,
        description: item.description,
        sale_price: Number(item.unit_price) || 0,
        quantity: Number(item.quantity) || 1,
        discount: Number(item.discount_percent) || 0,
      })),
      general_discount: Number(voucher.general_discount) || 0,
    }

    sessionStorage.setItem('sales-edit-voucher', JSON.stringify(payload))
    navigate('/sales')
  }

  const getExpandedSourceRows = (invoice: VoucherListItem): VoucherListItem[] => {
    const isExpandedInvoice =
      invoice.voucher_type?.startsWith('invoice_') && expandedInvoiceId === invoice.id

    if (!isExpandedInvoice || !sourceQuotations || sourceQuotations.length === 0) {
      return []
    }

    return sourceQuotations.map((sq: any) => {
      const fromTable = vouchers.find((v) => v.id === sq.id)
      if (fromTable) {
        return fromTable
      }

      return ({
        id: sq.id,
        voucher_type: sq.voucher_type || 'quotation',
        sale_point: sq.code?.split('-')[0] || '0001',
        number: sq.code?.split('-')[1] || sq.code,
        date: sq.date,
        client: undefined,
        client_id: sq.client_name || '',
        status: 'confirmed',
        total: Number(sq.total || 0),
        subtotal: Number(sq.total || 0),
        iva_amount: 0,
        notes: null,
        invoiced_voucher_id: invoice.id,
        has_credit_note: false,
        items: [],
        deleted_at: null,
        is_current_account: false,
        is_current_account_closure: false,
        billing_client: null,
        operating_client: null,
        is_withdrawal_authorized: false,
        withdrawal_client_name: null,
      } as unknown) as VoucherListItem
    })
  }

  const renderTreeCell = (
    item: VoucherListItem,
    parentNode: any,
    renderChildNode: (child: VoucherListItem) => any,
  ) => {
    const isExpandedInvoice =
      item.voucher_type?.startsWith('invoice_') && expandedInvoiceId === item.id

    if (!isExpandedInvoice) {
      return <>{parentNode}</>
    }

    const childRows = getExpandedSourceRows(item)

    return (
      <div className="space-y-1">
        <div>{parentNode}</div>
        <div className="mt-1 pl-2 border-l-2 border-indigo-300/90 dark:border-indigo-700/90 space-y-1">
          {isSourceQuotationsFetching ? (
            <span className="text-[11px] text-indigo-600 dark:text-indigo-300">
              Cargando cotizaciones...
            </span>
          ) : childRows.length > 0 ? (
            childRows.map((child, index) => (
              <div key={child.id} className="relative rounded-md bg-indigo-50/40 dark:bg-indigo-900/10 py-0.5">
                <span className="absolute -left-2 top-1/2 -translate-y-1/2 w-2 h-px bg-indigo-300 dark:bg-indigo-700" />
                {index === childRows.length - 1 && (
                  <span className="absolute -left-2 top-1/2 h-[calc(50%+8px)] w-px bg-white dark:bg-gray-900" />
                )}
                <div className="pl-2">{renderChildNode(child)}</div>
              </div>
            ))
          ) : (
            <span className="text-[11px] text-gray-500 dark:text-gray-400">
              Sin cotizaciones asociadas
            </span>
          )}
        </div>
      </div>
    )
  }

  const columns = [
    {
      key: 'checkbox',
      header: (
        <input
          type="checkbox"
          className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          checked={
            (() => {
              const selectableIds = vouchers
                .filter(
                  (v) =>
                    (v.voucher_type === 'quotation' || v.voucher_type === 'receipt') &&
                    !v.invoiced_voucher_id,
                )
                .map((v) => v.id)
              return (
                selectableIds.length > 0 &&
                selectableIds.every((id) => selectedQuotationIds.includes(id))
              )
            })()
          }
          onChange={(e) => {
            if (e.target.checked) {
              const selectables = vouchers
                .filter(
                  (v) =>
                    (v.voucher_type === 'quotation' || v.voucher_type === 'receipt') &&
                    !v.invoiced_voucher_id,
                )
                .map((v) => v.id)
              setSelectedQuotationIds(selectables)
            } else {
              setSelectedQuotationIds([])
            }
          }}
        />
      ),
      className: 'w-10',
      render: (item: VoucherListItem) => {
        const isSelectable =
          (item.voucher_type === 'quotation' || item.voucher_type === 'receipt') &&
          !item.invoiced_voucher_id
        if (!isSelectable) return null
        return (
          <input
            type="checkbox"
            className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            checked={selectedQuotationIds.includes(item.id)}
            onChange={() => {
              setSelectedQuotationIds((prev) =>
                prev.includes(item.id)
                  ? prev.filter((id) => id !== item.id)
                  : [...prev, item.id],
              )
            }}
          />
        )
      },
    },
    {
      key: 'type',
      header: 'Tipo',
       render: (item: VoucherListItem) => {
        const typeInfo = voucherTypeLabels[item.voucher_type] || { label: item.voucher_type, textClass: 'text-gray-600 dark:text-gray-400', icon: FileText }
        const Icon = typeInfo.icon
        const isInvoiced = (item.voucher_type === 'quotation' || item.voucher_type === 'receipt') && item.invoiced_voucher_id
        const isCCClosure = !!item.is_current_account_closure
        const closureLockInfo = getCurrentAccountClosureLockInfo(item)
        const hasCreditNote = item.voucher_type?.startsWith('invoice_') && item.has_credit_note
        const isCreditNote = item.voucher_type?.startsWith('credit_note_')
        const parentNode = (
          <div className="flex items-center gap-2 flex-wrap">
            <Icon size={16} className={`${typeInfo.textClass} shrink-0`} />
            <span className={`text-xs font-medium ${typeInfo.textClass}`}>
              {typeInfo.label}
            </span>
            {isInvoiced && (
              <span
                title="Este comprobante ya fue facturado"
                className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-600 text-white text-[10px] font-bold leading-none shrink-0"
              >
                F
              </span>
            )}
            {isCCClosure && (
              <span
                title="Cierre de Cuenta Corriente"
                className="inline-flex items-center px-1.5 h-5 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 border border-violet-300 dark:border-violet-700 text-[9px] font-bold leading-none shrink-0"
              >
                Cierre CC
              </span>
            )}
            {closureLockInfo.isLocked && (
              <span
                title={closureLockInfo.reason}
                className="inline-flex items-center gap-1 px-1.5 h-5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-700 text-[9px] font-bold leading-none shrink-0"
              >
                <AlertTriangle size={10} />
                Bloq. CC
              </span>
            )}
            {hasCreditNote && (
              <span
                title="Tiene una Nota de Crédito asociada"
                className="inline-flex items-center px-1.5 h-5 rounded-full bg-red-500 text-white text-[9px] font-bold leading-none shrink-0"
              >
                NC
              </span>
            )}
            {isCreditNote && (
              <span
                title="Nota de Crédito Fiscal"
                className="inline-flex items-center px-1.5 h-5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-700 text-[9px] font-bold leading-none shrink-0"
              >
                NC
              </span>
            )}
          </div>
        )

        return renderTreeCell(item, parentNode, (child) => {
          const childInfo =
            voucherTypeLabels[child.voucher_type] || {
              label: child.voucher_type,
              textClass: 'text-gray-600 dark:text-gray-400',
              icon: FileText,
            }
          const ChildIcon = childInfo.icon
          const childBadge = child.voucher_type === 'receipt' ? 'REM' : child.voucher_type === 'quotation' ? 'COT' : null
          return (
            <div className="flex items-center gap-1.5">
              <ChildIcon size={12} className={childInfo.textClass} />
              {childBadge && (
                <span
                  className={`inline-flex items-center px-1 h-4 rounded border text-[9px] font-bold leading-none ${
                    childBadge === 'REM'
                      ? 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700'
                      : 'bg-primary-100 text-primary-700 border-primary-300 dark:bg-primary-900/30 dark:text-primary-300 dark:border-primary-700'
                  }`}
                >
                  {childBadge}
                </span>
              )}
              <span className={`text-[11px] ${childInfo.textClass}`}>{childInfo.label}</span>
            </div>
          )
        })
      },
    },
    {
      key: 'number',
      header: 'Número',
      render: (item: any) => {
        // Referencia a factura generada (cotización/remito facturado)
        const invoicedRef = item.invoiced_voucher_id
          ? voucherNumberMap[item.invoiced_voucher_id] || 'Ver factura'
          : null

        // Referencia a factura original (nota de crédito)
        const relatedRef = item.related_voucher_id && item.voucher_type?.startsWith('credit_note_')
          ? voucherNumberMap[item.related_voucher_id] || 'Ver factura'
          : null

        const parentNode = (
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-sm font-medium">
              {item.sale_point}-{item.number}
            </span>

            {invoicedRef && (
              <button
                onClick={() => handleViewRelatedPdf(item.invoiced_voucher_id)}
                className="flex items-center gap-1 text-[11px] text-green-600 dark:text-green-400 hover:underline w-fit"
                title="Ver la factura generada desde este comprobante"
              >
                <ExternalLink size={10} />
                Fact. {invoicedRef}
              </button>
            )}
            {relatedRef && (
              <button
                onClick={() => handleViewRelatedPdf(item.related_voucher_id)}
                className="flex items-center gap-1 text-[11px] text-red-500 dark:text-red-400 hover:underline w-fit"
                title="Ver la factura original de esta Nota de Crédito"
              >
                <ExternalLink size={10} />
                Fact. {relatedRef}
              </button>
            )}
          </div>
        )

        return renderTreeCell(item, parentNode, (child) => (
          <span className="block font-mono text-[11px] text-indigo-700 dark:text-indigo-300">
            ↳ {child.sale_point}-{child.number}
          </span>
        ))
      },
    },
    {
      key: 'date',
      header: 'Fecha',
      render: (item: any) => {
        // Parsear fecha sin conversión de zona horaria
        // Si la fecha viene como "2026-02-06", tratarla como local
        const [year, month, day] = item.date.split('-')
        const localDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
        const parentNode = (
          <span className="text-sm">{localDate.toLocaleDateString('es-AR')}</span>
        )

        return renderTreeCell(item, parentNode, (child) => {
          const [y, m, d] = child.date.split('-')
          const childDate = new Date(parseInt(y), parseInt(m) - 1, parseInt(d))
          return (
            <span className="text-[11px] text-gray-600 dark:text-gray-300">
              {childDate.toLocaleDateString('es-AR')}
            </span>
          )
        })
      },
    },
    {
      key: 'client',
      header: 'Cliente',
      render: (item: any) => {
        const parentNode = (
          <span className="text-sm">
            {item.client ? item.client.name : `Cliente #${item.client_id.substring(0, 8)}...`}
          </span>
        )

        return renderTreeCell(item, parentNode, (child) => (
          <span className="text-[11px] text-gray-700 dark:text-gray-200">
            {child.client?.name || child.client_id || '—'}
          </span>
        ))
      },
    },
    {
      key: 'authorized',
      header: 'Autorizado',
      render: (item: VoucherListItem) => {
        const applies = item.voucher_type === 'receipt' && item.is_current_account
        const parentNode = !applies ? (
          <span className="text-xs text-gray-400">—</span>
        ) : (
          (() => {
            const isAuthorized = !!item.is_withdrawal_authorized
            return (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
              isAuthorized
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
            }`}
          >
            {isAuthorized ? 'Sí' : 'No'}
          </span>
            )
          })()
        )

        return renderTreeCell(item, parentNode, () => (
          <span className="text-[11px] text-gray-400">—</span>
        ))
      },
    },
    {
      key: 'withdrawalClient',
      header: 'Retira',
      render: (item: VoucherListItem) => {
        const applies = item.voucher_type === 'receipt' && item.is_current_account
        const parentNode = (() => {
          if (!applies) {
            return <span className="text-xs text-gray-400">—</span>
          }

          const withdrawalName =
            item.withdrawal_client_name || item.operating_client?.name || item.billing_client?.name

          return <span className="text-sm text-gray-900 dark:text-gray-100">{withdrawalName || '—'}</span>
        })()

        return renderTreeCell(item, parentNode, () => (
          <span className="text-[11px] text-gray-400">—</span>
        ))
      },
    },
    {
      key: 'status',
      header: 'Estado',
      render: (item: any) => {
        const statusInfo = statusLabels[item.status] || { label: item.status, className: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400' }
        const parentNode = (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.className}`}>
            {statusInfo.label}
          </span>
        )

        return renderTreeCell(item, parentNode, (child) => {
          const childStatusInfo =
            statusLabels[child.status] || {
              label: child.status,
              className: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
            }
          return (
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${childStatusInfo.className}`}>
              {childStatusInfo.label}
            </span>
          )
        })
      },
    },
    {
      key: 'total',
      header: 'Total',
      render: (item: any) => {
        const parentNode = (
          <span className="text-sm font-bold text-gray-900 dark:text-white">
            ${item.total.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        )

        return renderTreeCell(item, parentNode, (child) => (
          <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-200">
            ${Number(child.total).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        ))
      },
    },
    {
      key: 'actions',
      header: 'Acciones',
      className: 'text-center',
       render: (item: VoucherListItem) => {
         const isDeleted = !!item.deleted_at
          const closureLockInfo = getCurrentAccountClosureLockInfo(item)
          const isLockedByClosure = closureLockInfo.isLocked

        const parentActions = (
          <div className="flex gap-1 justify-center">
            {!isDeleted && (
              <>
                {item.voucher_type === 'quotation' && !item.invoiced_voucher_id && (
                  <button
                    onClick={() => handleEditQuotation(item)}
                    className="p-1 text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded transition-colors"
                    title="Editar cotización"
                  >
                    <Pencil size={14} />
                  </button>
                )}
                <button
                  onClick={() => handleViewPdf(item.id)}
                  className="p-1 text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded transition-colors"
                  title="Ver PDF"
                >
                  <Eye size={14} />
                </button>
                <button
                  onClick={() => handleDownloadPdf(item.id, `${item.sale_point}-${item.number}`)}
                  className="p-1 text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded transition-colors"
                  title="Descargar PDF"
                >
                  <Download size={14} />
                </button>
                
                {/* Botón Nota de Crédito - SOLO para facturas con CAE y SIN NC previa */}
                {invoicingEnabled && item.voucher_type.startsWith('invoice_') && item.cae && !item.has_credit_note && (
                  <button
                    onClick={() => {
                      setSelectedVoucherForNC(item)
                      setShowCreditNoteModal(true)
                    }}
                    className="p-1 text-gray-400 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/30 rounded transition-colors"
                    title="Crear Nota de Crédito"
                  >
                    <RotateCcw size={14} />
                  </button>
                )}

                {/* Indicador de NC emitida */}
                {invoicingEnabled && item.has_credit_note && (
                  <span 
                    className="p-1 text-orange-500 cursor-help" 
                    title="Esta factura ya tiene una Nota de Crédito asociada"
                  >
                    <RotateCcw size={14} className="opacity-50" />
                  </span>
                )}

                {/* Botón cotizaciones origen — solo para facturas compiladas */}
                {hasCompiledSources(item) && (
                  <button
                    onClick={() => {
                      setExpandedInvoiceId(
                        expandedInvoiceId === item.id ? null : item.id,
                      )
                    }}
                    className="p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded transition-colors"
                    title="Ver cotizaciones origen"
                  >
                    <ChevronDown
                      size={14}
                      className={`transition-transform ${
                        expandedInvoiceId === item.id ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                )}
                
                <button
                  onClick={() => {
                    if (isLockedByClosure) {
                      toast.error(closureLockInfo.reason)
                      return
                    }
                    setVoucherToDelete(item)
                    setDeleteReasonError('')
                    setShowDeleteModal(true)
                  }}
                  disabled={isLockedByClosure}
                  className={`p-1 rounded transition-colors ${
                    isLockedByClosure
                      ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                      : 'text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30'
                  }`}
                  title={
                    isLockedByClosure
                      ? closureLockInfo.reason
                      : 'Eliminar'
                  }
                >
                  <Trash2 size={14} />
                </button>
              </>
            )}
            {isDeleted && (
              <span className="text-xs text-red-600 font-medium">ELIMINADO</span>
            )}
          </div>
        )

        return renderTreeCell(item, parentActions, (child) => {
          const childIsDeleted = !!child.deleted_at
          const childIsEditableQuotation =
            child.voucher_type === 'quotation' && !child.invoiced_voucher_id

          if (childIsDeleted) {
            return <span className="text-[10px] text-red-600 font-medium">ELIMINADO</span>
          }

          return (
            <div className="flex gap-1">
              {childIsEditableQuotation && (
                <button
                  onClick={() => handleEditQuotation(child as any)}
                  className="p-0.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded transition-colors"
                  title="Editar cotización"
                >
                  <Pencil size={12} />
                </button>
              )}
              <button
                onClick={() => handleViewPdf(child.id)}
                className="p-0.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded transition-colors"
                title="Ver PDF"
              >
                <Eye size={12} />
              </button>
              <button
                onClick={() => handleDownloadPdf(child.id, `${child.sale_point}-${child.number}`)}
                className="p-0.5 text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded transition-colors"
                title="Descargar PDF"
              >
                <Download size={12} />
              </button>
            </div>
          )
        })
      },
    },
  ]

  const sourceQuotationIds = new Set((sourceQuotations || []).map((sq: any) => sq.id))
  const tableVouchers = vouchers.filter((v: VoucherListItem) => {
    // Cotizaciones/remitos ya facturados SOLO viven como subfilas dentro de su factura
    if ((v.voucher_type === 'quotation' || v.voucher_type === 'receipt') && v.invoiced_voucher_id) {
      return false
    }

    if (!expandedInvoiceId || sourceQuotationIds.size === 0) {
      return true
    }
    if (v.voucher_type !== 'quotation' && v.voucher_type !== 'receipt') {
      return true
    }
    return !sourceQuotationIds.has(v.id)
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    )
  }

  if (error) {
    const errorMessage = formatErrorMessage(error)
    const errorStatus = typeof error === 'object' && error !== null && 'response' in error
      ? (error as { response?: { status?: number } }).response?.status
      : undefined
    const isUnauthorized = errorStatus === 401 || errorMessage.includes('401') || errorMessage.includes('Unauthorized')
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-full mb-4">
          <FileText className="h-8 w-8 text-red-500" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          {isUnauthorized ? 'Sesión Expirada' : 'Error al cargar comprobantes'}
        </h2>
        <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-md">
          {isUnauthorized 
            ? 'Tu sesión ha caducado. Por favor inicia sesión nuevamente.' 
            : errorMessage}
        </p>
        {isUnauthorized && (
          <Button onClick={() => window.location.href = '/login'}>Ir al Login</Button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4 w-full max-w-none">
      {/* Filtros */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por número..."
              className="w-full pl-9 pr-4 py-2 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-primary-500"
            />
          </div>
          
          <Select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            options={[
              { value: '', label: 'Todos los Tipos' },
              { value: 'quotation',     label: 'Cotizaciones' },
              ...(receiptsEnabled ? [{ value: 'receipt', label: 'Remitos' }] : []),
              ...(invoicingEnabled
                ? [
                    { value: 'invoice_a', label: 'Facturas A' },
                    { value: 'invoice_b', label: 'Facturas B' },
                    { value: 'invoice_c', label: 'Facturas C' },
                    { value: 'credit_note_a', label: 'Notas de Crédito A' },
                    { value: 'credit_note_b', label: 'Notas de Crédito B' },
                    { value: 'credit_note_c', label: 'Notas de Crédito C' },
                  ]
                : []),
            ]}
          />
          
          <Select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            options={[
              { value: '', label: 'Todos los Estados' },
              { value: 'draft', label: 'Borradores' },
              { value: 'confirmed', label: 'Confirmados' },
              { value: 'cancelled', label: 'Anulados' },
            ]}
          />

          <Select
            value={filterPaymentMethod}
            onChange={(e) => setFilterPaymentMethod(e.target.value)}
            options={[
              { value: '', label: 'Todos los Medios de Pago' },
              ...paymentMethods.map((method) => ({
                value: method.id,
                label: method.is_active ? method.name : `${method.name} (inactivo)`,
              })),
            ]}
          />
        </div>
      </div>

      {/* Tabla */}
      {selectedQuotationIds.length >= 1 && (
        <div className="flex items-center gap-3 px-4 py-2 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg mb-4">
          <span className="text-sm font-medium text-primary-700 dark:text-primary-300">
            {selectedQuotationIds.length} comprobante{selectedQuotationIds.length > 1 ? 's' : ''} seleccionado{selectedQuotationIds.length > 1 ? 's' : ''}
          </span>
          <Button
            onClick={() => setShowCompileModal(true)}
            variant="primary"
            size="sm"
          >
            Facturar seleccionados
          </Button>
          <Button
            onClick={() => setSelectedQuotationIds([])}
            variant="ghost"
            size="sm"
          >
            Cancelar
          </Button>
        </div>
      )}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <Table 
          columns={columns} 
          data={tableVouchers}
          emptyMessage="No se encontraron comprobantes."
          density="compact"
        />
      </div>

      {/* Paginación */}
      <Pagination
        currentPage={page}
        totalPages={vouchersData?.pages || 1}
        totalItems={vouchersData?.total || 0}
        onPageChange={setPage}
      />

      {/* Modal de Eliminación */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false)
          setVoucherToDelete(null)
          setDeleteReason('')
          setDeleteReasonError('')
        }}
        title="Eliminar Comprobante"
      >
        {voucherToDelete && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                  ¿Estás seguro?
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Vas a eliminar el comprobante <strong>{voucherToDelete.sale_point}-{voucherToDelete.number}</strong>.
                  El registro quedará marcado como eliminado pero visible en el historial.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Motivo de eliminación <span className="text-red-600 dark:text-red-400">*</span>
              </label>
              <Input
                value={deleteReason}
                onChange={(e) => {
                  setDeleteReason(e.target.value)
                  if (deleteReasonError) {
                    setDeleteReasonError('')
                  }
                }}
                placeholder="Ej: Error en los datos, duplicado, etc."
                error={deleteReasonError}
                required
              />
            </div>

            <div className="flex gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowDeleteModal(false)
                  setVoucherToDelete(null)
                  setDeleteReason('')
                  setDeleteReasonError('')
                }}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button 
                variant="danger" 
                onClick={handleConfirmDelete}
                disabled={deleteMutation.isPending || !deleteReason.trim()}
                className="flex-1"
              >
                {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal de Nota de Crédito */}
      <CreditNoteModal
        isOpen={showCreditNoteModal}
        onClose={() => {
          setShowCreditNoteModal(false)
          setSelectedVoucherForNC(null)
        }}
        voucher={selectedVoucherForNC}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['vouchers'] })
        }}
      />

      {/* Modal de facturación de comprobantes seleccionados */}
      <Modal
        isOpen={showCompileModal}
        onClose={() => {
          setShowCompileModal(false)
          setCompileSelectedPaymentMethodId(null)
          setCompilePaymentReferences({})
          setCompileGeneralDiscount('0')
          setCompilePaymentError('')
        }}
        title="Facturar comprobantes seleccionados"
      >
        {(() => {
          const selectedVouchers = (vouchersData?.items || []).filter(
            (v) => selectedQuotationIds.includes(v.id),
          )
          const clientName =
            selectedVouchers[0]?.client?.name ||
            `Cliente #${selectedVouchers[0]?.client_id?.substring(0, 8)}...`
          const mixedClients = new Set(
            selectedVouchers.map((v) =>
              v.client ? v.client.name : v.client_id,
            ),
          )
          const hasMixedClients = mixedClients.size > 1

          return (
            <div className="space-y-4">
              {hasMixedClients ? (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
                  Los comprobantes seleccionados pertenecen a diferentes
                  clientes. Debés seleccionar solo comprobantes del mismo
                  cliente.
                </div>
              ) : (
                <>
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                      Cliente: {clientName}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {selectedVouchers.length} comprobante
                      {selectedVouchers.length > 1 ? 's' : ''} — Total: $
                      {selectedVouchers
                        .reduce(
                          (sum, v) => sum + Number(v.total),
                          0,
                        )
                        .toLocaleString('es-AR', {
                          minimumFractionDigits: 2,
                        })}
                    </p>
                  </div>

                  <div className="max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-gray-800 text-gray-500">
                          <th className="text-left px-3 py-2 font-medium">
                            Número
                          </th>
                          <th className="text-left px-3 py-2 font-medium">
                            Fecha
                          </th>
                          <th className="text-right px-3 py-2 font-medium">
                            Total
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedVouchers.map((v) => {
                          const [y, m, d] = v.date.split('-')
                          const ld = new Date(
                            parseInt(y),
                            parseInt(m) - 1,
                            parseInt(d),
                          )
                          return (
                            <tr
                              key={v.id}
                              className="border-t border-gray-100 dark:border-gray-700 last:border-0"
                            >
                              <td className="px-3 py-2 font-mono">
                                {v.sale_point}-{v.number}
                              </td>
                              <td className="px-3 py-2">
                                {ld.toLocaleDateString('es-AR')}
                              </td>
                              <td className="px-3 py-2 text-right">
                                ${Number(v.total).toLocaleString(
                                  'es-AR',
                                  { minimumFractionDigits: 2 },
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Descuento general (%)
                    </label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      value={compileGeneralDiscount}
                      onChange={(e) => {
                        setCompileGeneralDiscount(e.target.value)
                        setCompilePaymentError('')
                      }}
                      className="w-32 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Métodos de pago
                    </label>
                    {paymentMethods.length === 0 ? (
                      <p className="text-xs text-gray-400 italic">
                        No hay métodos de pago configurados.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {(() => {
                          const selectedVouchers = (vouchersData?.items || []).filter(v => selectedQuotationIds.includes(v.id))
                          const subtotal = Math.round((selectedVouchers.reduce((sum, v) => sum + Number(v.total), 0) + Number.EPSILON) * 100) / 100
                          const discountPercent = Number(compileGeneralDiscount) || 0
                          const discountAmount = Math.round(((subtotal * Math.min(discountPercent, 100) / 100) + Number.EPSILON) * 100) / 100
                          const finalTotal = Math.round(((subtotal - discountAmount) + Number.EPSILON) * 100) / 100
                          return paymentMethods.map((pm: any) => {
                            const methodName = String(pm.name || '').toLowerCase()
                            const methodCode = String(pm.code || '').toLowerCase()
                            const isCheque = methodName.includes('cheque') || methodCode.includes('cheque')
                            const isCard = methodName.includes('crédito') || methodName.includes('credito') || methodName.includes('débito') || methodName.includes('debito') || methodName.includes('tarjeta') || methodCode.includes('credit') || methodCode.includes('debit') || methodCode.includes('card')
                            const shouldAskReference = Boolean(pm.requires_reference) || isCheque || isCard
                            const referenceLabel = isCheque ? 'N° cheque' : isCard ? 'N° cupón' : 'Referencia'
                            const isSelected = compileSelectedPaymentMethodId === pm.id

                            return (
                              <div key={pm.id} className="space-y-1.5">
                                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={(e) => {
                                      setCompileSelectedPaymentMethodId(e.target.checked ? pm.id : null)
                                      setCompilePaymentError('')
                                    }}
                                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                  />
                                  <span className="w-40 shrink-0">{pm.name}</span>
                                  {isSelected && (
                                    <span className="text-xs text-gray-500">
                                      ${finalTotal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                  )}
                                </label>

                                {isSelected && shouldAskReference && (
                                  <div className="pl-7">
                                    <Input
                                      type="text"
                                      placeholder={referenceLabel}
                                      className="text-sm"
                                      value={compilePaymentReferences[pm.id] || ''}
                                      onChange={(e) => {
                                        setCompilePaymentReferences((prev) => ({ ...prev, [pm.id]: e.target.value }))
                                        setCompilePaymentError('')
                                      }}
                                    />
                                  </div>
                                )}
                              </div>
                            )
                          })
                        })()}
                      </div>
                    )}
                  </div>

                  {(() => {
                    const selectedVouchers = (vouchersData?.items || []).filter(v => selectedQuotationIds.includes(v.id))
                    const subtotal = Math.round((selectedVouchers.reduce((sum, v) => sum + Number(v.total), 0) + Number.EPSILON) * 100) / 100
                    const discountPercent = Number(compileGeneralDiscount) || 0
                    const discountAmount = Math.round(((subtotal * Math.min(discountPercent, 100) / 100) + Number.EPSILON) * 100) / 100
                    const finalTotal = Math.round(((subtotal - discountAmount) + Number.EPSILON) * 100) / 100
                    const assignedTotal = compileSelectedPaymentMethodId ? finalTotal : 0
                    return (
                      <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm space-y-1">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Subtotal:</span>
                          <span className="font-medium">${subtotal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        {discountPercent > 0 && (
                          <div className="flex justify-between text-orange-600">
                            <span>Descuento ({discountPercent}%):</span>
                            <span>-${discountAmount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                        )}
                        <div className="flex justify-between font-bold text-base border-t border-gray-200 dark:border-gray-700 pt-1">
                          <span>Total a pagar:</span>
                          <span>${finalTotal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className={assignedTotal >= finalTotal - 0.01 && assignedTotal <= finalTotal + 0.01 ? 'text-green-600' : 'text-orange-600'}>
                            Pagos asignados:
                          </span>
                          <span className={assignedTotal >= finalTotal - 0.01 && assignedTotal <= finalTotal + 0.01 ? 'text-green-600' : 'text-orange-600'}>
                            ${assignedTotal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        {compilePaymentError && (
                          <p className="text-red-600 text-xs mt-1">{compilePaymentError}</p>
                        )}
                      </div>
                    )
                  })()}
                </>
              )}

              <div className="flex gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                <Button
                  variant="outline"
                  onClick={() => setShowCompileModal(false)}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                {!hasMixedClients && (
                  <Button
                    variant="primary"
                    onClick={() => {
                      // Validar pagos
                      const selectedVouchers = (vouchersData?.items || []).filter(v => selectedQuotationIds.includes(v.id))
                      const subtotal = Math.round((selectedVouchers.reduce((sum, v) => sum + Number(v.total), 0) + Number.EPSILON) * 100) / 100
                      const discountPercent = Number(compileGeneralDiscount) || 0
                      const discountAmount = Math.round(((subtotal * Math.min(discountPercent, 100) / 100) + Number.EPSILON) * 100) / 100
                      const finalTotal = Math.round(((subtotal - discountAmount) + Number.EPSILON) * 100) / 100

                      const payments: VoucherPayment[] = []
                      let assignedTotal = 0

                      if (!compileSelectedPaymentMethodId) {
                        setCompilePaymentError('Debe seleccionar un método de pago')
                        return
                      }

                      const selectedMethod = paymentMethods.find((pm: any) => pm.id === compileSelectedPaymentMethodId)
                      if (!selectedMethod) {
                        setCompilePaymentError('Método de pago inválido')
                        return
                      }

                      const methodName = String(selectedMethod.name || '').toLowerCase()
                      const methodCode = String(selectedMethod.code || '').toLowerCase()
                      const isCheque = methodName.includes('cheque') || methodCode.includes('cheque')
                      const isCard = methodName.includes('crédito') || methodName.includes('credito') || methodName.includes('débito') || methodName.includes('debito') || methodName.includes('tarjeta') || methodCode.includes('credit') || methodCode.includes('debit') || methodCode.includes('card')
                      const shouldAskReference = Boolean(selectedMethod.requires_reference) || isCheque || isCard

                      if (shouldAskReference && !compilePaymentReferences[selectedMethod.id]?.trim()) {
                        setCompilePaymentError(`Debe ingresar referencia para ${selectedMethod.name}`)
                        return
                      }

                      payments.push({
                        payment_method_id: selectedMethod.id,
                        amount: finalTotal,
                        reference: compilePaymentReferences[selectedMethod.id]?.trim() || undefined,
                      })
                      assignedTotal = finalTotal

                      if (payments.length === 0) {
                        setCompilePaymentError('Debe cargar al menos un método de pago')
                        return
                      }

                      if (assignedTotal < finalTotal - 0.01 || assignedTotal > finalTotal + 0.01) {
                        setCompilePaymentError(`El total asignado ($${assignedTotal.toFixed(2)}) no coincide con el total a pagar ($${finalTotal.toFixed(2)})`)
                        return
                      }

                      compileMutation.mutate({
                        quotationIds: selectedQuotationIds,
                        payments,
                        general_discount: discountPercent,
                      })
                    }}
                     disabled={
                       compileMutation.isPending ||
                       selectedQuotationIds.length < 1
                     }
                    className="flex-1"
                  >
                    {compileMutation.isPending
                      ? 'Generando...'
                      : 'Confirmar y Facturar'}
                  </Button>
                )}
              </div>
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}
