export const STYLE_SECTIONS = ['Philosophy', 'Code Style', 'Tech Stack', 'Testing', 'UI Taste']
const string = (value, max = 400) => typeof value === 'string' && value.length > 0 && value.length <= max
const count = value => Number.isSafeInteger(value) && value >= 0 && value <= 100
const github = value => {
  try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'github.com' && !url.username && !url.password && !url.port } catch { return false }
}
export function isSkillAnalysis(value) {
  if (!value || typeof value !== 'object' || value.version !== 3 || !['User', 'Organization'].includes(value.profileType)) return false
  const coverage = value.coverage
  if (!coverage || !['broad', 'limited', 'minimal'].includes(coverage.level) || !['repositories', 'sources', 'codeSamples', 'attributedSamples'].every(key => count(coverage[key])) || coverage.attributedSamples > coverage.codeSamples) return false
  if (!Array.isArray(value.repositories) || value.repositories.length > 4 || !value.repositories.every(repo => repo && string(repo.name, 140) && github(repo.url) && (repo.language === null || string(repo.language, 80)) && ['owned', 'contributed'].includes(repo.relationship) && count(repo.files) && count(repo.attributedSamples))) return false
  if (coverage.repositories !== value.repositories.length) return false
  if (!Array.isArray(value.observations) || value.observations.length > 16 || !value.observations.every(item => item && STYLE_SECTIONS.includes(item.section) && string(item.text) && ['repeated', 'single-project', 'self-described'].includes(item.support) && Array.isArray(item.sources) && item.sources.length >= 1 && item.sources.length <= 4 && item.sources.every(source => source && string(source.id, 16) && string(source.repo, 140) && string(source.path, 220) && github(source.url) && ['verified', 'project', 'self-described'].includes(source.attribution) && (source.startLine === undefined || Number.isSafeInteger(source.startLine) && source.startLine > 0) && (source.endLine === undefined || Number.isSafeInteger(source.endLine) && source.endLine >= source.startLine)))) return false
  return Array.isArray(value.limitations) && value.limitations.length <= 8 && value.limitations.every(item => string(item, 500))
}
