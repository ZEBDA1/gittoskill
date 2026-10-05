import type { SkillAnalysis } from './analysis.mjs'
export type SkillReferenceFile = { path: string; content: string }
export type SkillOutput = {
  login: string
  skillDirectoryName: string
  skillMarkdown: string
  references: SkillReferenceFile[]
  installCommand: string
  displayName?: string
  generatedAt?: string
  analysis?: SkillAnalysis
}
export const MAX_BUNDLE_BYTES: number
export function validateReferencePath(value: string): string
export function validateSkillBundle(value: unknown, expectedLogin?: string): SkillOutput
