import { validateSkillBundle } from '@/packages/cli/src/bundle.mjs'
import type { SkillOutput } from '@/lib/skill-types'

export function createSkillArchive(output: SkillOutput): Uint8Array<ArrayBuffer> {
  validateSkillBundle(output)
  const encoder = new TextEncoder()
  const blocks: Uint8Array[] = []
  for (const file of [{ path: 'SKILL.md', content: output.skillMarkdown }, ...output.references]) {
    const content = encoder.encode(file.content)
    const header = new Uint8Array(512)
    const put = (offset: number, length: number, value: string) => {
      const data = encoder.encode(value)
      if (data.length > length) throw new Error('Archive field is too long.')
      header.set(data, offset)
    }
    const filePath = `${output.skillDirectoryName}/${file.path}`
    const slash = filePath.lastIndexOf('/')
    if (encoder.encode(filePath).length <= 100) put(0, 100, filePath)
    else { put(0, 100, filePath.slice(slash + 1)); put(345, 155, filePath.slice(0, slash)) }
    put(100, 8, '0000644\0'); put(108, 8, '0000000\0'); put(116, 8, '0000000\0')
    put(124, 12, `${content.length.toString(8).padStart(11, '0')}\0`)
    put(136, 12, '00000000000\0'); header.fill(32, 148, 156)
    put(156, 1, '0'); put(257, 6, 'ustar\0'); put(263, 2, '00')
    const checksum = header.reduce((sum, value) => sum + value, 0)
    put(148, 8, `${checksum.toString(8).padStart(6, '0')}\0 `)
    blocks.push(header, content, new Uint8Array((512 - content.length % 512) % 512))
  }
  blocks.push(new Uint8Array(1024))
  const archive = new Uint8Array(blocks.reduce((sum, block) => sum + block.length, 0))
  let offset = 0
  for (const block of blocks) { archive.set(block, offset); offset += block.length }
  return archive
}
