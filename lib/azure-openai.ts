import { ServiceError } from '@/lib/service-error'
import { serviceJson } from '@/lib/service-fetch'
const DEFAULT_AZURE_MODEL = 'gpt-5.4'

export type AzureOpenAiReasoningEffort = 'none' | 'low' | 'medium' | 'high'

type AzureChatMessage = {
  role: 'system' | 'user'
  content: string
}

function readTrimmedEnv(name: string): string | null {
  const value = process.env[name]?.trim()
  return value || null
}

function parseReasoningEffort(
  raw: string | null,
  fallback: AzureOpenAiReasoningEffort
): AzureOpenAiReasoningEffort {
  switch (raw?.toLowerCase()) {
    case 'none':
    case 'low':
    case 'medium':
    case 'high':
      return raw.toLowerCase() as AzureOpenAiReasoningEffort
    default:
      return fallback
  }
}

function parseDeploymentNameMap(): Map<string, string> {
  const raw = readTrimmedEnv('AZURE_OPENAI_DEPLOYMENT_NAME_MAP')
  const map = new Map<string, string>()
  if (!raw) return map

  for (const entry of raw.split(/[\n,;]+/)) {
    const trimmed = entry.trim()
    if (!trimmed) continue
    const equalsIdx = trimmed.indexOf('=')
    if (equalsIdx === -1) {
      map.set(DEFAULT_AZURE_MODEL, trimmed)
      continue
    }
    const key = trimmed.slice(0, equalsIdx).trim()
    const value = trimmed.slice(equalsIdx + 1).trim()
    if (key && value) {
      map.set(key, value)
    }
  }

  return map
}

function extractErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const err = (data as { error?: unknown }).error
  if (typeof err === 'string' && err.trim()) return err.trim()
  if (err && typeof err === 'object' && 'message' in err) {
    const message = (err as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) {
      return message.trim()
    }
  }
  return null
}

function extractMessageText(content: unknown): string {
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''

  return content
    .map((part) =>
      part && typeof part === 'object' && 'text' in part
        ? String((part as { text: unknown }).text)
        : ''
    )
    .join('')
    .trim()
}

export function getAzureOpenAiApiKey(): string | null {
  return readTrimmedEnv('AZURE_OPENAI_API_KEY')
}

export function getAzureOpenAiBaseUrl(): string | null {
  return readTrimmedEnv('AZURE_OPENAI_BASE_URL')
}

export function getAzureQuickModel(): string {
  return readTrimmedEnv('AZURE_OPENAI_MODEL') || DEFAULT_AZURE_MODEL
}

export function getAzureQuickReasoningEffort(): AzureOpenAiReasoningEffort {
  return parseReasoningEffort(
    readTrimmedEnv('AZURE_OPENAI_REASONING_EFFORT'),
    'low'
  )
}

export function resolveAzureDeploymentName(
  model: string,
  explicitEnvName?: string
): string {
  if (explicitEnvName) {
    const explicitDeployment = readTrimmedEnv(explicitEnvName)
    if (explicitDeployment) return explicitDeployment
  }

  return parseDeploymentNameMap().get(model) || model
}

export function buildAzureOpenAiUrl(path: string): string {
  const baseUrl = getAzureOpenAiBaseUrl()
  if (!baseUrl) {
    throw new ServiceError('CONFIGURATION', 'AZURE_OPENAI_BASE_URL is not configured.', 503)
  }
  let url: URL
  try { url = new URL(baseUrl) } catch { throw new ServiceError('CONFIGURATION', 'Azure endpoint must be a valid HTTPS URL.', 503) }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new ServiceError('CONFIGURATION', 'Azure endpoint must use HTTPS without credentials, query or fragment.', 503)
  return `${url.href.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

export function buildAzureChatCompletionsBody(opts: {
  model: string
  messages: AzureChatMessage[]
  reasoningEffort?: AzureOpenAiReasoningEffort
  maxCompletionTokens?: number
  deploymentEnvName?: string
  responseSchema?: Record<string, unknown>
}): Record<string, unknown> {
  return {
    model: resolveAzureDeploymentName(opts.model, opts.deploymentEnvName),
    messages: opts.messages,
    ...(opts.responseSchema ? { response_format: { type: 'json_schema', json_schema: { name: 'coding_preferences', strict: true, schema: opts.responseSchema } } } : {}),
    ...(opts.reasoningEffort
      ? { reasoning_effort: opts.reasoningEffort }
      : {}),
    ...(opts.maxCompletionTokens !== undefined
      ? { max_completion_tokens: opts.maxCompletionTokens }
      : {}),
  }
}

export async function generateAzureChatText(opts: {
  model: string
  systemPrompt: string
  userMessage: string
  reasoningEffort?: AzureOpenAiReasoningEffort
  maxCompletionTokens?: number
  deploymentEnvName?: string
  responseSchema?: Record<string, unknown>
  signal?: AbortSignal
  onUsage?: (usage: unknown) => void
}): Promise<string> {
  const apiKey = getAzureOpenAiApiKey()
  if (!apiKey) {
    throw new ServiceError('CONFIGURATION', 'AZURE_OPENAI_API_KEY is not configured.', 503)
  }

  const { data } = await serviceJson(buildAzureOpenAiUrl('chat/completions'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(
      buildAzureChatCompletionsBody({
        model: opts.model,
        messages: [
          { role: 'system', content: opts.systemPrompt },
          { role: 'user', content: opts.userMessage },
        ],
        reasoningEffort: opts.reasoningEffort,
        maxCompletionTokens: opts.maxCompletionTokens,
        deploymentEnvName: opts.deploymentEnvName,
        responseSchema: opts.responseSchema,
      })
    ),
  }, { service: 'Azure OpenAI', timeoutMs: 60_000, maxBytes: 256 * 1024, signal: opts.signal })
  if (!data || typeof data !== 'object') throw new ServiceError('INVALID_RESPONSE', 'Azure OpenAI returned invalid data.')
  const upstreamError = extractErrorMessage(data)
  if (upstreamError) throw new ServiceError('INVALID_RESPONSE', 'Azure OpenAI could not complete the generation.')
  opts.onUsage?.((data as { usage?: unknown }).usage)

  const choices = (data as { choices?: unknown }).choices
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new ServiceError('INVALID_RESPONSE', 'Azure OpenAI returned no choices.')
  }

  const first = choices[0] as { finish_reason?: string; message?: { content?: unknown; refusal?: unknown } }
  if (first.finish_reason !== 'stop' || first.message?.refusal) throw new ServiceError('INCOMPLETE_GENERATION', 'The model could not produce a complete skill. Please try again.')
  const text = extractMessageText(first.message?.content)
  if (!text) {
    throw new ServiceError('INVALID_RESPONSE', 'Azure OpenAI returned an empty response.')
  }

  return text
}
