import { randomUUID } from 'node:crypto'
import { ServiceError } from '@/lib/service-error'
import { serviceJson, waitFor } from '@/lib/service-fetch'
import type { SkillOutput } from '@/lib/skill-types'
import { validateSkillBundle } from '@/packages/cli/src/bundle.mjs'

export function envInteger(name: string, fallback: number, min = 1, max = 1_000_000): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new ServiceError('CONFIGURATION', `${name} has an invalid value.`, 503)
  return value
}

export interface GenerationStore {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ttl: number): Promise<void>
  lock(key: string, token: string, ttl: number): Promise<boolean>
  unlock(key: string, token: string): Promise<void>
  consume(key: string, limit: number, ttl: number): Promise<boolean>
}

export class MemoryStore implements GenerationStore {
  private entries = new Map<string, { value: string; expires: number }>()
  constructor(private maxEntries = 512) {}
  private value(key: string) {
    const entry = this.entries.get(key)
    if (entry && entry.expires > Date.now()) return entry.value
    this.entries.delete(key)
    return null
  }
  private prune() {
    for (const [key, entry] of this.entries) if (entry.expires <= Date.now()) this.entries.delete(key)
    // Preserve active locks and quota counters rather than silently evicting them.
    while (this.entries.size >= this.maxEntries) {
      const candidate = [...this.entries.keys()].find(key => key.startsWith('result:'))
      if (!candidate) throw new ServiceError('CAPACITY', 'The service is at capacity. Please try again later.', 503)
      this.entries.delete(candidate)
    }
  }
  async get(key: string) { return this.value(key) }
  async set(key: string, value: string, ttl: number) {
    if (!this.entries.has(key)) this.prune()
    this.entries.set(key, { value, expires: Date.now() + ttl * 1000 })
  }
  async lock(key: string, token: string, ttl: number) {
    if (this.value(key) !== null) return false
    await this.set(key, token, ttl)
    return true
  }
  async unlock(key: string, token: string) { if (this.value(key) === token) this.entries.delete(key) }
  async consume(key: string, limit: number, ttl: number) {
    const value = this.value(key)
    const count = Number(value ?? 0)
    if (count >= limit) return false
    if (value === null) await this.set(key, '1', ttl)
    else this.entries.get(key)!.value = String(count + 1)
    return true
  }
}

export class RedisRestStore implements GenerationStore {
  constructor(private url: string, private token: string) {}
  private async command(args: Array<string | number>): Promise<unknown> {
    const { data } = await serviceJson(this.url, {
      method: 'POST', headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    }, { service: 'Shared generation storage', timeoutMs: 5000, maxBytes: 1024 * 1024 })
    const result = data as { result?: unknown; error?: string }
    if (!result || result.error) throw new ServiceError('STORAGE_UNAVAILABLE', 'Shared generation storage is unavailable.', 503)
    return result.result
  }
  private key(key: string) { return `gittoskill:v2:${key}` }
  async get(key: string) { const value = await this.command(['GET', this.key(key)]); return typeof value === 'string' ? value : null }
  async set(key: string, value: string, ttl: number) { await this.command(['SET', this.key(key), value, 'EX', ttl]) }
  async lock(key: string, token: string, ttl: number) { return await this.command(['SET', this.key(key), token, 'NX', 'EX', ttl]) === 'OK' }
  async unlock(key: string, token: string) {
    await this.command(['EVAL', 'if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end', 1, this.key(key), token])
  }
  async consume(key: string, limit: number, ttl: number) {
    const result = await this.command(['EVAL', 'local n = tonumber(redis.call("GET", KEYS[1]) or "0"); if n >= tonumber(ARGV[1]) then return 0 end; n = redis.call("INCR", KEYS[1]); if n == 1 then redis.call("EXPIRE", KEYS[1], ARGV[2]) end; return 1', 1, this.key(key), limit, ttl])
    return result === 1
  }
}

