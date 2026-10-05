import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import ts from 'typescript'
import * as profile from '../packages/cli/src/profile.mjs'
import * as bundle from '../packages/cli/src/bundle.mjs'
import * as analysis from '../packages/cli/src/analysis.mjs'

const root = path.resolve(import.meta.dirname, '..')
const require = createRequire(import.meta.url)
export function loadTs(relative, { mocks = {}, env = {}, fetch: fetchMock = globalThis.fetch, console: log = { info() {}, warn() {}, error() {} } } = {}) {
  const cache = new Map()
  const esm = { '@/packages/cli/src/profile.mjs': profile, '@/packages/cli/src/bundle.mjs': bundle, '@/packages/cli/src/analysis.mjs': analysis }
  function load(file) {
    if (cache.has(file)) return cache.get(file)
    const source = fs.readFileSync(path.join(root, file), 'utf8')
    const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
    const exports = {}
    cache.set(file, exports)
    const context = vm.createContext({
      exports, process: { env }, Buffer, URL, TextEncoder, TextDecoder, Headers, Request, Response,
      AbortController, AbortSignal, Error, TypeError, performance, setTimeout, clearTimeout,
      console: log, fetch: fetchMock,
      require: id => {
        if (id in mocks) return mocks[id]
        if (id in esm) return esm[id]
        if (id.startsWith('@/')) return load(`${id.slice(2)}.ts`)
        return require(id)
      },
    })
    vm.runInContext(code, context, { filename: file })
    return exports
  }
  return load(relative)
}

export function fixtureBundle(login = 'fixture') {
  const slug = profile.skillDirectoryName(login)
  return { login, skillDirectoryName: slug, skillMarkdown: `---\nname: ${slug}\ndescription: Apply the fixture style when explicitly requested.\n---\n\n## Philosophy\n- Small tools\n`, references: [{ path: 'references/profile-summary.md', content: '# Fixture\n' }], installCommand: `npx gittoskill add @${login}` }
}
