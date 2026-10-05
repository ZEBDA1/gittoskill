import { createHash } from 'node:crypto'
import { getAzureQuickModel, getAzureQuickReasoningEffort, generateAzureChatText, resolveAzureDeploymentName } from '@/lib/azure-openai'
import { getGitHubProfileOverview, getGitHubEvidence, selectReposForDeepDive } from '@/lib/github-client'
import { buildSkillMarkdown, buildReferenceFiles, skillDirectoryName } from '@/lib/generate-skill'
import { collectEvidence, ANALYSIS_VERSION, ANALYSIS_PROMPT, analysisSchema, validateAnalysis, renderObservations, buildAnalysisReport } from '@/lib/profile-analysis'
import type { SkillOutput } from '@/lib/skill-types'

export function generationKey(login: string): string {
  return createHash('sha256').update(JSON.stringify([login.toLowerCase(), ANALYSIS_VERSION, getAzureQuickModel(), resolveAzureDeploymentName(getAzureQuickModel()), getAzureQuickReasoningEffort(), process.env.AZURE_OPENAI_BASE_URL])).digest('hex')
}

export async function generateProfile(login: string, signal: AbortSignal): Promise<SkillOutput> {
  const timings: Record<string, number> = {}
  const start = performance.now()
  let step = performance.now()
  const overview = await getGitHubProfileOverview(login, signal)
  timings.profile = performance.now() - step
  step = performance.now()
  const repoDetails = await getGitHubEvidence(overview, selectReposForDeepDive([...overview.pinnedRepos, ...overview.topRepos, ...(overview.contributedRepos ?? [])], overview.login), signal)
  timings.evidence = performance.now() - step
  const evidence = collectEvidence(overview, repoDetails)
  step = performance.now()
  let usage: unknown
  let observations: import('@/lib/skill-types').StyleObservation[] = []
  if (evidence.length) {
    const result = await generateAzureChatText({
      model: getAzureQuickModel(), systemPrompt: ANALYSIS_PROMPT,
      userMessage: JSON.stringify({ profile: { login: overview.login, kind: overview.kind ?? 'User' }, evidence }), reasoningEffort: getAzureQuickReasoningEffort(),
      maxCompletionTokens: 4096, responseSchema: analysisSchema(evidence), signal,
      onUsage: value => { usage = value },
    })
    observations = validateAnalysis(result, evidence)
  }
  timings.model = performance.now() - step
  // Logs contain timing/count metrics only, never tokens, source text or prompts.
  const tokens = usage as { prompt_tokens?: number; completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } } | undefined
  console.info(JSON.stringify({ event: 'generation.completed', timings, totalMs: performance.now() - start, repos: repoDetails.length, evidence: evidence.length, inputTokens: tokens?.prompt_tokens, outputTokens: tokens?.completion_tokens, reasoningTokens: tokens?.completion_tokens_details?.reasoning_tokens }))
  const analysis = buildAnalysisReport(overview, repoDetails, evidence, observations)
  const styleGuide = renderObservations(observations)
  const analysisReference = { path: 'references/analysis-scope.md', content: ['# Analysis scope', '', `Profile type: ${analysis.profileType}`, `Sampled repositories: ${analysis.coverage.repositories}`, `Evidence excerpts: ${analysis.coverage.sources}`, `Profile-attributed code excerpts: ${analysis.coverage.attributedSamples}`, '', '## Limits', '', ...analysis.limitations.map(item => `- ${item}`)].join('\n') }
  return {
    login: overview.login, displayName: overview.displayName, generatedAt: new Date().toISOString(),
    skillDirectoryName: skillDirectoryName(overview.login),
    skillMarkdown: buildSkillMarkdown({ overview, repoDetails, styleGuide, limitations: analysis.limitations }), analysis,
    references: [...buildReferenceFiles({ overview, repoDetails }), analysisReference], installCommand: `npx gittoskill add @${overview.login}`,
  }
}
