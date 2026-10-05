import { ServiceError } from '@/lib/service-error'

export async function readBoundedJson(response: Response, maxBytes: number): Promise<unknown> {
  if (!response.body) throw new ServiceError('INVALID_RESPONSE', 'The upstream service returned an empty response.')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.length
      if (size > maxBytes) { await reader.cancel(); throw new ServiceError('RESPONSE_TOO_LARGE', 'The upstream response exceeded the size limit.') }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  try { return JSON.parse(new TextDecoder().decode(bytes)) } catch { throw new ServiceError('INVALID_RESPONSE', 'The upstream service returned invalid JSON.') }
}

export function waitFor(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return }
    const abort = () => { clearTimeout(timer); reject(signal?.reason) }
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve() }, ms)
    signal?.addEventListener('abort', abort, { once: true })
  })
}

export async function serviceJson(
  url: string,
  init: RequestInit,
  options: { service: string; signal?: AbortSignal; timeoutMs?: number; maxBytes?: number; retryRead?: boolean }
): Promise<{ data: unknown; headers: Headers }> {
  const signal = AbortSignal.any([AbortSignal.timeout(options.timeoutMs ?? 15_000), ...(options.signal ? [options.signal] : [])])
  for (let attempt = 0; ; attempt++) {
    let response: Response
    try { response = await fetch(url, { ...init, signal, cache: 'no-store', redirect: 'error' }) } catch {
      if (signal.aborted) throw new ServiceError('TIMEOUT', `${options.service} timed out. Please try again.`, 504)
      if (options.retryRead && attempt === 0) { await waitFor(250, signal); continue }
      throw new ServiceError('UPSTREAM_UNAVAILABLE', `${options.service} is temporarily unavailable.`, 502)
    }
    const remaining = response.headers.get('x-ratelimit-remaining')
    const limited = response.status === 429 || (response.status === 403 && remaining === '0')
    if (!response.ok) {
      await response.body?.cancel()
      const retryAfter = Math.max(1, Number(response.headers.get('retry-after')) || 60)
      if (options.retryRead && attempt === 0 && ((limited && retryAfter <= 2) || response.status >= 500)) { await waitFor(limited ? retryAfter * 1000 : 250, signal); continue }
      if (limited) throw new ServiceError('UPSTREAM_RATE_LIMIT', `${options.service} is busy. Please try again later.`, 429, retryAfter)
      if ([401, 403].includes(response.status)) throw new ServiceError('UPSTREAM_CONFIGURATION', `${options.service} credentials or permissions need to be configured.`, 503)
      throw new ServiceError('UPSTREAM_UNAVAILABLE', `${options.service} returned an error. Please try again later.`, 502)
    }
    try { return { data: await readBoundedJson(response, options.maxBytes ?? 2 * 1024 * 1024), headers: response.headers } } catch (error) {
      if (signal.aborted) throw new ServiceError('TIMEOUT', `${options.service} timed out. Please try again.`, 504)
      throw error
    }
  }
}
