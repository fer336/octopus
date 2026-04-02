/**
 * Helpers para manejo de errores.
 */

/**
 * Formatea un error de API para mostrarlo en un toast.
 * Maneja errores de validación Pydantic (422) y otros errores comunes.
 */
export function formatErrorMessage(error: any): string {
  // Si es un string, devolverlo directamente
  if (typeof error === 'string') {
    return error
  }

  if (error?.code === 'ERR_NETWORK' || error?.message === 'Network Error') {
    const requestUrl = [error?.config?.baseURL, error?.config?.url].filter(Boolean).join('')

    return requestUrl
      ? `Network error al conectar con ${requestUrl}. Revisá sesión activa y conectividad.`
      : 'Network error al conectar con la API. Revisá sesión activa y conectividad.'
  }

  // Si es un objeto con response (axios error)
  if (error.response) {
    const { status, data } = error.response

    // Error 422: Validación de Pydantic
    if (status === 422 && data.detail) {
      // data.detail puede ser un array de errores o un string
      if (Array.isArray(data.detail)) {
        // Formatear cada error de validación
        const errors = data.detail.map((err: any) => {
          const field = err.loc ? err.loc.join('.') : 'campo'
          return `${field}: ${err.msg}`
        })
        return errors.join(', ')
      }
      return data.detail
    }

    // Otros errores con detail
    if (data.detail) {
      return typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail)
    }

    // Errores genéricos por código
    if (status === 401) return 'No autorizado. Por favor inicia sesión.'
    if (status === 403) return 'No tienes permiso para realizar esta acción.'
    if (status === 404) return 'Recurso no encontrado.'
    if (status === 500) return 'Error interno del servidor.'
  }

  // Error genérico
  if (error.message) {
    return error.message
  }

  return 'Error desconocido'
}
