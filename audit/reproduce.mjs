import fs from 'node:fs/promises'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const root = path.resolve(import.meta.dirname, '..')
const results = []
async function loadTs(relative, mocks = {}) {
  const source = await fs.readFile(path.join(root, relative), 'utf8')
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const exports = {}
  const context = vm.createContext({
    exports, require: (id) => id in mocks ? mocks[id] : require(id),
    process: { env: {} }, fetch: mocks.fetch, URL, console,
  })
  vm.runInContext(code, context, { filename: relative })
  return exports
}

const parsers = await loadTs('lib/parse-github-profile.ts')
const skill = await loadTs('lib/generate-skill.ts')
const route = await loadTs('app/api/generate-skill/route.ts', {
  '@/lib/azure-openai': {}, '@/lib/generate-skill': skill,
  '@/lib/github-client': {}, '@/lib/parse-github-profile': parsers,
})
try {
  await route.POST({ json: async () => null })
  results.push({ check: 'JSON null', reproduced: false })
} catch (error) {
  results.push({ check: 'JSON null escapes route error handling', reproduced: true, error: error.message })
}

const routeSource = await fs.readFile(path.join(root, 'app/api/generate-skill/route.ts'), 'utf8')
const selectionSource = routeSource.slice(routeSource.indexOf('function selectReposForDeepDive'), routeSource.indexOf('export async function POST'))
const selectionCode = ts.transpileModule(selectionSource, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
const context = vm.createContext({})
vm.runInContext(selectionCode, context)
const repo = (name, stars) => ({ nameWithOwner: `owner/${name}`, stargazerCount: stars, forkCount: 0, isArchived: false })
const selected = context.selectReposForDeepDive([repo('a', 100), repo('b', 80), repo('a', 100), repo('b', 80), repo('c', 50)])
results.push({ check: 'Duplicate repositories consume analysis slots', selected: selected.map(r => r.nameWithOwner), unique: new Set(selected.map(r => r.nameWithOwner)).size })

const markdown = skill.buildSkillMarkdown({ styleGuide: '## Philosophy\n- Small tools\n\n## Tech Stack\n- TypeScript' })
results.push({ check: 'Generated bundle has no deterministic required frontmatter', hasFrontmatter: markdown.startsWith('---\n'), markdown })

const cliSource = await fs.readFile(path.join(root, 'bin/gittoskill.mjs'), 'utf8')
const cliCode = cliSource.replace(/^#!.*\n/, '').replace(/^import .*\n/gm, '').replace(/^const require = createRequire\(import.meta.url\)\r?\n/m, '').replace(/main\(\)\.catch\([\s\S]*$/, '')
const writes = []
const cliContext = vm.createContext({
  path, os: {}, process: { env: {} }, console, URL,
  mkdir: async () => {}, writeFile: async (file) => writes.push(file),
})
vm.runInContext(cliCode, cliContext)
const target = path.join(root, 'audit', 'virtual-staging')
await cliContext.writeGeneratedSkillBundle(target, { skillMarkdown: markdown, references: [{ path: '../escaped.md', content: 'fixture' }] })
results.push({ check: 'Reference path escapes staging directory (intercepted writes only)', relativeWrites: writes.map(p => path.relative(target, p)) })
results.push({ check: 'CLI accepts invalid username in URL while server rejects it', cli: cliContext.parseGitHubProfileInput('https://github.com/foo.bar'), server: parsers.parseGitHubProfileInput('https://github.com/foo.bar') })
vm.runInContext('getGitRoot = async () => "C:/audit-fixture"; pathExists = async () => true', cliContext)
try {
  await cliContext.ensureInstalledSkillIgnored({ slug: 'fixture-skill' })
  results.push({ check: 'Undefined readTextIfExists after installation', reproduced: false })
} catch (error) {
  results.push({ check: 'Undefined readTextIfExists after installation', reproduced: true, error: error.message })
}

let githubCalls = 0
// The client reads a token at runtime; use a synthetic value in this isolated VM.
const githubSource = await fs.readFile(path.join(root, 'lib/github-client.ts'), 'utf8')
const githubCode = ts.transpileModule(githubSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const githubContext = vm.createContext({ exports: {}, process: { env: { GITHUB_TOKEN: 'audit-fixture' } }, fetch: async () => {
  githubCalls++
  return { ok: true, json: async () => ({ data: { user: { login: 'fixture', url: 'https://github.com/fixture', avatarUrl: 'https://example.invalid/avatar', repositories: { nodes: [] } } }, ...(githubCalls === 1 ? { errors: [{ message: 'Could not resolve to a repository with the name fixture/fixture' }] } : {}) }) }
} })
vm.runInContext(githubCode, githubContext)
await githubContext.exports.getGitHubProfileOverview('fixture')
results.push({ check: 'Missing optional profile README repeats successful user query', githubCalls })

const azureSource = await fs.readFile(path.join(root, 'lib/azure-openai.ts'), 'utf8')
const azureCode = ts.transpileModule(azureSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const azureContext = vm.createContext({ exports: {}, process: { env: { AZURE_OPENAI_API_KEY: 'audit-fixture', AZURE_OPENAI_BASE_URL: 'https://example.invalid/openai/v1' } }, fetch: async () => ({ ok: true, json: async () => ({ choices: [{ finish_reason: 'length', message: { content: '## Philosophy\n- Partial' } }] }) }) })
vm.runInContext(azureCode, azureContext)
const partial = await azureContext.exports.generateAzureChatText({ model: 'fixture', systemPrompt: 'fixture', userMessage: 'fixture' })
results.push({ check: 'Truncated model output is accepted as complete', accepted: partial })

await fs.writeFile(path.join(root, 'audit/reproduction-results.json'), JSON.stringify(results, null, 2) + '\n')
console.log(JSON.stringify(results, null, 2))
