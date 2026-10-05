# GitToSkill CLI

Generate and install coding preferences inferred from a public GitHub profile.
Requires Node.js 24 or later.

```sh
npx gittoskill add @steipete --agent cursor
npx gittoskill add @steipete --global
npx gittoskill add @steipete --list
```

The backend defaults to `https://gittoskill.vercel.app`. Set
`GITTOSKILL_API_BASE_URL=http://localhost:3000` to use a local server.
Other API hosts must use HTTPS. Only public GitHub evidence is included.

The CLI validates metadata, identity, paths and file sizes before writing.
Generated snapshots live under `~/.gittoskill/generated`. Concurrent installs
for the same profile are locked; the previous snapshot is restored if the
installer fails. Installer changes in agent directories are controlled by
`skills` and cannot be rolled back by the snapshot mechanism.

After a process crash, a `.lock` file may remain. Verify that its recorded
process has stopped before removing it and retrying. Do not delete an active lock.

Normal `skills add` flags are forwarded unchanged. Use `--global` for global
installation; project installation is the default scope.

## License

MIT. This package's production dependencies are limited to `skills` and `yaml`.
