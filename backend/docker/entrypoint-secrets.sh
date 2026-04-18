#!/usr/bin/env sh
set -eu

# Opción 1 (estilo Portainer que ya usás): cargar un archivo .env desde secret.
# Ejemplo:
#   BACKEND_ENV_FILE=/run/secrets/backend.env
#   (secret montado con target /run/secrets/backend.env)
if [ -n "${BACKEND_ENV_FILE:-}" ]; then
  if [ ! -f "${BACKEND_ENV_FILE}" ]; then
    echo "Error: BACKEND_ENV_FILE points to missing file: ${BACKEND_ENV_FILE}" >&2
    exit 1
  fi

  # shellcheck disable=SC1090
  set -a
  . "${BACKEND_ENV_FILE}"
  set +a
fi

# file_env VAR [DEFAULT]
# Si existe VAR_FILE, lee el valor desde archivo y lo exporta en VAR.
file_env() {
  var="$1"
  def="${2:-}"

  eval "val=\${$var:-}"
  eval "file=\${${var}_FILE:-}"

  if [ -n "${val}" ] && [ -n "${file}" ]; then
    echo "Error: both $var and ${var}_FILE are set (but are exclusive)" >&2
    exit 1
  fi

  if [ -n "${file}" ]; then
    if [ ! -f "${file}" ]; then
      echo "Error: ${var}_FILE points to missing file: ${file}" >&2
      exit 1
    fi
    val="$(cat "${file}")"
  fi

  export "$var"="${val:-$def}"
  unset "${var}_FILE"
}

# Variables sensibles admitidas por archivo secreto.
file_env DATABASE_URL
file_env JWT_SECRET
file_env GOOGLE_CLIENT_ID
file_env GOOGLE_CLIENT_SECRET
file_env APP_ENCRYPTION_KEY
file_env OPENAI_API_KEY

exec "$@"
