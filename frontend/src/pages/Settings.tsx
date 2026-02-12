/**
 * Página de Configuración.
 * Datos del negocio, membrete y preferencias.
 */
import { useState, useEffect } from 'react'
import { Building2, FileText, Bell, Shield } from 'lucide-react'
import { Button, Input, Select } from '../components/ui'
import { TAX_CONDITIONS } from '../types'
import ARCAConfiguration from '../components/settings/ARCAConfiguration'
import businessService, { Business, BusinessUpdate } from '../api/businessService'
import toast from 'react-hot-toast'

export default function Settings() {
  const [loading, setLoading] = useState(false)
  const [business, setBusiness] = useState<Business | null>(null)
  const [businessId, setBusinessId] = useState<string>('')
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    cuit: '',
    tax_condition: 'MONO',
    address: '',
    city: '',
    province: '',
    postal_code: '',
    phone: '',
    email: '',
    sale_point: '0001',
  })

  // Cargar datos del negocio al montar
  useEffect(() => {
    loadBusiness()
  }, [])

  const loadBusiness = async () => {
    try {
      const data = await businessService.getMyBusiness()
      setBusiness(data)
      setBusinessId(data.id)
      setFormData({
        name: data.name || '',
        cuit: data.cuit || '',
        tax_condition: data.tax_condition || 'MONO',
        address: data.address || '',
        city: data.city || '',
        province: data.province || '',
        postal_code: data.postal_code || '',
        phone: data.phone || '',
        email: data.email || '',
        sale_point: data.sale_point || '0001',
      })
    } catch (error: any) {
      console.error('Error al cargar negocio:', error)
      if (error.response?.data?.detail) {
        const detail = error.response.data.detail
        if (typeof detail === 'string') {
          toast.error(detail)
        } else {
          toast.error('Error al cargar datos del negocio')
        }
      } else {
        toast.error('Error al cargar datos del negocio')
      }
    }
  }

  const handleChange = (field: keyof typeof formData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validación básica
    if (!formData.name || !formData.cuit || !formData.tax_condition) {
      toast.error('Completa los campos obligatorios: Razón Social, CUIT y Condición ante IVA')
      return
    }

    setLoading(true)
    try {
      const updateData: BusinessUpdate = {
        name: formData.name,
        cuit: formData.cuit,
        tax_condition: formData.tax_condition,
        address: formData.address || undefined,
        city: formData.city || undefined,
        province: formData.province || undefined,
        postal_code: formData.postal_code || undefined,
        phone: formData.phone || undefined,
        email: formData.email || undefined,
        sale_point: formData.sale_point,
      }

      const updated = await businessService.updateMyBusiness(updateData)
      setBusiness(updated)
      toast.success('Datos del negocio actualizados correctamente')
    } catch (error: any) {
      console.error('Error al actualizar negocio:', error)
      // Manejar errores de validación de Pydantic
      if (error.response?.data?.detail) {
        const detail = error.response.data.detail
        if (Array.isArray(detail)) {
          // Errores de validación de Pydantic
          const messages = detail.map((err: any) => `${err.loc.join('.')}: ${err.msg}`).join(', ')
          toast.error(`Error de validación: ${messages}`)
        } else if (typeof detail === 'string') {
          toast.error(detail)
        } else {
          toast.error('Error al actualizar datos')
        }
      } else {
        toast.error('Error al actualizar datos')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Configuración
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
          Datos del negocio y preferencias del sistema
        </p>
      </div>

      {/* Datos del negocio */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
            <Building2 className="text-primary-600" size={20} />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Datos del negocio
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Razón Social *"
            placeholder="Ej: Ferretería San Martín S.R.L."
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            required
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="CUIT *"
              placeholder="Ej: 30-12345678-9"
              value={formData.cuit}
              onChange={(e) => handleChange('cuit', e.target.value)}
              required
            />
            <Select
              label="Condición ante IVA *"
              options={TAX_CONDITIONS.map(t => ({ value: t.value, label: t.label }))}
              value={formData.tax_condition}
              onChange={(e) => handleChange('tax_condition', e.target.value)}
              required
            />
          </div>
          <Input
            label="Dirección"
            placeholder="Calle, número, localidad, provincia"
            value={formData.address}
            onChange={(e) => handleChange('address', e.target.value)}
          />
          <div className="grid grid-cols-3 gap-4">
            <Input 
              label="Ciudad" 
              placeholder="Buenos Aires"
              value={formData.city}
              onChange={(e) => handleChange('city', e.target.value)}
            />
            <Input 
              label="Provincia" 
              placeholder="Buenos Aires"
              value={formData.province}
              onChange={(e) => handleChange('province', e.target.value)}
            />
            <Input 
              label="C.P." 
              placeholder="1000"
              value={formData.postal_code}
              onChange={(e) => handleChange('postal_code', e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input 
              label="Teléfono" 
              placeholder="Ej: 11-1234-5678"
              value={formData.phone}
              onChange={(e) => handleChange('phone', e.target.value)}
            />
            <Input 
              label="Email" 
              type="email" 
              placeholder="correo@negocio.com"
              value={formData.email}
              onChange={(e) => handleChange('email', e.target.value)}
            />
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? 'Guardando...' : 'Guardar datos del negocio'}
          </Button>
        </form>
      </div>

      {/* Membrete PDF */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
            <FileText className="text-purple-600" size={20} />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Membrete para documentos
          </h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
              Logo del negocio
            </label>
            <div className="flex items-center gap-4">
              <div className="w-24 h-24 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-600">
                <span className="text-gray-400 text-sm">Sin logo</span>
              </div>
              <Button variant="outline" size="sm">
                Subir imagen
              </Button>
            </div>
          </div>
          <Input
            label="Punto de venta"
            placeholder="0001"
            value={formData.sale_point}
            onChange={(e) => handleChange('sale_point', e.target.value)}
            className="w-32"
          />
        </div>
      </div>

      {/* Notificaciones */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
            <Bell className="text-amber-600" size={20} />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Notificaciones
          </h2>
        </div>

        <div className="space-y-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 rounded border-gray-300" defaultChecked />
            <span className="text-gray-700 dark:text-gray-200">
              Alertar cuando un producto tenga stock bajo
            </span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 rounded border-gray-300" defaultChecked />
            <span className="text-gray-700 dark:text-gray-200">
              Notificar clientes con saldo vencido
            </span>
          </label>
        </div>
      </div>

      {/* Facturación Electrónica ARCA/AFIP */}
      {businessId && <ARCAConfiguration businessId={businessId} />}

      {/* Seguridad */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
            <Shield className="text-red-600" size={20} />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Seguridad
          </h2>
        </div>

        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-300">
            Tu cuenta está vinculada con Google OAuth. Los datos de sesión expiran después de 30 minutos de inactividad.
          </p>
          <Button variant="outline" size="sm">
            Cerrar todas las sesiones
          </Button>
        </div>
      </div>


    </div>
  )
}
