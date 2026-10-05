import { parseDocument } from 'yaml'
import { isValidGitHubProfileLogin, skillDirectoryName } from './profile.mjs'
import { isSkillAnalysis } from './analysis.mjs'

export const MAX_BUNDLE_BYTES = 512 * 1024
const byteLength = (value) => new TextEncoder().encode(value).length

export function validateReferencePath(value) {
  if (typeof value !== 'string' || value.length > 220 || !/^references\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9][A-Za-z0-9._-]*\.md$/.test(value) || value.includes('..')) throw new Error('Invalid reference path in skill bundle.')
  for (const segment of value.split('/')) {
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment) || /[. ]$/.test(segment)) throw new Error('Reserved reference path.')
  }
  return value
}

export function validateSkillBundle(value, expectedLogin) {
  if (value?.analysis !== undefined && !isSkillAnalysis(value.analysis)) throw new Error('Invalid skill analysis metadata.')
  if (!value || typeof value !== 'object' || !isValidGitHubProfileLogin(value.login) || (expectedLogin && value.login.toLowerCase() !== expectedLogin.toLowerCase()) || value.skillDirectoryName !== skillDirectoryName(value.login) || typeof value.skillMarkdown !== 'string' || !value.skillMarkdown.trim() || byteLength(value.skillMarkdown) > 64 * 1024 || !Array.isArray(value.references) || value.references.length > 16 || value.installCommand !== `npx gittoskill add @${value.login}`) throw new Error('GitToSkill API returned an invalid bundle.')
  const match = value.skillMarkdown.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---\n([\s\S]+)$/)
  if (!match) throw new Error('SKILL.md requires frontmatter and instructions.')
  const document = parseDocument(match[1], { uniqueKeys: true })
  if (document.errors.length) throw new Error('Invalid SKILL.md frontmatter.')
  const metadata = document.toJS({ maxAliasCount: 0 })
  if (!metadata || metadata.name !== value.skillDirectoryName || typeof metadata.description !== 'string' || !metadata.description.trim() || metadata.description.length > 1024) throw new Error('Invalid skill name or description.')
  const seen = new Set()
  let total = byteLength(value.skillMarkdown)
  for (const file of value.references) {
    if (!file || typeof file.content !== 'string' || byteLength(file.content) > 64 * 1024) throw new Error('Invalid reference content.')
    const referencePath = validateReferencePath(file.path)
    const key = referencePath.toLowerCase()
    if (seen.has(key)) throw new Error('Duplicate reference path.')
    seen.add(key)
    total += byteLength(file.content)
  }
  if (total > MAX_BUNDLE_BYTES) throw new Error('Skill bundle is too large.')
  return value
}
