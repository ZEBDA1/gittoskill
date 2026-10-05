# GitToSkill

Fork of [filiksyos/gittoskill](https://github.com/filiksyos/gittoskill), with improvements to generation reliability, evidence attribution, performance and the user interface. The original project's history and attribution are preserved.

Turn a public GitHub profile into a coding skill with verifiable source citations.
Preview the skill, download SKILL.md or a complete .tar bundle, and install it with the separate CLI.

## Evidence and experience

The English interface separates the style guide, cited evidence and complete SKILL.md. It supports keyboard navigation, mobile layouts, cancellation and agent-specific install commands. Result views and archive preparation load when needed.

Analysis samples up to four public repositories, prioritizing ownership, recent work and language diversity. Forks, templates, archived projects and the profile README are excluded from implementation selection. Public contributions can supplement the sample; foreign pinned projects require authored commits and blame-attributed code before they enter the guide. Repository ownership alone never proves personal authorship.

Source discovery includes implementation, tests, components and explicit formatting configuration, including non-web languages such as C/C++, C#, Dart, Rust and Python. Sampling is bounded and does not inspect all files or history. Manifest dependencies cannot establish testing practices or visual preferences by themselves.

Each supported observation cites one or more files, ideally pinned to a commit and line range, and indicates whether it comes from one project, multiple projects or a public statement. User and organization profiles have different attribution scope. The downloaded guide includes limitations and references. A minimal sample can produce no style observations; coverage labels describe sample breadth, not an accuracy percentage. Model interpretation still needs human review.

## Local development

Requires Node.js 24 and pnpm 11.25.0, recorded in .nvmrc and package.json.

```sh
pnpm install --frozen-lockfile --ignore-scripts
```

Copy .env.example to .env.local. Configure GITHUB_TOKEN, AZURE_OPENAI_API_KEY, AZURE_OPENAI_BASE_URL and AZURE_OPENAI_DEPLOYMENT_NAME_MAP. Use a GitHub token with access to public repositories; private repositories are excluded from generated evidence. The Azure deployment must support strict JSON-schema structured outputs and the selected reasoning effort. Set a model and deployment actually available in your Azure resource.

```sh
pnpm dev
```

Open http://localhost:3000. Opening a profile URL only fills the form; submission starts generation.

## Production

Configure GITTOSKILL_REDIS_REST_URL and GITTOSKILL_REDIS_REST_TOKEN with an HTTPS Redis REST service supporting GET, SET NX EX and EVAL. Cache, locks and quotas are shared between instances. Production returns a controlled 503 if shared storage is missing.

For a deliberate single-instance deployment only, GITTOSKILL_ALLOW_MEMORY_STORE=true enables in-memory storage. Its state is lost on restart and cannot coordinate multiple workers. Development uses memory by default.

| Budget | Default |
| --- | --- |
| Cache lifetime | 12 hours |
| Requests per client | 30 per 15 minutes |
| New generations across deployment | 100 per hour |
| Concurrent generations | 4 |
| Generation deadline | 80 seconds |

.env.example documents configurable budgets. Cache keys include the profile, analysis version, model, deployment and reasoning effort. Results refresh after expiry. Concurrent requests share one generation. Browser cancellation stops waiting; an already started bounded generation can finish for other clients and the cache.

Set NEXT_PUBLIC_SITE_URL to your canonical origin before building. Analytics is opt-in with NEXT_PUBLIC_ENABLE_ANALYTICS=true. Enable GITTOSKILL_TRUST_PROXY only behind a proxy that overwrites x-forwarded-for. Vercel uses its platform-provided client header; other untrusted clients share an anonymous quota bucket. Public hosting should also have perimeter traffic limits.

```sh
pnpm build
pnpm start
```

Logs contain timings, cache status, token counts and safe error codes, excluding credentials, prompts and raw provider error bodies.

## CLI

The private website and publishable packages/cli package are separate. Local changes do not update an already published npm version.

PowerShell against the local development server:

```powershell
$env:GITTOSKILL_API_BASE_URL = 'http://localhost:3000'
pnpm cli:add -- @steipete --agent cursor
```

After publishing the updated CLI:

```sh
npx gittoskill add @steipete --agent cursor
npx gittoskill add @steipete --global
npx gittoskill add @steipete --list
```

Project scope is the default. Flags are forwarded to skills add. Metadata, identity, paths and sizes are validated before writing. Snapshot replacement uses staging and locks, with rollback on installer failure. Agent-directory changes made by skills are outside this rollback. See [CLI documentation](packages/cli/README.md).

## Validation and maintenance

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm audit --prod
```

Tests cover API input, upstream errors, public evidence, authorship, language sampling, citations, cache, shared locks, quotas, CLI rollback and UTF-8 archives. CI is configured for Windows and Linux; Dependabot proposes weekly updates.

ESLint remains on 9 because the current React/accessibility plugins are not compatible with 10. The full audit includes a development-only braces advisory without a published fix. Production dependencies are clean at the time of this update. Revisit both when compatible upstream fixes become available.

French reports: [initial audit](audit/AUDIT-2026-10-05.md), [first modernization](audit/IMPLEMENTATION-2026-10-05.md) and [style generation and UX](audit/STYLE-UX-2026-10-05.md).

## Structure

- app/: website and API
- components/: profile form, deferred skill workspace and Markdown fallback
- lib/: GitHub/Azure, evidence, caching and archive
- packages/cli/: CLI and shared validation
- tests/: regression tests
- audit/: reports, source backup and verification artifacts

## License

MIT. See [LICENSE](LICENSE).
