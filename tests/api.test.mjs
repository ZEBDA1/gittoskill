import test from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server.js'
import { loadTs, fixtureBundle } from './helpers.mjs'

const request = (body, contentType = 'application/json') => new NextRequest('http://localhost/api/generate-skill', { method: 'POST', headers: { 'Content-Type': contentType }, body })

test('API returns typed client errors for null, malformed, oversized and unsupported bodies', async () => {
  const { POST } = loadTs('app/api/generate-skill/route.ts')
  for (const [body, expected] of [['null', 400], ['{}', 400], ['[]', 400], ['{"profile":123}', 400], ['{', 400], ['{"profile":"a/b"}', 400], [' '.repeat(5000), 413]]) {
    const response = await POST(request(body))
    assert.equal(response.status, expected, body.slice(0, 50))
    assert.equal(typeof (await response.json()).error, 'string')
  }
  assert.equal((await POST(request('{}', 'text/plain'))).status, 415)
  assert.equal((await POST(request('{}', 'application/jsonp'))).status, 415)
})

test('API bounds stalled request bodies before generation', async () => {
  const { POST } = loadTs('app/api/generate-skill/route.ts')
  let cancelled = false
  const stream = new ReadableStream({ cancel() { cancelled = true } })
  const input = new NextRequest('http://localhost/api/generate-skill', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: stream, duplex: 'half' })
  const response = await POST(input)
  assert.equal(response.status, 408)
  assert.equal((await response.json()).code, 'REQUEST_TIMEOUT')
  assert.equal(cancelled, true)
})

test('API cache hit returns installable contract and cache/timing headers', async () => {
  const { POST } = loadTs('app/api/generate-skill/route.ts', { mocks: {
    '@/lib/generation-store': { generationStore: () => ({}), enforceRequestLimit: async () => {}, cachedGeneration: async () => ({ output: fixtureBundle(), cache: 'HIT' }) },
  } })
  const response = await POST(request('{"profile":"@fixture"}'))
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('X-GitToSkill-Cache'), 'HIT')
  assert.match(response.headers.get('Server-Timing'), /total;dur=/)
  assert.equal((await response.json()).login, 'fixture')
})

test('full generation uses public pinned evidence, real code, structured output and validated citations', async () => {
  const calls = []
  const repo = { name: 'demo', nameWithOwner: 'fixture/demo', url: 'https://github.com/fixture/demo', isPrivate: false, primaryLanguage: { name: 'Rust' }, defaultBranchRef: { target: { oid: 'abc123' } }, stargazerCount: 5 }
  const generate = loadTs('lib/generate-profile.ts', {
    env: { GITHUB_TOKEN: 'fixture-token', AZURE_OPENAI_API_KEY: 'fixture-key', AZURE_OPENAI_BASE_URL: 'https://azure.invalid/openai/v1' },
    fetch: async (url, init) => {
      const payload = JSON.parse(init.body)
      calls.push({ url, payload })
      assert.ok(init.signal)
      if (url.includes('azure.invalid')) {
        assert.equal(payload.response_format.json_schema.strict, true)
        assert.doesNotMatch(payload.messages[1].content, /private-secret/)
        assert.match(payload.messages[1].content, /pub fn main/)
        return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ sections: [{ title: 'Philosophy', traits: [{ text: 'Small tools', evidenceIds: ['e0'] }] }, { title: 'Tech Stack', traits: [{ text: 'Rust with a Cargo manifest', evidenceIds: ['e1'] }] }] }) } }], usage: { prompt_tokens: 200, completion_tokens: 100 } })
      }
      if (payload.query.includes('query Profile')) return Response.json({ data: { repositoryOwner: { login: 'fixture', name: 'Fixture', bio: 'Small tools', url: 'https://github.com/fixture', avatarUrl: 'https://example.invalid/avatar', pinnedItems: { nodes: [repo, { ...repo, nameWithOwner: 'fixture/private-secret', isPrivate: true }] }, repositories: { nodes: [repo] } }, profileReadme: { nameWithOwner: 'fixture/fixture', isPrivate: true } } })
      if (payload.query.includes('query Evidence')) {
        assert.doesNotMatch(payload.query, /private-secret|"fixture", name: "fixture"/)
        return Response.json({ data: { r0: { ...repo, dep0: { text: '[package]\nname="demo"', byteSize: 22 }, root: { entries: [{ name: 'main.rs', path: 'main.rs', type: 'blob' }] } } } })
      }
      if (payload.query.includes('query CodeSamples')) return Response.json({ data: { s0: { isPrivate: false, blob: { text: 'pub fn main() { let value = validate_input(); handle_result(value); }', byteSize: 16 } } } })
      throw new Error('Unexpected request')
    },
  })
  const output = await generate.generateProfile('fixture', AbortSignal.timeout(5000))
  assert.match(output.skillMarkdown, /^---\nname: fixture-coding-skill/)
  assert.match(output.skillMarkdown, /blob\/abc123\/Cargo.toml/)
  assert.equal(output.references.length, 3)
  assert.match(output.references[1].content, /main.rs/)
  assert.equal(output.analysis.version, 3)
  assert.equal(output.analysis.coverage.attributedSamples, 0)
  assert.equal(output.analysis.observations[0].support, 'single-project')
  assert.match(output.references[2].content, /not verified personal authorship/)
  assert.ok(loadTs('lib/skill-archive.ts').createSkillArchive(output).length > 1024)
  assert.equal(calls.length, 4)
})

