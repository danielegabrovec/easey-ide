import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseSize, pickChatModel, pickCompletionModel, type AiChatChunk, type AiModel } from '@shared/contracts/ai'
import { AiService } from '../../src/main/services/ai/ai-service'
import { cleanCompletion, isRemoteModel, OllamaProvider } from '../../src/main/services/ai/ollama-provider'
import { OpenAiCompatibleProvider, openAiBase } from '../../src/main/services/ai/openai-provider'

const model = (name: string, size: string, capabilities: string[], remote = false): AiModel => ({ name, size, family: '', capabilities, remote })

describe('scelta dei modelli', () => {
  const models = [
    model('gpt-oss:20b', '20.9B', ['completion', 'tools', 'thinking']),
    model('qwen2.5-coder:14b', '14.8B', ['completion', 'insert']),
    model('qwen2.5-coder:1.5b-base', '1.5B', ['completion', 'insert']),
    model('gemma4:latest', '8.0B', ['completion', 'vision']),
    model('qwen3-coder-next:cloud', '80B', ['completion', 'insert'], true),
    model('nomic-embed-text:latest', '137M', ['embedding'])
  ]
  it('autocompletamento: il più piccolo con "insert", mai remoto', () => {
    expect(pickCompletionModel(models, '')).toBe('qwen2.5-coder:1.5b-base')
    expect(pickCompletionModel(models, 'qwen2.5-coder:14b')).toBe('qwen2.5-coder:14b')
    expect(pickCompletionModel([models[0]!], '')).toBeNull()
  })
  it('chat: preferenze note, niente embedding né cloud', () => {
    expect(pickChatModel(models, '')).toBe('gemma4:latest')
    expect(pickChatModel(models, 'gpt-oss:20b')).toBe('gpt-oss:20b')
    expect(pickChatModel(models, 'inesistente')).toBe('gemma4:latest')
    expect(pickChatModel([models[4]!, models[5]!], '')).toBeNull()
  })
  it('dimensioni e modelli remoti', () => {
    expect(parseSize('137M')).toBeLessThan(parseSize('1.5B'))
    expect(isRemoteModel('gemma4:31b-cloud')).toBe(true)
    expect(isRemoteModel('qwen3-coder-next:cloud')).toBe(true)
    expect(isRemoteModel('gemma4:latest')).toBe(false)
  })
})

describe('cleanCompletion', () => {
  it('toglie i recinti di codice e la ripetizione del testo dopo il cursore', () => {
    expect(cleanCompletion('```ts\nreturn a + b\n```', '')).toBe('return a + b')
    expect(cleanCompletion('return a + b\n}\nconsole.log(somma(1, 2))', '\n}\nconsole.log(somma(1, 2))')).toBe('return a + b')
  })
  it('non richiude il blocco già chiuso dopo il cursore', () => {
    expect(cleanCompletion('return a + b\n}\n\n// altra funzione\nfunction ', '\n}')).toBe('return a + b')
    expect(cleanCompletion('if (x) {\n    y()\n  }\n  return z\n}', '\n}')).toBe('if (x) {\n    y()\n  }\n  return z')
    expect(cleanCompletion('a, b', ')')).toBe('a, b')
    expect(cleanCompletion('return 1\nfunction b() {}', '')).toBe('return 1\nfunction b() {}')
  })
})

