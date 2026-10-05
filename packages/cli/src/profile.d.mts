export type GitHubProfileInput = { login: string }
export function normalizeProfileSegment(raw: string): string
export function isValidGitHubProfileLogin(raw: string): boolean
export function parseGitHubProfileInput(raw: string): GitHubProfileInput | null
export function skillDirectoryName(login: string): string
