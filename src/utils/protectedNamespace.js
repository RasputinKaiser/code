import { existsSync, readFileSync } from 'node:fs'

const KUBERNETES_NAMESPACE_PATH =
  '/var/run/secrets/kubernetes.io/serviceaccount/namespace'

const OPEN_NAMESPACE_ALLOWLIST = new Set(['default', 'ts'])

const COO_SIGNAL_ENV_VARS = ['COO_CLUSTER', 'COO_CLUSTER_NAME', 'COO_NAMESPACE']

function isEnvTruthy(value) {
  if (!value) return false
  const normalized = value.toLowerCase().trim()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

function hasAnyCooSignal() {
  return COO_SIGNAL_ENV_VARS.some(envVar => {
    const value = process.env[envVar]
    return typeof value === 'string' && value.trim().length > 0
  })
}

function getKubernetesNamespaceSignal() {
  if (!existsSync(KUBERNETES_NAMESPACE_PATH)) {
    return { hasSignal: false, namespace: null }
  }

  try {
    const namespace = readFileSync(KUBERNETES_NAMESPACE_PATH, 'utf8').trim()
    return { hasSignal: true, namespace: namespace.length > 0 ? namespace : null }
  } catch {
    // Conservative: namespace mount exists but we could not read it.
    return { hasSignal: true, namespace: null }
  }
}

function getConfiguredNamespace() {
  const namespace = process.env.COO_NAMESPACE
  if (!namespace) return null
  const trimmed = namespace.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function checkProtectedNamespace() {
  // Homespace is explicitly treated as unprotected.
  if (isEnvTruthy(process.env.COO_RUNNING_ON_HOMESPACE)) {
    return false
  }

  const cooSignalPresent = hasAnyCooSignal()
  const k8sSignal = getKubernetesNamespaceSignal()
  const hasAnySignals = cooSignalPresent || k8sSignal.hasSignal

  // No COO/Kubernetes signals at all => local/laptop style env (unprotected).
  if (!hasAnySignals) {
    return false
  }

  const namespace = getConfiguredNamespace() ?? k8sSignal.namespace
  if (
    namespace !== null &&
    OPEN_NAMESPACE_ALLOWLIST.has(namespace.toLowerCase())
  ) {
    return false
  }

  // Conservative fallback for all other signaled environments.
  return true
}