describe('OllamaProvider con un server finto', () => {
  let server: Server
  let endpoint = ''
  const requests: { url: string; body: Record<string, unknown> }[] = []

  const readBody = (req: IncomingMessage) =>
    new Promise<Record<string, unknown>>((resolve) => {
      let data = ''
      req.on('data', (c) => (data += c))
      req.on('end', () => resolve(data ? JSON.parse(data) : {}))
    })

  beforeAll(async () => {
    server = createServer(async (req, res) => {
      const body = await readBody(req)
      requests.push({ url: req.url ?? '', body })
      if (req.url === '/api/tags') {
        res.end(JSON.stringify({ models: [{ name: 'coder:1b', details: { parameter_size: '1B', family: 'qwen2' }, capabilities: ['completion', 'insert'] }, { name: 'chat:8b', details: { parameter_size: '8B' }, capabilities: ['completion', 'thinking'] }] }))
      } else if (req.url === '/api/version') {
        res.end(JSON.stringify({ version: '9.9.9' }))
      } else if (req.url === '/api/generate') {
        res.end(JSON.stringify({ response: 'return a + b;', done: true }))
      } else if (req.url === '/api/chat') {
        res.write(JSON.stringify({ message: { role: 'assistant', content: '', thinking: 'penso…' } }) + '\n')
        res.write(JSON.stringify({ message: { role: 'assistant', content: 'Cia' } }) + '\n' + JSON.stringify({ message: { role: 'assistant', content: 'o!' } }))
        setTimeout(() => res.end('\n' + JSON.stringify({ done: true }) + '\n'), 20)
      } else {
        res.statusCode = 404
        res.end('no')
      }
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

  it('stato, versione e capacità dei modelli', async () => {
    const status = await new OllamaProvider(() => endpoint).status()
    expect(status).toMatchObject({ available: true, version: '9.9.9' })
    expect(status.models.map((m) => [m.name, m.capabilities.includes('insert')])).toEqual([
      ['coder:1b', true],
      ['chat:8b', false]
    ])
  })

  it('completamento fill-in-the-middle con suffix', async () => {
    const provider = new OllamaProvider(() => endpoint)
    await provider.status()
    const text = await provider.complete({ requestId: 'x', model: 'coder:1b', prefix: 'function somma(a, b) {\n  ', suffix: '\n}', language: 'javascript' }, new AbortController().signal)
    expect(text).toBe('return a + b;')
    const sent = requests.filter((r) => r.url === '/api/generate').at(-1)!.body
    expect(sent).toMatchObject({ model: 'coder:1b', suffix: '\n}', stream: false })
  })

  it('chat in streaming: pezzi e ragionamento, think disattivato', async () => {
    const provider = new OllamaProvider(() => endpoint)
    await provider.status()
    const chunks: AiChatChunk[] = []
    const service = new AiService(() => provider, (chunk) => chunks.push(chunk))
    service.chat({ requestId: 'c1', model: 'chat:8b', messages: [{ role: 'user', content: 'ciao' }] })
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(chunks.map((c) => c.content ?? c.thinking ?? (c.done ? 'FINE' : ''))).toEqual(['penso…', 'Cia', 'o!', 'FINE'])
    expect(requests.filter((r) => r.url === '/api/chat').at(-1)!.body['think']).toBe(false)
  })

  it('server spento: stato non disponibile, nessuna eccezione', async () => {
    const status = await new OllamaProvider(() => 'http://127.0.0.1:9').status()
    expect(status.available).toBe(false)
    expect(status.error).toBeTruthy()
  })

  it('annullamento: il completamento restituisce stringa vuota', async () => {
    const provider = new OllamaProvider(() => endpoint)
    const service = new AiService(() => provider, () => undefined)
    const pending = service.complete({ requestId: 'z', model: 'coder:1b', prefix: 'x', suffix: '', language: 'ts' })
    service.cancel('z')
    expect(await pending).toBe('')
  })
})

describe('fornitore compatibile OpenAI (LM Studio, llama.cpp…)', () => {
  let server: Server
  let endpoint = ''
  const seen: { url: string; auth?: string; body: Record<string, unknown> }[] = []

  beforeAll(async () => {
    server = createServer(async (req, res) => {
      let raw = ''
      for await (const chunk of req) raw += chunk
      seen.push({ url: req.url ?? '', auth: req.headers.authorization, body: raw ? (JSON.parse(raw) as Record<string, unknown>) : {} })
      if (req.url === '/v1/models') {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ data: [{ id: 'qwen2.5-coder-1.5b' }, { id: 'gemma-4-e4b' }, { id: 'text-embedding-nomic' }] }))
      } else if (req.url === '/v1/chat/completions') {
        res.setHeader('Content-Type', 'text/event-stream')
        const events = [{ choices: [{ delta: { reasoning_content: 'penso' } }] }, { choices: [{ delta: { content: 'Cia' } }] }, { choices: [{ delta: { content: 'o!' } }] }]
        for (const event of events) res.write(`data: ${JSON.stringify(event)}\n\n`)
        res.end('data: [DONE]\n\n')
      } else if (req.url === '/v1/completions') {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ choices: [{ text: 'return a + b;\n}\n' }] }))
      } else {
        res.statusCode = 404
        res.end()
      }
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(() => new Promise((resolve) => server.close(resolve)))

  it('indirizzo con o senza /v1', () => {
    expect(openAiBase('http://127.0.0.1:1234')).toBe('http://127.0.0.1:1234/v1')
    expect(openAiBase('http://127.0.0.1:1234/v1/')).toBe('http://127.0.0.1:1234/v1')
  })

  it('modelli (senza embedding), chiave API, chat in streaming e completamento', async () => {
    const provider = new OpenAiCompatibleProvider(() => endpoint, () => 'segreta')
    const status = await provider.status()
    expect(status.available).toBe(true)
    expect(status.models.map((m) => m.name)).toEqual(['qwen2.5-coder-1.5b', 'gemma-4-e4b'])
    expect(pickCompletionModel(status.models, '')).toBe('qwen2.5-coder-1.5b')
    expect(pickChatModel(status.models, '')).toBe('gemma-4-e4b')
    expect(seen[0]!.auth).toBe('Bearer segreta')

    const chunks: AiChatChunk[] = []
    const service = new AiService(() => provider, (chunk) => chunks.push(chunk))
    service.chat({ requestId: 'o1', model: 'gemma-4-e4b', messages: [{ role: 'user', content: 'ciao' }] })
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(chunks.map((c) => c.content ?? c.thinking ?? (c.done ? 'FINE' : ''))).toEqual(['penso', 'Cia', 'o!', 'FINE'])
    expect(seen.find((r) => r.url === '/v1/chat/completions')!.body).toMatchObject({ model: 'gemma-4-e4b', stream: true })

    const text = await service.complete({ requestId: 'o2', model: 'qwen2.5-coder-1.5b', prefix: 'function somma(a, b) {\n  ', suffix: '\n}', language: 'js' })
    expect(text).toBe('return a + b;')
    expect(seen.find((r) => r.url === '/v1/completions')!.body).toMatchObject({ suffix: '\n}', max_tokens: 80 })
  })

  it('server spento: non disponibile', async () => {
    const status = await new OpenAiCompatibleProvider(() => 'http://127.0.0.1:9', () => '').status()
    expect(status.available).toBe(false)
  })
})
