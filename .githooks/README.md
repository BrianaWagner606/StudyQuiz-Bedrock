# Git hooks

`pre-commit` is a secret guard: it blocks commits that would leak your Anthropic
key, Terraform state/vars, or a `userConfig.js` pointed at a live cloud backend.

Enable it once per clone (hooks aren't shared automatically):

```bash
git config core.hooksPath .githooks
```

On Windows, Git for Windows runs the hook through its bundled `sh`, so no extra
setup is needed. Bypass for a single commit (not recommended) with
`git commit --no-verify`.
