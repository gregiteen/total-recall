import { apiFetch, getApiBase } from './_base'

const inventory = {
  secrets: { path: '/api/plugins/auth/secrets?catalog=0', list: 'keys', fields: [
    'key', 'label', 'set', 'provider_name', 'repos', 'next_rotate_due', 'rotation_overdue', 'updated_at',
  ] },
  brains: { path: '/api/brains', list: 'brains', fields: ['id', 'name', 'layer', 'exists', 'node_count'] },
  machines: { path: '/api/mesh/nodes', list: 'nodes', fields: ['hostname', 'online', 'self', 'os', 'role', 'vault_only'] },
} as const

export async function readAuthInventory(resource: unknown, signal: AbortSignal) {
  if (typeof resource !== 'string' || !Object.hasOwn(inventory, resource)) throw new Error('Unknown Auth inventory')
  const { path, list, fields } = inventory[resource as keyof typeof inventory]
  const response = await apiFetch(getApiBase() + path, { cache: 'no-store', signal })
  if (!response.ok) throw new Error(`Inventory request returned HTTP ${response.status}`)
  const result = await response.json()
  const rows = Array.isArray(result) && resource === 'secrets' ? result : result?.[list]
  if (!Array.isArray(rows) || rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
    throw new Error('Inventory response was incomplete')
  }
  return rows.map(row => Object.fromEntries(fields.flatMap(key => Object.hasOwn(row, key) ? [[key, row[key]]] : [])))
}

export async function changeAuthCredential(payload: unknown, signal: AbortSignal) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Choose a credential action.')
  const change = payload as Record<string, unknown>
  const key = change.key
  if (typeof key !== 'string' || !key.trim() || key.length > 256 || /[\x00-\x1f\x7f/\\]/.test(key) || key === '.' || key === '..') {
    throw new Error('Select a valid credential.')
  }
  const path = getApiBase() + '/api/plugins/auth/secrets/' + encodeURIComponent(key)
  const action = change.action
  let response: Response
  if (action === 'edit') {
    const { label, repo } = change
    if (typeof label !== 'string' || label.length > 120 ||
        (repo !== undefined && (typeof repo !== 'string' || repo.length > 256 || /[\x00-\x1f\x7f,]/.test(repo)))) {
      throw new Error('Enter a valid label and one repository binding.')
    }
    response = await apiFetch(path, {
      method: 'PATCH', signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: label.trim() || null, ...(typeof repo === 'string'
        ? { repos: repo.trim() ? [repo.trim()] : [] } : {}) }),
    })
  } else if (action === 'replace') {
    const value = change.value
    if (typeof value !== 'string' || !value.trim() || value.length > 16384) throw new Error('Enter the replacement value.')
    response = await apiFetch(path + '/rotate', {
      method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value }),
    })
  } else if (action === 'delete' && change.confirm === key) {
    response = await apiFetch(path, { method: 'DELETE', signal })
  } else {
    throw new Error('Choose an action and confirm deletion if requested.')
  }
  if (!response.ok) throw new Error(`Auth returned HTTP ${response.status}.`)
  const result = await response.json()
  if (action === 'delete' ? result?.found !== true : result?.key !== key) {
    throw new Error('Auth did not confirm the credential change.')
  }
  return { ok: true }
}
