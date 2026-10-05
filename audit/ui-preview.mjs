// Loopback-only UI verification fixture. Never deploy this server.
import http from 'node:http'
import { fixtureBundle } from '../tests/helpers.mjs'
import { parseGitHubProfileInput } from '../packages/cli/src/profile.mjs'
import { loadTs } from '../tests/helpers.mjs'
const { renderObservations } = loadTs('lib/profile-analysis.ts')

const server = http.createServer(async (req, res) => {
  if (req.url === '/api/generate-skill' && req.method === 'POST') {
    let input = ''
    for await (const chunk of req) {
      input += chunk
      if (input.length > 4096) { res.writeHead(413); res.end(); return }
    }
    const login = parseGitHubProfileInput(JSON.parse(input).profile)?.login
    if (!login) { res.writeHead(400); res.end(); return }
    if (login === 'slowfixture') await new Promise(resolve => setTimeout(resolve, 15000))
    if (login === 'errorfixture') {
      res.writeHead(503, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ code: 'CONFIGURATION', error: 'Provider configuration fixture' }))
      return
    }
    const bundle = fixtureBundle(login)
    bundle.displayName = 'UI verification fixture'
    bundle.generatedAt = '2026-10-05T10:00:00.000Z'
    const source = (id, repo, path, attribution = 'project') => ({ id, repo, path, attribution, url: `https://github.com/${repo}/blob/abc123/${path}#L10-L24`, startLine: 10, endLine: 24 })
    const sources = [source('e0', `${login}/toolkit`, 'src/domain/validate.ts', 'verified'), source('e1', `${login}/dashboard`, 'src/lib/validate.ts'), source('e2', `${login}/toolkit`, 'tests/validate.test.ts', 'verified'), source('e3', `${login}/dashboard`, 'src/app/globals.css')]
    const observations = login === 'minimalfixture' ? [] : [
      { section: 'Philosophy', text: 'Keep validation close to the public module boundary.', support: 'single-project', sources: [sources[0]] },
      { section: 'Code Style', text: 'Use small, typed functions that make invalid input explicit.', support: 'repeated', sources: sources.slice(0, 2) },
      { section: 'Testing', text: 'Test both the valid result and the rejected input at the module boundary.', support: 'single-project', sources: [sources[2]] },
      { section: 'UI Taste', text: 'Use shared color tokens and visible keyboard focus for interactive controls.', support: 'single-project', sources: [sources[3]] },
    ]
    if (login === 'orgfixture') for (const item of sources) item.attribution = 'project'
    bundle.analysis = {
      version: 3, profileType: login === 'orgfixture' ? 'Organization' : 'User',
      coverage: { level: observations.length ? 'broad' : 'minimal', repositories: observations.length ? 2 : 0, sources: observations.length ? 4 : 0, codeSamples: observations.length ? 3 : 0, attributedSamples: observations.length && login !== 'orgfixture' ? 2 : 0 },
      repositories: observations.length ? ['toolkit', 'dashboard'].map((name, i) => ({ name: `${login}/${name}`, url: `https://github.com/${login}/${name}`, language: 'TypeScript', relationship: 'owned', files: 2, attributedSamples: i === 0 && login !== 'orgfixture' ? 2 : 0 })) : [],
      observations,
      limitations: ['This is synthetic UI verification data, not a real GitHub analysis.', login === 'orgfixture' ? 'Organization conventions describe projects and teams, not an individual developer.' : 'A bounded public sample cannot represent private work or the full history.'],
    }
    bundle.skillMarkdown = bundle.skillMarkdown.split('## Philosophy')[0] + renderObservations(observations)
    bundle.references[0].content = '# Préférences 🎯\nLocal test fixture, not a real GitHub analysis.\n'
    res.writeHead(200, { 'Content-Type': 'application/json', 'X-GitToSkill-Cache': login === 'cachedfixture' ? 'HIT' : 'MISS', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify(bundle))
    return
  }
  const upstream = http.request({ hostname: '127.0.0.1', port: 3217, path: req.url, method: req.method, headers: req.headers }, response => {
    res.writeHead(response.statusCode, response.headers)
    response.pipe(res)
  })
  upstream.on('error', () => { res.writeHead(502); res.end() })
  req.pipe(upstream)
})
server.listen(3218, '127.0.0.1', () => console.log('UI fixture http://127.0.0.1:3218'))
