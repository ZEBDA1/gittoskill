import { githubGraph } from '@/lib/github-client'
import type { GitHubProfileOverview, GitHubProfileRepo, GitHubRepoStyleDetails } from '@/lib/github-client'

type Blob = { text?: string | null; byteSize?: number; isBinary?: boolean; isTruncated?: boolean }
export type TreeEntry = { path: string; name?: string; type: string }
type Tree = { entries?: TreeEntry[] }
type Node = { nameWithOwner?: string; url?: string; description?: string; isPrivate?: boolean; isFork?: boolean; isTemplate?: boolean; defaultBranchRef?: { target?: { oid?: string } }; activity?: { history?: { totalCount?: number } } } & Record<string, unknown>
type BlameRange = { startingLine: number; endingLine: number; commit?: { author?: { user?: { login?: string } } } }
const manifests: Record<string, string[]> = {
  python: ['pyproject.toml', 'requirements.txt'], rust: ['Cargo.toml'], go: ['go.mod'], ruby: ['Gemfile'],
  php: ['composer.json'], java: ['pom.xml', 'build.gradle'], kotlin: ['build.gradle.kts'], dart: ['pubspec.yaml'], swift: ['Package.swift'],
  javascript: ['package.json', 'deno.json'], typescript: ['package.json', 'deno.json'],
  c: ['CMakeLists.txt', 'Makefile', 'meson.build'], 'c++': ['CMakeLists.txt', 'Makefile', 'meson.build'],
  elixir: ['mix.exs'], scala: ['build.sbt'], julia: ['Project.toml'], zig: ['build.zig'],
}
const configs: Record<string, string[]> = {
  python: ['pyproject.toml', 'ruff.toml', '.editorconfig'], rust: ['rustfmt.toml', 'clippy.toml', '.editorconfig'],
  go: ['.golangci.yml', '.editorconfig'],
  c: ['.clang-format', '.clang-tidy', '.editorconfig'], 'c++': ['.clang-format', '.clang-tidy', '.editorconfig'],
  dart: ['analysis_options.yaml', '.editorconfig'], swift: ['.swiftlint.yml', '.editorconfig'],
  elixir: ['.formatter.exs', '.editorconfig'],
}
const webLanguages = ['javascript', 'typescript', 'css', 'html', 'vue', 'svelte', 'astro']
const safePath = (file: string) => file.length < 220 && /^[A-Za-z0-9_./()@ -]+$/.test(file) && !file.split('/').some(part => part === '..' || part === '.' || !part)
const isTest = (file: string) => /(?:^|\/)(?:__tests__|tests?|specs?)(?:\/|$)|[._-](?:test|spec)\.|(?:^|\/)(?:test_|.*_test\.)/i.test(file)
const excluded = (file: string) => /(?:^|\/)(?:node_modules|vendor|dist|build|coverage|\.git|generated|fixtures?|__fixtures__|examples?|docs)(?:\/|$)|(?:\.d\.ts|\.min\.[jt]s|\.generated\.[^.]+|lock)$/.test(file)
const extension = /\.(?:tsx?|jsx?|py|rs|go|java|kt|kts|swift|rb|php|vue|svelte|astro|css|scss|c|h|cpp|cxx|cc|hpp|cs|fs|fsx|vb|dart|ex|exs|erl|hrl|scala|r|jl|lua|zig|ml|mli|sh|bash|sql|clj|cljs)$/i

