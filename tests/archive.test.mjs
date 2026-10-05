import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTs, fixtureBundle } from './helpers.mjs'

test('download archive preserves UTF-8 content, file sizes, checksums and references', () => {
  const { createSkillArchive } = loadTs('lib/skill-archive.ts')
  const bundle = fixtureBundle()
  bundle.references[0].content = '# Préférences 🎯\n'
  const archive = createSkillArchive(bundle)
  const decoder = new TextDecoder()
  const files = []
  let offset = 0
  while (archive[offset]) {
    const header = archive.slice(offset, offset + 512)
    const field = (start, count) => decoder.decode(header.slice(start, start + count)).replace(/\0.*$/, '')
    const name = field(0, 100), prefix = field(345, 155)
    const size = parseInt(field(124, 12), 8)
    const checksum = parseInt(field(148, 8), 8)
    header.fill(32, 148, 156)
    assert.equal(header.reduce((sum, value) => sum + value, 0), checksum)
    files.push({ path: prefix ? `${prefix}/${name}` : name, content: decoder.decode(archive.slice(offset + 512, offset + 512 + size)) })
    offset += 512 + Math.ceil(size / 512) * 512
  }
  assert.equal(files.length, 2)
  assert.equal(files[0].content, bundle.skillMarkdown)
  assert.equal(files[1].content, bundle.references[0].content)
  assert.equal(files[1].path, `${bundle.skillDirectoryName}/references/profile-summary.md`)
})