let activeStore: GenerationStore | undefined
export function generationStore(): GenerationStore {
  if (activeStore) return activeStore
  const url = process.env.GITTOSKILL_REDIS_REST_URL?.trim()
  const token = process.env.GITTOSKILL_REDIS_REST_TOKEN?.trim()
  if (Boolean(url) !== Boolean(token)) throw new ServiceError('CONFIGURATION', 'Both shared storage URL and token must be configured.', 503)
  if (url && token) {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new ServiceError('CONFIGURATION', 'Shared storage must use HTTPS.', 503)
    activeStore = new RedisRestStore(url, token)
  } else {
    if (process.env.NODE_ENV === 'production' && process.env.GITTOSKILL_ALLOW_MEMORY_STORE !== 'true') throw new ServiceError('CONFIGURATION', 'Configure shared generation storage for production, or explicitly enable memory storage for a single-instance deployment.', 503)
    activeStore = new MemoryStore()
  }
  return activeStore
}

export async function enforceRequestLimit(store: GenerationStore, client: string) {
  const ttl = 900
  const bucket = Math.floor(Date.now() / (ttl * 1000))
  if (!await store.consume(`requests:${client}:${bucket}`, envInteger('GITTOSKILL_REQUEST_LIMIT', 30), ttl)) throw new ServiceError('RATE_LIMIT', 'Too many requests. Please try again later.', 429, ttl - Math.floor(Date.now() / 1000) % ttl)
}

export async function cachedGeneration(
  store: GenerationStore,
  key: string,
  login: string,
  generate: (signal: AbortSignal) => Promise<SkillOutput>,
): Promise<{ output: SkillOutput; cache: 'HIT' | 'MISS' | 'COALESCED' }> {
  const cached = await store.get(`result:${key}`)
  if (cached) {
    try { return { output: validateSkillBundle(JSON.parse(cached), login), cache: 'HIT' } } catch { /* Regenerate invalid or outdated cache records. */ }
  }
  const token = randomUUID()
  const lock = `lock:${key}`
  if (!await store.lock(lock, token, 110)) {
    const signal = AbortSignal.timeout(95_000)
    while (!signal.aborted) {
      await waitFor(250, signal)
      const value = await store.get(`result:${key}`)
      if (value) {
        try { return { output: validateSkillBundle(JSON.parse(value), login), cache: 'COALESCED' } } catch { throw new ServiceError('INVALID_CACHE', 'Cached generation was invalid.', 503) }
      }
      if (!await store.get(lock)) throw new ServiceError('GENERATION_FAILED', 'The shared generation failed. Please try again.', 502)
    }
    throw new ServiceError('TIMEOUT', 'Generation timed out.', 504)
  }
  let slot: string | undefined
  try {
    // Another worker may have filled the cache between the initial read and lock.
    const ready = await store.get(`result:${key}`)
    if (ready) { try { return { output: validateSkillBundle(JSON.parse(ready), login), cache: 'HIT' } } catch { /* regenerate */ } }
    for (let index = 0; index < envInteger('GITTOSKILL_MAX_CONCURRENT', 4, 1, 20); index++) {
      const candidate = `active:${index}`
      if (await store.lock(candidate, token, 110)) { slot = candidate; break }
    }
    if (!slot) throw new ServiceError('CAPACITY', 'All generation slots are busy. Please try again shortly.', 503, 10)
    const hour = Math.floor(Date.now() / 3_600_000)
    if (!await store.consume(`generations:${hour}`, envInteger('GITTOSKILL_HOURLY_GENERATION_LIMIT', 100), 3600)) throw new ServiceError('BUDGET_LIMIT', 'The hourly generation budget has been reached. Please try again later.', 429, 3600 - Math.floor(Date.now() / 1000) % 3600)
    const output = validateSkillBundle(await generate(AbortSignal.timeout(80_000)), login)
    await store.set(`result:${key}`, JSON.stringify(output), envInteger('GITTOSKILL_CACHE_TTL_SECONDS', 43_200, 60, 604_800))
    return { output, cache: 'MISS' }
  } finally {
    try { if (slot) await store.unlock(slot, token) } finally { await store.unlock(lock, token) }
  }
}
