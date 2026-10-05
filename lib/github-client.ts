import { ServiceError } from '@/lib/service-error'
import { serviceJson } from '@/lib/service-fetch'

const API = 'https://api.github.com/graphql'
export type GitHubProfileRepo = {
  name: string; nameWithOwner: string; description: string | null; url: string
  stargazerCount: number; forkCount: number; updatedAt: string
  primaryLanguage: string | null; topics: string[]; isArchived: boolean; commit?: string
  ownerLogin?: string; isFork?: boolean; isTemplate?: boolean; pinned?: boolean; contributions?: number
}
export type GitHubProfileOverview = {
  login: string; displayName: string; bio: string | null; websiteUrl: string | null
  profileUrl: string; avatarUrl: string; followerCount: number | null
  profileReadme: string; pinnedRepos: GitHubProfileRepo[]; topRepos: GitHubProfileRepo[]
  profileReadmeRepository?: string
  profileReadmePath?: string; profileReadmeCommit?: string
  id?: string; kind?: 'User' | 'Organization'; contributedRepos?: GitHubProfileRepo[]
}
export type GitHubRepoStyleDetails = {
  nameWithOwner: string; url: string; description: string | null; commit?: string
  readme: string; readmePath?: string; dependencies: string; dependenciesPath: string
  globalsCss: string; globalsCssPath: string
  primaryLanguage?: string | null; relationship?: 'owned' | 'contributed'; authoredCommits?: number
  configFiles?: Array<{ path: string; content: string }>
  codeSamples?: Array<{ path: string; content: string; kind?: 'source' | 'test' | 'ui'; startLine?: number; endLine?: number; authorship?: 'verified' | 'project' }>
}
type RepoNode = {
  name?: string; nameWithOwner?: string; description?: string | null; url?: string
  stargazerCount?: number; forkCount?: number; updatedAt?: string; isArchived?: boolean
  isPrivate?: boolean; primaryLanguage?: { name?: string } | null
  owner?: { login?: string }; isFork?: boolean; isTemplate?: boolean
  defaultBranchRef?: { target?: { oid?: string } } | null
  repositoryTopics?: { nodes?: Array<{ topic?: { name?: string } }> }
}
export async function githubGraph<T>(query: string, variables: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
  const token = process.env.GITHUB_TOKEN?.trim()
  if (!token) throw new ServiceError('CONFIGURATION', 'GITHUB_TOKEN is required for generation.', 503)
  const { data, headers } = await serviceJson(API, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'gittoskill/0.2.0' },
    body: JSON.stringify({ query, variables }),
  }, { service: 'GitHub', signal, retryRead: true, maxBytes: 2 * 1024 * 1024 })
  const raw = data as { data?: T; errors?: Array<{ type?: string; message?: string; path?: Array<string | number> }> }
  if (raw.errors?.length) {
    const fatal = raw.errors.find(error => !['NOT_FOUND', 'FORBIDDEN'].includes(error.type ?? '') && !/could not resolve to (a )?(repository|user|organization)/i.test(error.message ?? ''))
    if (fatal || !raw.data) {
      if (headers.get('x-ratelimit-remaining') === '0' || raw.errors.some(error => error.type === 'RATE_LIMITED')) throw new ServiceError('UPSTREAM_RATE_LIMIT', 'GitHub quota reached. Please try again later.', 429, 60)
      throw new ServiceError('GITHUB_QUERY', 'GitHub could not return the requested public data.')
    }
    // Optional inaccessible fields remain null. Valid data is retained without
    // repeating the entire query, and public visibility is still required below.
  }
  if (!raw.data) throw new ServiceError('GITHUB_QUERY', 'GitHub returned no data.')
  return raw.data
}

const repoFields = `name nameWithOwner description url stargazerCount forkCount updatedAt isArchived isPrivate isFork isTemplate owner { login }
  primaryLanguage { name } defaultBranchRef { target { ... on Commit { oid } } }
  repositoryTopics(first: 5) { nodes { topic { name } } }`
const pinned = `pinnedItems(first: 6, types: REPOSITORY) { nodes { ... on Repository { ${repoFields} } } }`
const repositories = (user: boolean) => `repositories(first: 20, privacy: PUBLIC, isFork: false, ${user ? 'ownerAffiliations: OWNER,' : ''} orderBy: {field: UPDATED_AT, direction: DESC}) { nodes { ${repoFields} } }`

