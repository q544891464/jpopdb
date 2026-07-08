const baseUrl = (process.env.CATALOG_BASE_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001').replace(/\/$/u, '')
const maxMs = Number(process.env.CATALOG_MAX_MS ?? 3000)

const checks = [
  { name: 'health', path: '/health', enforceLatency: false },
  { name: 'catalog-list', path: '/api/catalog/songs?limit=1', enforceLatency: true },
  { name: 'catalog-keyword', path: '/api/catalog/songs?limit=1&q=yoasobi', enforceLatency: true },
]

async function timedRequest(path) {
  const startedAt = performance.now()
  const response = await fetch(`${baseUrl}${path}`)
  const elapsedMs = Math.round(performance.now() - startedAt)
  const text = await response.text()
  let payload
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = text
  }
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}: ${text.slice(0, 500)}`)
  }
  return { elapsedMs, payload }
}

async function runCheck(check) {
  await timedRequest(check.path)
  const result = await timedRequest(check.path)
  if (check.enforceLatency && result.elapsedMs > maxMs) {
    throw new Error(`${check.name} took ${result.elapsedMs}ms, above ${maxMs}ms`)
  }
  return {
    name: check.name,
    path: check.path,
    elapsedMs: result.elapsedMs,
    itemCount: Array.isArray(result.payload?.items) ? result.payload.items.length : undefined,
  }
}

const results = []
for (const check of checks) {
  results.push(await runCheck(check))
}

console.log(JSON.stringify({ baseUrl, maxMs, results }, null, 2))
