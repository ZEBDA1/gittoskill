# Security

## Reporting a vulnerability

For a sensitive issue, use GitHub's **Report a vulnerability** option in this fork's Security tab when available. Do not include live credentials, personal data or an exploitable payload in a public issue. This fork and the original project are maintained independently.

## Current status

The dependency audit on October 5, 2026 reports no known vulnerabilities in production dependencies. The complete audit reports **CVE-2026-93687 / GHSA-vfj7-8cjw-p6xm** in development-only `braces 3.0.3`, used by the Next.js ESLint plugin through `fast-glob` and `micromatch`.

The advisory describes stack exhaustion from deeply nested brace patterns. No public API path into this lint dependency was identified. The npm registry has no published `3.0.4` release despite the audit endpoint advertising that corrective range. Do not force an override to an unpublished version. Avoid untrusted lint patterns/configuration and reassess when a verified upstream fix becomes available. [Official advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).

The full dependency audit remains visible as a non-blocking CI step while this development advisory has no published fix. Production auditing, lint, type checking, tests and builds remain blocking. Review every newly reported advisory; a passing CI status alone does not establish that the full audit is clean.

## Implemented protections

- Secrets stay on the server. Environment files and local audit artifacts are excluded from Git; the example environment contains placeholders only.
- GitHub profile inputs, bundle identities, paths and sizes are validated. External responses are bounded, timed out and cannot follow redirects.
- Redis-backed quotas and locks coordinate production instances. Cache entries and duplicate requests are bounded.
- Azure and Redis endpoints require HTTPS. Azure rejects URL credentials, query strings and fragments.
- CLI `.gitignore` updates reject symbolic/hard links and non-regular files, read through a checked file handle, and replace the directory entry with an exclusive temporary file. Temporary files are cleaned up after errors.
- Browser responses prohibit framing and objects, constrain the base URL, prevent content sniffing and disable unnecessary device permissions. The CSP is a baseline policy; it does not yet restrict script sources.
- GitHub secret scanning, push protection, dependency vulnerability alerts and automated security updates are enabled on this fork.

## Deployment responsibilities

Use least-privilege GitHub and provider credentials, HTTPS, shared Redis storage and hosting-level traffic protection. Trust forwarded client headers only when the hosting proxy overwrites them. Keep provider usage monitoring and appropriate billing controls active.

The anonymous API can still be used to consume the permitted generation budget or Redis/serverless resources. Application limits do not constitute a complete bot defense or an exact monetary cap. Before wide public exposure, add a server-verified bot challenge or authenticated generation allowance appropriate to both browser and CLI clients.

The CLI defaults to the original project's hosted API. Configure `GITTOSKILL_API_BASE_URL` explicitly when using this fork's own deployment. The published npm package and the hosted original service are separate from this source checkout.

## Generated skills are untrusted output

Repository owners can place hostile instructions in code and documentation. Structured output, source validation and system prompts reduce risk but cannot guarantee protection from indirect prompt injection. No complete attack against the real Azure model was demonstrated during local validation.

Review the guide and its references before installation. Generated instructions must not authorize command execution, secret disclosure or changes to security settings. Keep the destination agent's permissions limited and require user approval for sensitive operations. A citation proves which source was referenced, not that an instruction is safe or accurate.

## Scope of verification

Local regression tests cover filesystem link protection and rejection of insecure Azure endpoints before any network request. Provider integration tests use fixtures. Actual deployment headers, provider credentials, model behavior and load require separate verification in the target environment. No audit can certify the absence of all vulnerabilities.