function normalize(node: RepoNode | null): GitHubProfileRepo | null {
  if (!node?.name || !node.nameWithOwner || !node.url || node.isPrivate !== false) return null
  return {
    name: node.name, nameWithOwner: node.nameWithOwner, description: node.description?.trim() || null,
    url: node.url, stargazerCount: node.stargazerCount ?? 0, forkCount: node.forkCount ?? 0,
    updatedAt: node.updatedAt ?? '', isArchived: Boolean(node.isArchived),
    primaryLanguage: node.primaryLanguage?.name || null, commit: node.defaultBranchRef?.target?.oid,
    topics: node.repositoryTopics?.nodes?.flatMap(entry => entry.topic?.name ? [entry.topic.name] : []) ?? [],
    ownerLogin: node.owner?.login || node.nameWithOwner.split('/')[0], isFork: Boolean(node.isFork), isTemplate: Boolean(node.isTemplate),
  }
}
export function selectReposForDeepDive(repos: GitHubProfileRepo[], login?: string): GitHubProfileRepo[] {
  const unique = new Map<string, GitHubProfileRepo>()
  for (const repo of repos) {
    if (repo.isArchived || repo.isFork || repo.isTemplate || (login && repo.name.toLowerCase() === login.toLowerCase() && repo.nameWithOwner.split('/')[0].toLowerCase() === login.toLowerCase())) continue
    const key = repo.nameWithOwner.toLowerCase()
    const previous = unique.get(key)
    unique.set(key, { ...repo, pinned: repo.pinned || previous?.pinned, contributions: Math.max(repo.contributions ?? 0, previous?.contributions ?? 0) })
  }
  const candidates = [...unique.values()]
  const owned = (repo: GitHubProfileRepo) => !login || (repo.ownerLogin || repo.nameWithOwner.split('/')[0]).toLowerCase() === login.toLowerCase()
  // Ownership, recent activity and demonstrated contribution outweigh popularity.
  const score = (repo: GitHubProfileRepo) => (owned(repo) ? 8 : 0) + (repo.pinned ? 3 : 0) + Math.min(3, Math.log2(1 + (repo.contributions ?? 0))) + Math.min(2, Math.log2(1 + repo.stargazerCount) / 5) + Math.max(0, 1 - (Date.now() - (Date.parse(repo.updatedAt) || 0)) / (2 * 365 * 86400000)) * 5
  candidates.sort((a, b) => score(b) - score(a) || a.nameWithOwner.localeCompare(b.nameWithOwner))
  const selected: GitHubProfileRepo[] = []
  const languages = new Set<string>()
  for (const repo of candidates.filter(owned)) {
    if (!owned(repo) && !(repo.contributions || repo.pinned)) continue
    const language = repo.primaryLanguage?.toLowerCase()
    if (language && !languages.has(language)) { selected.push(repo); languages.add(language) }
    if (selected.length === 4) return selected
  }
  return [...selected, ...candidates.filter(repo => owned(repo) && !selected.includes(repo)), ...candidates.filter(repo => !owned(repo) && (repo.contributions || repo.pinned))].slice(0, 4)
}

export async function getGitHubProfileOverview(login: string, signal?: AbortSignal): Promise<GitHubProfileOverview> {
  type Owner = {
    login: string; id?: string; __typename?: string; name?: string; bio?: string; description?: string; websiteUrl?: string; url: string; avatarUrl: string
    followers?: { totalCount: number }; pinnedItems?: { nodes: Array<RepoNode | null> }; repositories?: { nodes: Array<RepoNode | null> }
    contributionsCollection?: { commitContributionsByRepository?: Array<{ repository: RepoNode; contributions?: { totalCount: number } }> }
  }
  const result = await githubGraph<{ repositoryOwner?: Owner; profileReadme?: RepoNode }>(`query Profile($login: String!) {
    repositoryOwner(login: $login) {
      id __typename login url avatarUrl
      ... on User { name bio websiteUrl followers { totalCount } ${pinned} ${repositories(true)}
        contributionsCollection { commitContributionsByRepository(maxRepositories: 8) { repository { ${repoFields} } contributions(first: 1) { totalCount } } }
      }
      ... on Organization { name description websiteUrl ${pinned} ${repositories(false)} }
    }
    profileReadme: repository(owner: $login, name: $login) { nameWithOwner isPrivate }
  }`, { login }, signal)
  const owner = result.repositoryOwner
  if (!owner?.login || !owner.url) throw new ServiceError('PROFILE_NOT_FOUND', `Public GitHub profile "${login}" was not found.`, 404)
  return {
    login: owner.login, id: owner.id, kind: owner.__typename === 'Organization' ? 'Organization' : 'User', displayName: owner.name?.trim() || owner.login, bio: owner.bio?.trim() || owner.description?.trim() || null,
    websiteUrl: owner.websiteUrl || null, profileUrl: owner.url, avatarUrl: owner.avatarUrl,
    followerCount: owner.followers?.totalCount ?? null, profileReadme: '',
    profileReadmeRepository: result.profileReadme?.isPrivate === false ? result.profileReadme.nameWithOwner : undefined,
    pinnedRepos: (owner.pinnedItems?.nodes ?? []).map(normalize).filter((repo): repo is GitHubProfileRepo => Boolean(repo)).map(repo => ({ ...repo, pinned: true })),
    topRepos: (owner.repositories?.nodes ?? []).map(normalize).filter((repo): repo is GitHubProfileRepo => Boolean(repo)),
    contributedRepos: (owner.contributionsCollection?.commitContributionsByRepository ?? []).flatMap(entry => { const repo = normalize(entry.repository); return repo ? [{ ...repo, contributions: entry.contributions?.totalCount ?? 0 }] : [] }),
  }
}

export { getGitHubEvidence } from '@/lib/github-evidence'
