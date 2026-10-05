import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { parseGitHubProfileInput } from '@/lib/parse-github-profile'
import { ServiceError, errorResponse } from '@/lib/service-error'
import { generationStore, enforceRequestLimit, cachedGeneration } from '@/lib/generation-store'
import { generateProfile, generationKey } from '@/lib/generate-profile'

export const runtime = 'nodejs'
export const maxDuration = 120
const MAX_REQUEST_BYTES = 4096

async function readInput(request: NextRequest): Promise<string> {
  if (!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get('content-type') ?? '')) throw new ServiceError('INVALID_CONTENT_TYPE', 'Send an application/json request.', 415)
  const declared = Number(request.headers.get('content-length'))
  if (declared > MAX_REQUEST_BYTES) throw new ServiceError('BODY_TOO_LARGE', 'Request body is too large.', 413)
  const reader = request.body?.getReader()
  if (!reader) throw new ServiceError('INVALID_BODY', 'profile is required (string).', 400)
  const chunks: Uint8Array[] = []
  let size = 0
  let timedOut = false
  const cancel = () => { void reader.cancel().catch(() => {}) }
  const timer = setTimeout(() => { timedOut = true; cancel() }, 5000)
  request.signal.addEventListener('abort', cancel, { once: true })
  try {
    request.signal.throwIfAborted()
    while (true) {
      const { value, done } = await reader.read()
      if (timedOut) throw new ServiceError('REQUEST_TIMEOUT', 'Request body timed out.', 408)
      request.signal.throwIfAborted()
      if (done) break
      size += value.length
      if (size > MAX_REQUEST_BYTES) { await reader.cancel(); throw new ServiceError('BODY_TOO_LARGE', 'Request body is too large.', 413) }
      chunks.push(value)
    }
  } finally {
    clearTimeout(timer)
    request.signal.removeEventListener('abort', cancel)
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  let body: unknown
  try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) } catch { throw new ServiceError('INVALID_JSON', 'Invalid JSON body.', 400) }
  if (!body || typeof body !== 'object' || !('profile' in body) || typeof body.profile !== 'string') throw new ServiceError('INVALID_BODY', 'profile is required (string).', 400)
  const parsed = parseGitHubProfileInput(body.profile)
  if (!parsed) throw new ServiceError('INVALID_PROFILE', 'Enter a GitHub profile like @steipete or https://github.com/steipete.', 400)
  return parsed.login
}

export async function POST(request: NextRequest) {
  const start = performance.now()
  try {
    const login = await readInput(request)
    request.signal.throwIfAborted()
    const store = generationStore()
    // Only trust a header supplied/overwritten by the deployment's trusted proxy.
    // With no trusted proxy, all clients share one conservative request bucket.
    const ip = process.env.VERCEL ? request.headers.get('x-real-ip') : process.env.GITTOSKILL_TRUST_PROXY === 'true' ? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() : null
    const client = createHash('sha256').update(ip || 'unidentified-client').digest('hex').slice(0, 24)
    await enforceRequestLimit(store, client)
    const result = await cachedGeneration(store, generationKey(login), login, signal => generateProfile(login, signal))
    const milliseconds = Math.round(performance.now() - start)
    console.info(JSON.stringify({ event: 'request.completed', cache: result.cache, milliseconds }))
    return NextResponse.json(result.output, { headers: { 'Cache-Control': 'no-store', 'X-GitToSkill-Cache': result.cache, 'Server-Timing': `total;dur=${milliseconds}` } })
  } catch (error) {
    const failure = errorResponse(error)
    console.warn(JSON.stringify({ event: 'request.failed', code: failure.body.code, status: failure.status, milliseconds: Math.round(performance.now() - start) }))
    return NextResponse.json(failure.body, { status: failure.status, headers: { 'Cache-Control': 'no-store', ...(failure.retryAfter ? { 'Retry-After': String(failure.retryAfter) } : {}) } })
  }
}