const dependencyPaths = (repo: GitHubProfileRepo) => manifests[repo.primaryLanguage?.toLowerCase() ?? ''] ?? ['package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod']
const configPaths = (repo: GitHubProfileRepo) => configs[repo.primaryLanguage?.toLowerCase() ?? ''] ?? ['biome.json', 'eslint.config.mjs', '.prettierrc', '.editorconfig']
const uiPaths = (repo: GitHubProfileRepo) => webLanguages.includes(repo.primaryLanguage?.toLowerCase() ?? '') ? ['app/globals.css', 'src/app/globals.css', 'src/index.css', 'src/styles/global.css', 'src/lib/styles/tokens.css', 'tailwind.config.ts'] : []
const blobQuery = (alias: string, file: string, commit = 'HEAD') => `${alias}: object(expression: ${JSON.stringify(`${commit}:${file}`)}) { ... on Blob { text byteSize isBinary isTruncated } }`
const treeQuery = (alias: string, file: string, commit: string) => `${alias}: object(expression: ${JSON.stringify(`${commit}:${file}`)}) { ... on Tree { entries { path name type } } }`
const repoQuery = (alias: string, nameWithOwner: string, body: string) => {
  const [owner, name] = nameWithOwner.split('/')
  return `${alias}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { isPrivate ${body} }`
}

function fullText(blob?: Blob | null): string {
  if (!blob || blob.isBinary || blob.isTruncated || (blob.byteSize ?? 0) > 128 * 1024 || typeof blob.text !== 'string') return ''
  return blob.text.replace(/\r/g, '')
}
function excerpt(value: string, max: number) {
  if (value.length <= max) return value.trim()
  const end = value.lastIndexOf('\n', max)
  return `${value.slice(0, end > max / 2 ? end : max).trim()}\n… (excerpt)`
}
function firstBlob(node: Node, paths: string[], prefix: string, max: number) {
  for (const [index, file] of paths.entries()) {
    let content = fullText(node[`${prefix}${index}`] as Blob)
    if (!content.trim()) continue
    if (file === 'package.json') {
      try {
        const raw = JSON.parse(content)
        // Preserve production/development distinction instead of cutting JSON midway.
        content = JSON.stringify({ name: raw.name, type: raw.type, scripts: raw.scripts, dependencies: raw.dependencies, devDependencies: raw.devDependencies, engines: raw.engines }, null, 2)
      } catch { /* A partial or invalid manifest is contextual evidence only. */ }
    }
    return { content: excerpt(content, max), path: file }
  }
  return { content: '', path: '' }
}

