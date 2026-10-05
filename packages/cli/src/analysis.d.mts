export type StyleSection = 'Philosophy' | 'Code Style' | 'Tech Stack' | 'Testing' | 'UI Taste'
export type StyleSource = { id: string; repo: string; path: string; url: string; attribution: 'verified' | 'project' | 'self-described'; startLine?: number; endLine?: number }
export type StyleObservation = { section: StyleSection; text: string; support: 'repeated' | 'single-project' | 'self-described'; sources: StyleSource[] }
export type SkillAnalysis = {
  version: 3
  profileType: 'User' | 'Organization'
  coverage: { level: 'broad' | 'limited' | 'minimal'; repositories: number; sources: number; codeSamples: number; attributedSamples: number }
  repositories: Array<{ name: string; url: string; language: string | null; relationship: 'owned' | 'contributed'; files: number; attributedSamples: number }>
  observations: StyleObservation[]
  limitations: string[]
}
export const STYLE_SECTIONS: StyleSection[]
export function isSkillAnalysis(value: unknown): value is SkillAnalysis