test('profile README citations preserve actual filename and commit', async () => {
  const github = loadTs('lib/github-client.ts', { env: { GITHUB_TOKEN: 'fixture' }, fetch: async () => Response.json({ data: {
    r0: { nameWithOwner: 'fixture/fixture', url: 'https://github.com/fixture/fixture', isPrivate: false, defaultBranchRef: { target: { oid: 'abc123' } }, readmeLower: { text: 'Uses small tools', byteSize: 16 } },
  } }) })
  const overview = { login: 'fixture', bio: null, profileReadme: '', profileReadmeRepository: 'fixture/fixture', profileUrl: 'https://github.com/fixture' }
  await github.getGitHubEvidence(overview, [])
  const analysis = loadTs('lib/profile-analysis.ts')
  const evidence = analysis.collectEvidence(overview, [])
  const markdown = analysis.renderAnalysis(JSON.stringify({ sections: [{ title: 'Philosophy', traits: [{ text: 'Small tools', evidenceIds: ['e0'] }] }] }), evidence)
  assert.match(markdown, /blob\/abc123\/readme.md/)
})

test('missing optional profile README preserves partial GitHub data with one query', async () => {
  let calls = 0
  const github = loadTs('lib/github-client.ts', { env: { GITHUB_TOKEN: 'fixture' }, fetch: async () => {
    calls++
    return Response.json({ data: { repositoryOwner: { login: 'fixture', url: 'https://github.com/fixture', avatarUrl: 'fixture' }, profileReadme: null }, errors: [{ type: 'NOT_FOUND', message: 'Could not resolve to a repository', path: ['profileReadme'] }] })
  } })
  assert.equal((await github.getGitHubProfileOverview('fixture')).login, 'fixture')
  assert.equal(calls, 1)
})

test('upstream rate limits and large responses are bounded without exposing provider bodies', async () => {
  const fetcher = loadTs('lib/service-fetch.ts', { fetch: async () => new Response('sensitive-provider-error', { status: 429, headers: { 'Retry-After': '12' } }) })
  await assert.rejects(fetcher.serviceJson('https://example.invalid', {}, { service: 'GitHub' }), error => error.status === 429 && error.retryAfter === 12 && !error.message.includes('sensitive'))
  await assert.rejects(fetcher.readBoundedJson(Response.json({ large: 'a'.repeat(1024) }), 128), error => error.code === 'RESPONSE_TOO_LARGE')
})
