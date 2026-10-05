import { access, mkdir, open, readFile, rename, rm, writeFile, lstat } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { validateSkillBundle, validateReferencePath } from './bundle.mjs'

export async function readTextIfExists(file) {
  try { return await readFile(file, 'utf8') } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

export async function writeGeneratedSkillBundle(targetDir, output) {
  validateSkillBundle(output)
  await mkdir(targetDir, { recursive: true })
  if ((await lstat(targetDir)).isSymbolicLink()) throw new Error('Skill staging directory cannot be a symbolic link.')
  await writeFile(path.join(targetDir, 'SKILL.md'), output.skillMarkdown, { encoding: 'utf8', flag: 'wx' })
  for (const reference of output.references) {
    const relative = validateReferencePath(reference.path)
    const outputPath = path.resolve(targetDir, ...relative.split('/'))
    const confined = path.relative(path.resolve(targetDir), outputPath)
    if (confined.startsWith('..') || path.isAbsolute(confined)) throw new Error('Reference escapes the skill directory.')
    let parent = targetDir
    for (const segment of relative.split('/').slice(0, -1)) {
      parent = path.join(parent, segment)
      await mkdir(parent, { recursive: true })
      if ((await lstat(parent)).isSymbolicLink()) throw new Error('Reference directory cannot be a symbolic link.')
    }
    await writeFile(outputPath, reference.content, { encoding: 'utf8', flag: 'wx' })
  }
}

async function exists(file) {
  try { await access(file); return true } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

export async function replaceSnapshot({ cacheRoot, slug, output, install }) {
  validateSkillBundle(output)
  if (slug !== output.skillDirectoryName) throw new Error('Snapshot name does not match bundle.')
  await mkdir(cacheRoot, { recursive: true })
  const final = path.join(cacheRoot, slug)
  const lockPath = `${final}.lock`
  let lock
  try { lock = await open(lockPath, 'wx') } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`Another install is running for ${slug}. If a previous process crashed, remove ${lockPath} after verifying it has stopped.`)
    throw error
  }
  const staging = path.join(cacheRoot, `${slug}.staging-${randomUUID()}`)
  const backup = path.join(cacheRoot, `${slug}.backup-${randomUUID()}`)
  let saved = false, swapped = false, installed = false
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }))
    await writeGeneratedSkillBundle(staging, output)
    if (await exists(final)) { await rename(final, backup); saved = true }
    await rename(staging, final)
    swapped = true
    await install(final)
    installed = true
  } catch (error) {
    if (swapped) await rm(final, { recursive: true, force: true })
    if (saved) { await rename(backup, final); saved = false }
    throw error
  } finally {
    // Each deletion is confined to a direct child of cacheRoot using a validated slug.
    try {
      await rm(staging, { recursive: true, force: true })
      // Preserve the backup if restoration failed: it may be the only intact copy.
      if (saved && installed) await rm(backup, { recursive: true, force: true })
    } finally {
      try { await lock.close() } finally { await rm(lockPath, { force: true }) }
    }
  }
  return final
}
