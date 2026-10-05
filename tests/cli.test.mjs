import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { parseGitHubProfileInput } from '../packages/cli/src/profile.mjs'
import { validateSkillBundle, validateReferencePath } from '../packages/cli/src/bundle.mjs'
import { writeGeneratedSkillBundle, replaceSnapshot, readTextIfExists } from '../packages/cli/src/install.mjs'
import { ensureInstalledSkillIgnored } from '../packages/cli/bin/gittoskill.mjs'
import { fixtureBundle, loadTs } from './helpers.mjs'

async function temporary(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gittoskill-test-'))
  try { await fn(dir) } finally {
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()))
    assert.ok(path.basename(dir).startsWith('gittoskill-test-'))
    await fs.rm(dir, { recursive: true, force: true })
  }
}

test('CLI and web share strict profile parsing', () => {
  for (const input of ['@fixture', 'fixture', 'https://github.com/fixture', 'github.com/fixture/']) assert.equal(parseGitHubProfileInput(input).login, 'fixture')
  for (const input of ['https://github.com/foo.bar', 'https://evil.test/fixture', 'ftp://github.com/fixture', 'https://user@github.com/fixture', 'fixture-', 'a--b', '../fixture', 'https://github.com/a/b', 'a'.repeat(40)]) assert.equal(parseGitHubProfileInput(input), null, input)
})

test('reject traversals, device paths, duplicates and mismatched bundles before writes', async () => {
  for (const input of ['../outside.md', 'references/../outside.md', '/references/a.md', 'C:/references/a.md', 'references\\a.md', 'references/NUL.md', 'references/a:stream.md', 'references/a..md']) assert.throws(() => validateReferencePath(input), /path/i)
  const valid = fixtureBundle()
  assert.equal(validateSkillBundle(valid, 'FIXTURE'), valid)
  assert.throws(() => validateSkillBundle({ ...valid, skillMarkdown: '## Philosophy\n- Small tools' }), /frontmatter/)
  assert.throws(() => validateSkillBundle(valid, 'other'), /invalid bundle/)
  assert.throws(() => validateSkillBundle({ ...valid, references: [...valid.references, ...valid.references] }), /Duplicate/)
  assert.throws(() => validateSkillBundle({ ...valid, references: [{ path: 'references/a.md', content: 'a'.repeat(70_000) }] }), /content/)
  await temporary(async dir => {
    const target = path.join(dir, 'target')
    await assert.rejects(writeGeneratedSkillBundle(target, { ...valid, references: [{ path: '../outside.md', content: 'invalid' }] }))
    await assert.rejects(fs.stat(target), { code: 'ENOENT' })
  })
})

test('snapshot restores previous bundle after installer failure and locks concurrent installs', async () => {
  await temporary(async cacheRoot => {
    const output = fixtureBundle()
    const final = path.join(cacheRoot, output.skillDirectoryName)
    await fs.mkdir(final)
    await fs.writeFile(path.join(final, 'SKILL.md'), 'previous')
    await assert.rejects(replaceSnapshot({ cacheRoot, slug: output.skillDirectoryName, output, install: async () => { throw new Error('installer failed') } }), /installer failed/)
    assert.equal(await fs.readFile(path.join(final, 'SKILL.md'), 'utf8'), 'previous')
    let release, started
    const waiting = new Promise(resolve => { release = resolve })
    const entered = new Promise(resolve => { started = resolve })
    const first = replaceSnapshot({ cacheRoot, slug: output.skillDirectoryName, output, install: async () => { started(); await waiting } })
    await entered
    await assert.rejects(replaceSnapshot({ cacheRoot, slug: output.skillDirectoryName, output, install: async () => {} }), /Another install/)
    release()
    await first
    assert.equal(await fs.readFile(path.join(final, 'SKILL.md'), 'utf8'), output.skillMarkdown)
    assert.deepEqual(await fs.readdir(cacheRoot), [output.skillDirectoryName])
  })
})

test('generated skill is recognized by the actual skills CLI', async () => {
  await temporary(async dir => {
    const generated = loadTs('lib/generate-skill.ts')
    const overview = { login: 'fixture', displayName: 'Fixture', profileUrl: 'https://github.com/fixture', bio: null, websiteUrl: null, followerCount: null, profileReadme: '', pinnedRepos: [], topRepos: [] }
    const output = { ...fixtureBundle(), skillMarkdown: generated.buildSkillMarkdown({ overview, repoDetails: [], styleGuide: '## Philosophy\n- Small tools' }) }
    validateSkillBundle(output)
    await writeGeneratedSkillBundle(dir, output)
    const cliRequire = createRequire(new URL('../packages/cli/package.json', import.meta.url))
    const result = spawnSync(process.execPath, [cliRequire.resolve('skills/bin/cli.mjs'), 'add', dir, '--list'], { encoding: 'utf8', env: { ...process.env, DISABLE_TELEMETRY: '1' } })
    assert.equal(result.status, 0, result.stderr + result.stdout)
    assert.match(result.stdout, /fixture-coding-skill/)
  })
})

test('.gitignore is created correctly and remains idempotent after install', async () => {
  await temporary(async dir => {
    const original = process.cwd()
    try {
      assert.equal(spawnSync('git', ['init', dir], { encoding: 'utf8' }).status, 0)
      process.chdir(dir)
      await fs.mkdir(path.join(dir, '.agents', 'skills', 'fixture-coding-skill'), { recursive: true })
      assert.equal(await readTextIfExists(path.join(dir, '.gitignore')), null)
      await ensureInstalledSkillIgnored('fixture-coding-skill')
      const first = await fs.readFile('.gitignore', 'utf8')
      assert.match(first, /\/\.agents\/skills\/fixture-coding-skill\//)
      await ensureInstalledSkillIgnored('fixture-coding-skill')
      assert.equal(await fs.readFile('.gitignore', 'utf8'), first)
    } finally { process.chdir(original) }
  })
})
