import type { SkillOutput } from '@/lib/skill-types'
import { parseGitHubProfileInput } from '@/lib/parse-github-profile'
import { isSkillAnalysis } from '@/packages/cli/src/analysis.mjs'
export function isSkillOutput(value: unknown): value is SkillOutput {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<SkillOutput>
  return typeof item.login === 'string' && Boolean(parseGitHubProfileInput(item.login)) &&
    item.skillDirectoryName === `${item.login.toLowerCase()}-coding-skill` &&
    typeof item.skillMarkdown === 'string' && item.skillMarkdown.startsWith('---\n') && item.skillMarkdown.length <= 64 * 1024 &&
    item.installCommand === `npx gittoskill add @${item.login}` && Array.isArray(item.references) && item.references.length <= 16 &&
    item.references.every(file => file && typeof file.path === 'string' && typeof file.content === 'string') &&
    (item.displayName === undefined || typeof item.displayName === 'string') &&
    (item.generatedAt === undefined || typeof item.generatedAt === 'string') &&
    (item.analysis === undefined || isSkillAnalysis(item.analysis))
}