export function chooseCodeSamples(entries: TreeEntry[]): Array<{ path: string; kind: 'source' | 'test' | 'ui' }> {
  const files = [...new Set(entries.filter(entry => entry.type === 'blob' && safePath(entry.path) && extension.test(entry.path) && !excluded(entry.path)).map(entry => entry.path))]
  const score = (file: string) => (/\/(?:services?|domain|lib|core|hooks)\//.test(file) ? 5 : 0) + (/\/(?:components|routes)\//.test(file) ? 3 : 0) - (/(?:^|\/)(?:index|main|__init__)\./.test(file) ? 2 : 0) - (/(?:config|setup|bootstrap)\./.test(file) ? 4 : 0)
  files.sort((a, b) => score(b) - score(a) || a.localeCompare(b))
  const source = files.find(file => !isTest(file) && !/\.(css|scss)$/.test(file))
  const test = files.find(isTest)
  const ui = files.find(file => file !== source && !isTest(file) && /\.(tsx|jsx|vue|svelte|astro|css|scss)$/.test(file))
  return [...(source ? [{ path: source, kind: 'source' as const }] : []), ...(test ? [{ path: test, kind: 'test' as const }] : []), ...(ui ? [{ path: ui, kind: 'ui' as const }] : [])]
}

export function extractAttributedSnippet(content: string, ranges: BlameRange[], login: string): { content: string; startLine: number; endLine: number } | null {
  const lines = content.split('\n')
  const authored = ranges.filter(range => Number.isSafeInteger(range.startingLine) && Number.isSafeInteger(range.endingLine) && range.startingLine >= 1 && range.endingLine >= range.startingLine && range.endingLine <= lines.length && range.commit?.author?.user?.login?.toLowerCase() === login.toLowerCase())
  authored.sort((a, b) => (b.endingLine - b.startingLine) - (a.endingLine - a.startingLine))
  for (const range of authored) {
    const endLine = Math.min(range.endingLine, range.startingLine + 65)
    const raw = lines.slice(range.startingLine - 1, endLine).join('\n')
    if (raw.trim().length < 40) continue // imports or one-line changes do not establish a style.
    const snippet = excerpt(raw, 2600)
    const actualLines = snippet.replace(/\n… \(excerpt\)$/, '').split('\n').length
    return { content: snippet, startLine: range.startingLine, endLine: Math.min(endLine, range.startingLine + actualLines - 1) }
  }
  return null
}

export async function getGitHubEvidence(overview: GitHubProfileOverview, repos: GitHubProfileRepo[], signal?: AbortSignal): Promise<GitHubRepoStyleDetails[]> {
  const profileName = overview.profileReadmeRepository
  const requested = [...repos]
  if (profileName && !requested.some(repo => repo.nameWithOwner.toLowerCase() === profileName.toLowerCase())) requested.push({ name: overview.login, nameWithOwner: profileName, url: overview.profileUrl, description: null, stargazerCount: 0, forkCount: 0, updatedAt: '', primaryLanguage: null, topics: [], isArchived: false })
  if (!requested.length) return []
  const verifyUser = overview.kind !== 'Organization' && overview.id
  const query = requested.map((repo, index) => {
    const profileOnly = index >= repos.length
    const commit = repo.commit || 'HEAD'
    return repoQuery(`r${index}`, repo.nameWithOwner, `nameWithOwner url description isFork isTemplate defaultBranchRef { target { ... on Commit { oid } } }
      ${blobQuery('readme', 'README.md', commit)} ${blobQuery('readmeLower', 'readme.md', commit)}
      ${!profileOnly && verifyUser ? `activity: object(expression: ${JSON.stringify(commit)}) { ... on Commit { history(first: 1, author: { id: ${JSON.stringify(overview.id)} }) { totalCount } } }` : ''}
      ${profileOnly ? '' : dependencyPaths(repo).map((file, i) => blobQuery(`dep${i}`, file, commit)).join('\n')}
      ${profileOnly ? '' : configPaths(repo).map((file, i) => blobQuery(`config${i}`, file, commit)).join('\n')}
      ${profileOnly ? '' : uiPaths(repo).map((file, i) => blobQuery(`ui${i}`, file, commit)).join('\n')}
      ${profileOnly ? '' : ['root', 'src', 'app', 'tests', 'packages'].map(alias => treeQuery(alias, alias === 'root' ? '' : alias, commit)).join('\n')}`)
  }).join('\n')
  const nodes = await githubGraph<Record<string, Node | null>>(`query Evidence { ${query} }`, {}, signal)
  const records: Array<{ detail: GitHubRepoStyleDetails; entries: TreeEntry[] }> = []
  requested.forEach((repo, index) => {
    const node = nodes[`r${index}`]
    if (!node || node.isPrivate !== false || !node.nameWithOwner || !node.url || node.isFork || node.isTemplate) return
    const readme = excerpt(fullText(node.readme as Blob) || fullText(node.readmeLower as Blob), 1600)
    const commit = repo.commit || node.defaultBranchRef?.target?.oid
    if (profileName?.toLowerCase() === repo.nameWithOwner.toLowerCase()) {
      overview.profileReadme = readme; overview.profileReadmePath = fullText(node.readme as Blob) ? 'README.md' : 'readme.md'; overview.profileReadmeCommit = commit
    }
    if (index >= repos.length) return
    const owned = repo.nameWithOwner.split('/')[0].toLowerCase() === overview.login.toLowerCase()
    const authoredCommits = node.activity?.history?.totalCount ?? 0
    // Merely pinning a foreign project cannot establish personal coding preferences.
    if (!owned && (overview.kind === 'Organization' || !verifyUser || authoredCommits < 1)) return
    const dependencies = firstBlob(node, dependencyPaths(repo), 'dep', 3600)
    const ui = firstBlob(node, uiPaths(repo), 'ui', 1800)
    const configFiles = configPaths(repo).flatMap((file, i) => { const content = excerpt(fullText(node[`config${i}`] as Blob), 1400); return content ? [{ path: file, content }] : [] }).slice(0, 2)
    const detail: GitHubRepoStyleDetails = { nameWithOwner: node.nameWithOwner, url: node.url, description: node.description ?? null, primaryLanguage: repo.primaryLanguage, relationship: owned ? 'owned' : 'contributed', authoredCommits, commit, readme, readmePath: fullText(node.readme as Blob) ? 'README.md' : 'readme.md', dependencies: dependencies.content, dependenciesPath: dependencies.path, globalsCss: ui.content, globalsCssPath: ui.path, configFiles, codeSamples: [] }
    records.push({ detail, entries: ['root', 'src', 'app', 'tests', 'packages'].flatMap(key => (node[key] as Tree)?.entries ?? []) })
  })

  // Explore only two bounded batches below common roots, including monorepo packages.
  const visited = new Set(records.flatMap(record => ['src', 'app', 'tests', 'packages'].map(root => `${record.detail.nameWithOwner}:${root}`)))
  for (let depth = 0; depth < 2; depth++) {
    const directories = records.flatMap(record => {
      const candidates = record.entries.filter(entry => entry.type === 'tree' && safePath(entry.path) && !excluded(entry.path) && entry.path.split('/').length <= 4 && !visited.has(`${record.detail.nameWithOwner}:${entry.path}`))
      candidates.sort((a, b) => Number(/(?:src|lib|core|components|tests|packages)/.test(b.path)) - Number(/(?:src|lib|core|components|tests|packages)/.test(a.path)) || a.path.localeCompare(b.path))
      return candidates.slice(0, 2).map(entry => ({ record, path: entry.path }))
    })
    if (!directories.length) break
    const trees = await githubGraph<Record<string, { isPrivate: boolean; tree?: Tree }>>(`query NestedTrees { ${directories.map(({ record, path }, i) => repoQuery(`d${i}`, record.detail.nameWithOwner, treeQuery('tree', path, record.detail.commit || 'HEAD'))).join('\n')} }`, {}, signal)
    directories.forEach(({ record, path }, i) => {
      visited.add(`${record.detail.nameWithOwner}:${path}`)
      if (trees[`d${i}`]?.isPrivate === false) record.entries.push(...(trees[`d${i}`].tree?.entries ?? []))
    })
  }

  const samples = records.flatMap(record => chooseCodeSamples(record.entries).map(file => ({ record, ...file })))
  if (samples.length) {
    const values = await githubGraph<Record<string, { isPrivate: boolean; blob?: Blob; attribution?: { blame?: { ranges?: BlameRange[] } } }>>(`query CodeSamples { ${samples.map(({ record, path }, i) => repoQuery(`s${i}`, record.detail.nameWithOwner, `${blobQuery('blob', path, record.detail.commit)} ${verifyUser ? `attribution: object(expression: ${JSON.stringify(record.detail.commit || 'HEAD')}) { ... on Commit { blame(path: ${JSON.stringify(path)}) { ranges { startingLine endingLine commit { author { user { login } } } } } } }` : ''}`)).join('\n')} }`, {}, signal)
    samples.forEach(({ record, path, kind }, i) => {
      const value = values[`s${i}`]
      if (value?.isPrivate !== false) return
      const content = fullText(value.blob)
      if (content.trim().length < 40) return
      const attributed = verifyUser ? extractAttributedSnippet(content, value.attribution?.blame?.ranges ?? [], overview.login) : null
      if (record.detail.relationship === 'contributed' && !attributed) return
      record.detail.codeSamples!.push({ path, kind, ...(attributed || { content: excerpt(content, 2600), startLine: 1, endLine: Math.min(content.split('\n').length, excerpt(content, 2600).replace(/\n… \(excerpt\)$/, '').split('\n').length) }), authorship: attributed ? 'verified' : 'project' })
    })
  }
  return records.map(record => record.detail).filter(detail => detail.relationship === 'owned' || detail.codeSamples?.some(sample => sample.authorship === 'verified')).slice(0, 4)
}
