# Major changes

## Interface and experience

The English interface now has a responsive profile form, illustrative preview and dedicated result workspace. Style guide, Evidence and SKILL.md are separate views. Sources, attribution and sample limitations are visible alongside observations. Agent-specific installation, section copying, complete downloads, retry and cancellation support the full workflow.

Keyboard navigation, focus management, reduced-motion preferences and widths from 320 to 1280 pixels were checked during the redesign. Screenshots in `images/` are local UI captures. Result data is synthetic and clearly identified.

## Evidence and generation

Analysis selects up to four distinct public repositories using ownership, activity and language diversity. It samples implementation, tests, UI and explicit configuration across several languages. Public contributions and blame-attributed excerpts provide additional attribution; pinned projects alone do not establish authorship.

Observations cite known evidence and carry project/repeated/self-described scope. Unsupported sections are omitted. Organization profiles describe project/team conventions. The Azure model returns a constrained JSON structure, with deterministic checks for citations, categories and budgets. Model interpretation remains reviewable and fallible.

## Reliability and performance

Shared Redis storage coordinates cache entries, locks, concurrency and generation quotas. Provider fetches have timeouts, size limits and safe error responses. Duplicate requests reuse one generation; progressive polling reduces storage traffic while waiting.

Result components, Markdown rendering and archive preparation load on demand. A local measurement on October 5, 2026 compared the unique modern scripts referenced by the production homepage, excluding the `nomodule` polyfill:

| Measurement | Original version | Redesigned version |
| --- | ---: | ---: |
| JavaScript, uncompressed | 572,344 bytes | 487,036 bytes |
| JavaScript, summed gzip estimate | 169,244 bytes | 145,681 bytes |

This is a **13.9% reduction in estimated gzip size**. It does not measure real network transfer, Core Web Vitals, provider latency or throughput.

## CLI and security hardening

The CLI is a separate package with shared validation. Installation uses bounded bundles, safe paths, exclusive writes, snapshot locking and rollback. `.gitignore` updates reject links and use atomic replacement. Azure configuration requires HTTPS without embedded credentials. Browser responses add baseline CSP, frame protection, `nosniff`, referrer and permissions policies.

Next.js is updated to 16.3.8 and React to 19.2.8. The production dependency audit changed from 43 advisory entries in the original lockfile to zero on October 5. Entries can duplicate advisories and do not represent distinct exploitable application flaws. One known development advisory remains; see [SECURITY.md](../SECURITY.md).

GitHub dependency alerts and automated security updates are enabled. CI runs on Linux and Windows. Local audit logs, reproduction fixtures and source backups are retained locally and excluded from the published tree. Project regression tests remain in the repository.

## Validation

The checks are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm audit --prod` and the full `pnpm audit`. Tests cover API validation, service failures, evidence/authorship, caching and quotas, shared locks, UTF-8 archives, CLI rollback, filesystem links and HTTPS endpoint validation.

Live GitHub/Azure generation, hosted Redis and deployment load still require validation with real service configuration. GitHub publication does not deploy a website or publish a new npm package.
