import test from 'node:test'
import assert from 'node:assert/strict'
import { fixtureBundle, loadTs } from './helpers.mjs'

test('cache coalesces simultaneous generations, reuses output, and bounds quotas', async () => {
  const { MemoryStore, cachedGeneration, enforceRequestLimit } = loadTs('lib/generation-store.ts')
  const store = new MemoryStore()
  let calls = 0
  const generate = async () => { calls++; await new Promise(resolve => setTimeout(resolve, 25)); return fixtureBundle() }
  const concurrent = await Promise.all(Array.from({ length: 8 }, () => cachedGeneration(store, 'key', 'fixture', generate)))
  assert.equal(calls, 1)
  assert.equal(concurrent.filter(item => item.cache === 'MISS').length, 1)
  assert.equal((await cachedGeneration(store, 'key', 'fixture', generate)).cache, 'HIT')
  for (let i = 0; i < 30; i++) await enforceRequestLimit(store, 'client')
  await assert.rejects(enforceRequestLimit(store, 'client'), error => error.status === 429)
})

test('failed generation releases locks, bad caches regenerate, quotas are atomic', async () => {
  const { MemoryStore, cachedGeneration } = loadTs('lib/generation-store.ts')
  const store = new MemoryStore()
  await assert.rejects(cachedGeneration(store, 'failure', 'fixture', async () => { throw new Error('failed') }), /failed/)
  assert.equal(await store.get('lock:failure'), null)
  await store.set('result:failure', '{"bad":true}', 60)
  assert.equal((await cachedGeneration(store, 'failure', 'fixture', async () => fixtureBundle())).cache, 'MISS')
  const consumed = await Promise.all(Array.from({ length: 20 }, () => store.consume('quota', 5, 60)))
  assert.equal(consumed.filter(Boolean).length, 5)
  await store.lock('protected', 'owner', 60)
  await store.unlock('protected', 'other')
  assert.equal(await store.get('protected'), 'owner')
})

test('production requires shared storage unless single-instance fallback is explicit', () => {
  assert.throws(() => loadTs('lib/generation-store.ts', { env: { NODE_ENV: 'production' } }).generationStore(), error => error.status === 503)
  assert.ok(loadTs('lib/generation-store.ts', { env: { NODE_ENV: 'production', GITTOSKILL_ALLOW_MEMORY_STORE: 'true' } }).generationStore())
})

test('repo selection preserves four distinct sources and language diversity', () => {
  const { selectReposForDeepDive } = loadTs('lib/github-client.ts')
  const repo = (name, language, stars) => ({ nameWithOwner: `owner/${name}`, primaryLanguage: language, stargazerCount: stars, forkCount: 0, updatedAt: new Date().toISOString(), isArchived: false })
  const selected = selectReposForDeepDive([repo('a', 'TypeScript', 100), repo('a', 'TypeScript', 100), repo('b', 'Python', 80), repo('c', 'Go', 50), repo('d', 'TypeScript', 20)])
  assert.equal(selected.length, 4)
  assert.equal(new Set(selected.map(item => item.nameWithOwner)).size, 4)
  assert.equal(new Set(selected.map(item => item.primaryLanguage)).size, 3)
})

test('Azure rejects truncated and refused output without a second paid attempt', async () => {
  for (const choice of [{ finish_reason: 'length', message: { content: 'partial' } }, { finish_reason: 'stop', message: { refusal: 'no', content: 'partial' } }]) {
    let calls = 0
    const azure = loadTs('lib/azure-openai.ts', { env: { AZURE_OPENAI_API_KEY: 'fixture', AZURE_OPENAI_BASE_URL: 'https://example.invalid/openai/v1' }, fetch: async () => { calls++; return Response.json({ choices: [choice] }) } })
    await assert.rejects(azure.generateAzureChatText({ model: 'fixture', userMessage: 'fixture', systemPrompt: 'fixture' }), error => error.code === 'INCOMPLETE_GENERATION')
    assert.equal(calls, 1)
  }
})

test('Azure endpoint rejects insecure or credential-bearing URLs before a network call', async () => {
  for (const base of ['http://example.invalid/openai/v1', 'http://localhost:3000', 'https://user:fixture@example.invalid', 'https://example.invalid?key=fixture', 'https://example.invalid/#fragment', 'not-a-url']) {
    let calls = 0
    const azure = loadTs('lib/azure-openai.ts', { env: { AZURE_OPENAI_API_KEY: 'fixture', AZURE_OPENAI_BASE_URL: base }, fetch: async () => { calls++; throw new Error('Network must not be called') } })
    await assert.rejects(azure.generateAzureChatText({ model: 'fixture', userMessage: 'fixture', systemPrompt: 'fixture' }), error => error.code === 'CONFIGURATION')
    assert.equal(calls, 0)
  }
  const azure = loadTs('lib/azure-openai.ts', { env: { AZURE_OPENAI_BASE_URL: 'https://example.invalid/openai/v1/' } })
  assert.equal(azure.buildAzureOpenAiUrl('chat/completions'), 'https://example.invalid/openai/v1/chat/completions')
})

test('analysis rejects invented sources and UI claims without design evidence', () => {
  const { renderAnalysis } = loadTs('lib/profile-analysis.ts')
  const evidence = [{ id: 'e0', repo: 'owner/repo', path: 'package.json', category: 'stack', content: '{}', commit: 'abc123' }]
  assert.throws(() => renderAnalysis(JSON.stringify({ sections: [{ title: 'Tech Stack', traits: [{ text: 'TypeScript', evidenceIds: ['invented'] }] }] }), evidence), /supporting evidence/)
  assert.throws(() => renderAnalysis(JSON.stringify({ sections: [{ title: 'UI Taste', traits: [{ text: 'Purple', evidenceIds: ['e0'] }] }] }), evidence), /supporting evidence/)
  const valid = renderAnalysis(JSON.stringify({ sections: [{ title: 'Tech Stack', traits: [{ text: 'TypeScript', evidenceIds: ['e0'] }] }] }), evidence)
  assert.match(valid, /owner\/repo\/blob\/abc123\/package.json/)
})
