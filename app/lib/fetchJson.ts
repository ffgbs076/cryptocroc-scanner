type CacheEntry = { t: number; data: any }

declare global {
  // eslint-disable-next-line no-var
  var __CG_CACHE__: Map<string, CacheEntry> | undefined
}

function getCache() {
  if (!globalThis.__CG_CACHE__) globalThis.__CG_CACHE__ = new Map()
  return globalThis.__CG_CACHE__!
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function fetchJsonCached(url: string, opts?: { ttlMs?: number; retries?: number }) {
  const ttlMs = opts?.ttlMs ?? 60_000
  const retries = opts?.retries ?? 2
  const cache = getCache()

  const now = Date.now()
  const hit = cache.get(url)
  if (hit && now - hit.t < ttlMs) return hit.data

  let lastErr: any = null

  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, {
        // caching in app router is tricky; we use our own TTL cache
        cache: "no-store",
        headers: { "accept": "application/json" }
      })

      if (res.status === 429) {
        // backoff: 0.8s, 1.6s, 3.2s...
        await sleep(800 * Math.pow(2, i))
        lastErr = new Error("429")
        continue
      }

      if (!res.ok) {
        lastErr = new Error(String(res.status))
        break
      }

      const data = await res.json()
      cache.set(url, { t: Date.now(), data })
      return data
    } catch (e) {
      lastErr = e
      await sleep(300 * (i + 1))
    }
  }

  // fallback: return cache even if old
  if (hit) return hit.data

  throw lastErr ?? new Error("fetch failed")
}
