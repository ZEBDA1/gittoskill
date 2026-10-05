#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { access, writeFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { parseGitHubProfileInput, skillDirectoryName } from '../src/profile.mjs'
import { MAX_BUNDLE_BYTES, validateSkillBundle } from '../src/bundle.mjs'
import { readTextIfExists, replaceSnapshot } from '../src/install.mjs'

const require = createRequire(import.meta.url)

export async function fetchGeneratedSkill(login) {
  const base = new URL(process.env.GITTOSKILL_API_BASE_URL?.trim() || 'https://gittoskill.vercel.app')
  if (base.username || base.password || (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)))) throw new Error('API must use HTTPS, or HTTP on localhost.')
  const response = await fetch(new URL('/api/generate-skill', base), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile: `@${login}` }), signal: AbortSignal.timeout(100_000), redirect: 'error',
  })
  if (!response.body) throw new Error('API returned an empty response.')
  const reader = response.body.getReader()
  const chunks = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > MAX_BUNDLE_BYTES + 128 * 1024) { await reader.cancel(); throw new Error('API response is too large.') }
      chunks.push(Buffer.from(value))
    }
  } finally { reader.releaseLock() }
  const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (!response.ok) throw new Error(typeof payload?.error === 'string' ? payload.error : `API failed (${response.status}).`)
  return validateSkillBundle(payload, login)
}

export async function runCommand(command, args, inherit = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: inherit ? 'inherit' : 'pipe', shell: false })
    let stdout = '', stderr = ''
    child.stdout?.on('data', chunk => { stdout += chunk })
    child.stderr?.on('data', chunk => { stderr += chunk })
    child.on('error', reject)
    child.on('close', code => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr.trim() || `Command exited with code ${code}.`)))
  })
}

export async function ensureInstalledSkillIgnored(slug) {
  let root
  try { root = await runCommand('git', ['rev-parse', '--show-toplevel']) } catch { return }
  const candidates = [`/.agents/skills/${slug}/`, `/.cursor/skills/${slug}/`, `/skills/${slug}/`]
  const existing = []
  for (const entry of candidates) {
    try { await access(path.join(root, ...entry.split('/').filter(Boolean))); existing.push(entry) } catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  const file = path.join(root, '.gitignore')
  const current = await readTextIfExists(file) || ''
  const lines = current.replace(/\r/g, '').split('\n')
  const additions = existing.filter(entry => !lines.includes(entry) && !lines.includes(entry.replace(/\/$/, '')))
  if (additions.length) await writeFile(file, `${current}${current && !current.endsWith('\n') ? '\n' : ''}${lines.includes('# Installed skills') ? '' : '# Installed skills\n'}${additions.join('\n')}\n`, 'utf8')
}

export async function main(args = process.argv.slice(2)) {
  if (!args.length || ['--help', '-h'].includes(args[0]) || ['--help', '-h'].includes(args[1])) {
    console.log('GitToSkill\n\nUsage: gittoskill add <@username|github-profile-url> [...skills-add-flags]\n\nExample: gittoskill add @steipete --agent cursor\nGlobal install: gittoskill add @steipete --global\nUse --list to inspect a bundle without installing it.')
    return
  }
  if (args[0] !== 'add') throw new Error(`Unknown command "${args[0]}".`)
  const parsed = parseGitHubProfileInput(args[1])
  if (!parsed) throw new Error('Use @username or https://github.com/username.')
  console.log(`[gittoskill] Generating skill for @${parsed.login}`)
  const output = await fetchGeneratedSkill(parsed.login)
  await replaceSnapshot({
    cacheRoot: path.join(os.homedir(), '.gittoskill', 'generated'), slug: skillDirectoryName(parsed.login), output,
    install: async final => {
      console.log(`[gittoskill] Installing skill from ${final}`)
      await runCommand(process.execPath, [require.resolve('skills/bin/cli.mjs'), 'add', final, ...args.slice(2)], true)
    },
  })
  if (!args.includes('--list') && !args.includes('-l') && !args.includes('--global') && !args.includes('-g')) {
    try { await ensureInstalledSkillIgnored(output.skillDirectoryName) } catch (error) { console.warn(`[gittoskill] Installed successfully; could not update .gitignore: ${error.message}`) }
  }
  console.log(`[gittoskill] Done. Re-run to refresh @${parsed.login}.`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(`[gittoskill] ${error.message}`); process.exitCode = 1 })
}
