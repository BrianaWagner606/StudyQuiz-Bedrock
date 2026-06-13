# Security & publishing

Sharing this project? Here's how to do it without leaking your API key or letting
strangers run questions on your bill.

## The one rule

**You can't hide a secret in something you give to players.** The `.mcaddon` is
just a zip of plain text — anyone can open it and read the files inside. So if you
ship a build that points at *your* backend with *your* key, people can pull that
out and use it.

So the rule is simple: **share the code, not your secrets.** Anyone who wants AI
runs their own helper or deploys their own cloud with their own key. This project
already works that way by default.

## What counts as a secret (never commit these)

- Your AI key — it lives in `proxy/anthropic-key.txt` (local) or AWS Secrets
  Manager (cloud), never in a pack file.
- Terraform state and variable files (`cloud/terraform/*.tfstate`,
  `terraform.tfvars`) — these can hold your key in plain text.
- A `userConfig.js` that points at your real cloud backend.

All of these are already in `.gitignore`. Heads up: GitHub will catch an
`sk-ant-…` key automatically, but it will **not** recognize your cloud URL or
token — that's what the guards below are for.

## Turn on the guard (once per copy)

```bash
git config core.hooksPath .githooks
```

This enables a check that blocks a commit if it contains a real key, Terraform
state, or a `userConfig.js` pointed at a live backend. The build script has a
matching check, so you can't accidentally bake a token into the packaged add-on.

## Before you push — quick checklist

- [ ] The hook is on (`git config core.hooksPath .githooks`).
- [ ] `userConfig.js` shows the placeholders (`local-proxy`, `127.0.0.1`, blank
      cloud URL).
- [ ] `git status` shows no `terraform.tfvars`, `*.tfstate`, or key files.
- [ ] `git grep -nE 'sk-ant-|execute-api'` only turns up example text.

## If a secret ever leaks

Git history keeps deleted files, so the fix is to **rotate the secret**, not just
delete it:

- **AI key:** revoke it in your provider's console and make a new one.
- **Cloud token:** regenerate it with
  `terraform apply -replace=random_password.auth_token`.

## A little extra safety (cloud)

In `cloud/terraform/terraform.tfvars` you can set a `budget_alert_email` to get a
spend alert, and the API already has rate limits — so even if a token slipped out,
the damage is capped. Details in [cloud/README.md](cloud/README.md).
