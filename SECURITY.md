# Security & publishing guide

How to publish this project (e.g. on GitHub) **without leaking your API key or
letting strangers use your backend.**

## The one rule

**You cannot hide a secret in something you ship to players.** The `.mcaddon` is
a zip of plaintext JavaScript — anyone can unzip it and read `userConfig.js`. So
if you publish a build that points at *your* cloud backend with *your* token,
people can extract it and run quizzes on *your* API key / AWS bill.

➡️ **Ship code, not secrets.** Everyone who wants AI runs their **own** local
proxy or deploys their **own** `cloud/` backend with their **own** key
("Bring Your Own"). The repo already defaults to this.

## What counts as a secret (never commit these)

| Secret | Where it lives | Protected by |
| --- | --- | --- |
| Anthropic API key | `proxy/anthropic-key.txt` / Secrets Manager | `.gitignore`, never in source |
| Terraform state | `cloud/terraform/*.tfstate` | `.gitignore` (state stores the key in **plaintext**) |
| Terraform vars | `cloud/terraform/terraform.tfvars` | `.gitignore` |
| Cloud gateway URL + `auth_token` | `userConfig.js` (if you fill it in) | **build guard + pre-commit hook** |

⚠️ GitHub's secret scanning will auto-block an `sk-ant-…` key, but it will **not**
recognize your gateway URL + random token. Don't rely on GitHub for that — that's
what the hook and build guard below are for.

## Turn on the safety nets (once per clone)

```bash
git config core.hooksPath .githooks
```

This enables `.githooks/pre-commit`, which blocks commits that contain a real
token in `userConfig.js`, Terraform state/vars, or an `sk-ant-…` key.

The build script (`tools/build-dist.ps1`) has a matching guard: it refuses to
build the committed `dist/StudyQuiz.mcaddon` if `userConfig.js` holds anything
but placeholders. (Use `-AllowSecrets` only to build a **private** bundle you
will **not** commit.)

## Before you push — checklist

- [ ] `git config core.hooksPath .githooks` is set.
- [ ] `userConfig.js` shows placeholders: `USER_API_KEY = "local-proxy"`,
      `USER_CLOUD_API_BASE = ""`, endpoint on `127.0.0.1`.
- [ ] `git status` shows **no** `terraform.tfvars`, `*.tfstate`, or
      `proxy/anthropic-key.txt`.
- [ ] `git grep -nE 'sk-ant-|execute-api'` returns nothing real.
- [ ] If you rebuilt `dist/`, you did it with placeholders (the guard enforces this).

## If a secret ever leaks (rotate immediately)

Git history keeps deleted secrets, so **rotating is the fix, not deleting the file.**

- **Anthropic key:** revoke it in the Anthropic console and issue a new one.
  Update `proxy/anthropic-key.txt` or `terraform.tfvars` → `terraform apply`.
- **Cloud auth token:** it's a Terraform `random_password`; regenerate with
  ```bash
  terraform apply -replace=random_password.auth_token
  ```
  then update `USER_API_KEY` in your *private* `userConfig.js`.

## Defense in depth (cloud)

Even with BYO, set these in `cloud/terraform/terraform.tfvars` so a mistake can't
become an expensive one:

- `budget_alert_email` — monthly AWS spend alert (80% actual / 100% forecast).
- `throttle_rate_limit` / `throttle_burst_limit` — cap requests/sec on the API.
- For a widely-shared deployment, add API Gateway usage plans / WAF and consider
  **Cognito** per-teacher logins for the dashboard instead of a shared token.
