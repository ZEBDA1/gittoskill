# GitToSkill CLI

Generate and install coding preferences inferred from a public GitHub profile.
Requires Node.js 24 or later.

This fork has not published a new npm package. To run the CLI from this checkout
against a local development server, use PowerShell:

```powershell
$env:GITTOSKILL_API_BASE_URL = 'http://localhost:3000'
pnpm cli:add -- @steipete --agent cursor
pnpm cli:add -- @steipete --global
pnpm cli:add -- @steipete --list
```

The backend defaults to `https://gittoskill.vercel.app`. Set
`GITTOSKILL_API_BASE_URL=http://localhost:3000` to use a local server.
Other API hosts must use HTTPS. Only public GitHub evidence is included.
Set the API origin explicitly for your own deployment. Running `npx gittoskill`
uses the npm-published version, which can differ from this fork.

The CLI validates metadata, identity, paths and file sizes before writing.
Generated snapshots live under `~/.gittoskill/generated`. Concurrent installs
for the same profile are locked; the previous snapshot is restored if the
installer fails. Installer changes in agent directories are controlled by
`skills` and cannot be rolled back by the snapshot mechanism.

Review generated instructions before installation. Local `.gitignore` updates
reject symbolic and hard links and use atomic replacement; installed skills
do not authorize sensitive actions by an agent. See [security guidance](../../SECURITY.md).

After a process crash, a `.lock` file may remain. Verify that its recorded
process has stopped before removing it and retrying. Do not delete an active lock.

Normal `skills add` flags are forwarded unchanged. Use `--global` for global
installation; project installation is the default scope.

## License

MIT. This package's production dependencies are limited to `skills` and `yaml`.
