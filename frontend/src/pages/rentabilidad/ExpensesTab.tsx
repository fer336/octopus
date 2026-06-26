/**
 * Tab de Gastos.
 * Lista y CRUD de gastos del período.
 */
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Receipt } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { Table, Pagination, Button, Modal, Input, Select } from '../../components/ui'
import profitabilityService from '../../api/profitabilityService'
import type { ProfitabilityFilters, ExpenseOut, ExpenseCreate } from '../../api/profitabilityService'

interface ExpensesTabProps {
  dateFrom: string
  dateTo: string
  filters?: ProfitabilityFilters
}

export default function ExpensesTab({ dateFrom, dateTo, filters }: ExpensesTabProps) {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<ExpenseCreate>({
    description: '',
    amount: 0,
    category_id: '',
    date: new Date().toISOString().slice(0, 10),
    payment_method: 'cash',
    notes: '',
  })

  useEffect(() => { setPage(1) }, [dateFrom, dateTo])

  const { data, isLoading } = useQuery({
    queryKey: ['profitability', 'expenses', dateFrom, dateTo, page, filters],
    queryFn: () => profitabilityService.getExpenses({
      date_from: dateFrom,
      date_to: dateTo,
      page,
      per_page: 20,
      ...(filters ?? {}),
    }),
  })

  const { data: categories } = useQuery({
    queryKey: ['profitability', 'expense-categories'],
    queryFn: () => profitabilityService.getExpenseCategories(),
  })

  const createMutation = useMutation({
    mutationFn: (data: ExpenseCreate) => profitabilityService.createExpense(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profitability', 'expenses'] })
      toast.success('Gasto creado correctamente')
      setShowModal(false)
    },
    onError: () => toast.error('Error al crear el gasto'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => profitabilityService.deleteExpense(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profitability', 'expenses'] })
      toast.success('Gasto eliminado')
    },
    onError: () => toast.error('Error al eliminar el gasto'),
  })

  const handleSubmit = () => {
    createMutation.mutate(form)
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Receipt size={18} className="text-orange-500" />
          <h3 className="font-semibold text-gray-900 dark:text-white">Gastos del Período</h3>
        </div>
        <Button size="sm" onClick={() => { setEditId(null); setForm({ description: '', amount: 0, category_id: '', date: new Date().toISOString().slice(0, 10), payment_method: 'cash', notes: '' }); setShowModal(true) }}>
          <Plus size={16} className="mr-1" /> Nuevo Gasto
        </Button>
      </div>

      <Table
        columns={[
          { key: 'date', header: 'Fecha' },
          { key: 'description', header: 'Descripción' },
          { key: 'category_name', header: 'Categoría', render: (row: ExpenseOut) => row.category_name ?? '—' },
          { key: 'amount', header: 'Monto', render: (row: ExpenseOut) => <span className="font-medium text-red-600 dark:text-red-400">${row.amount.toLocaleString()}</span> },
          { key: 'payment_method', header: 'Método Pago', render: (row: ExpenseOut) => row.payment_method === 'cash' ? 'Efectivo' : row.payment_method === 'transfer' ? 'Transferencia' : row.payment_method === 'check' ? 'Cheque' : row.payment_method === 'card' ? 'Tarjeta' : row.payment_method ?? '—' },
          {
            key: 'actions',
            header: 'Acciones',
            render: (row: ExpenseOut) => (
              <div className="flex gap-1">
                <button onClick={() => { setEditId(row.id); setForm({ description: row.description, amount: row.amount, category_id: row.category_id ?? '', date: row.date, payment_method: row.payment_method || 'cash', notes: '' }); setShowModal(true) }} className="p-1.5 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded">
                  <Pencil size={14} />
                </button>
                <button onClick={() => { if (confirm('¿Eliminar este gasto?')) deleteMutation.mutate(row.id) }} className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded">
                  <Trash2 size={14} />
                </button>
              </div>
            ),
          },
        ]}
        data={data?.items ?? []}
        isLoading={isLoading}
        emptyMessage="No hay gastos registrados"
        density="compact"
      />
      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        <Pagination
          currentPage={page}
          totalPages={data?.pages ?? 1}
          onPageChange={setPage}
          totalItems={data?.total}
          itemsPerPage={20}
        />
      </div>

      {showModal && (
        <Modal isOpen={showModal} title={editId ? 'Editar Gasto' : 'Nuevo Gasto'} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <Input label="Descripción" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <Input label="Monto" type="number" value={form.amount.toString()} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
            <Select
              label="Categoría"
              value={form.category_id}
              onChange={(e) => setForm({ ...form, category_id: e.target.value })}
              options={(categories ?? []).map((c) => ({ value: c.id, label: c.name }))}
            />
            <Input label="Fecha" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setShowModal(false)}>Cancelar</Button>
              <Button onClick={handleSubmit} isLoading={createMutation.isPending}>{editId ? 'Actualizar' : 'Crear'}</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
