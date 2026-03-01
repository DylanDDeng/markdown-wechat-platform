import { requestUrl } from 'obsidian'

const OPENROUTER_CHAT_COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions'

export type GenerateHtmlWithOpenRouterParams = {
  apiKey: string
  model: string
  systemPrompt: string
  userPrompt: string
  timeoutMs?: number
  retries?: number
}

class OpenRouterHttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'OpenRouterHttpError'
    this.status = status
  }
}

type OpenRouterContentPart = {
  text?: string
  type?: string
}

type OpenRouterResponse = {
  choices?: Array<{
    message?: {
      content?: string | OpenRouterContentPart[]
    }
  }>
  error?: {
    message?: string
  }
}

function parseMessageContent(content: string | OpenRouterContentPart[] | undefined): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .join('')
    .trim()
}

function shouldRetry(error: unknown): boolean {
  if (error instanceof OpenRouterHttpError) {
    if (error.status === 429) return true
    if (error.status >= 500) return true
    return false
  }

  if (error instanceof DOMException && error.name === 'AbortError') return true
  if (error instanceof TypeError) return true
  return false
}

async function requestOnce(
  params: GenerateHtmlWithOpenRouterParams,
  timeoutMs?: number,
): Promise<string> {
  const requestPromise = requestUrl({
    url: OPENROUTER_CHAT_COMPLETIONS_URL,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      model: params.model,
      messages: [
        { role: 'system', content: params.systemPrompt },
        { role: 'user', content: params.userPrompt },
      ],
    }),
    throw: false,
  })

  const response =
    typeof timeoutMs === 'number' && timeoutMs > 0
      ? await Promise.race([
          requestPromise,
          new Promise<never>((_, reject) => {
            const id = window.setTimeout(() => {
              reject(new DOMException('OpenRouter request timed out', 'AbortError'))
            }, timeoutMs)
            requestPromise.finally(() => window.clearTimeout(id)).catch(() => {
              window.clearTimeout(id)
            })
          }),
        ])
      : await requestPromise
  const rawBody = response.text ?? ''
  let data: OpenRouterResponse = {}
  if (rawBody.trim().length) {
    try {
      data = JSON.parse(rawBody) as OpenRouterResponse
    } catch {
      data = {}
    }
  }

  if (response.status < 200 || response.status >= 300) {
    const message =
      data.error?.message?.trim() ||
      rawBody.trim() ||
      `OpenRouter request failed with status ${response.status}`
    throw new OpenRouterHttpError(response.status, message)
  }

  const content = parseMessageContent(data.choices?.[0]?.message?.content)
  if (!content.length) {
    throw new Error('Model returned empty content')
  }

  return content
}

export async function generateHtmlWithOpenRouter(
  params: GenerateHtmlWithOpenRouterParams,
): Promise<string> {
  const timeoutMs = params.timeoutMs
  const retries = params.retries ?? 1
  const attempts = Math.max(1, retries + 1)
  let lastError: unknown = null

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await requestOnce(params, timeoutMs)
    } catch (error) {
      lastError = error
      if (attempt >= attempts - 1 || !shouldRetry(error)) break
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}
