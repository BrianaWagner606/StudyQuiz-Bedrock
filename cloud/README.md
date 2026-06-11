# ☁️ Study Quiz — Cloud Backend (AWS)

Optional serverless backend that replaces the local `proxy/` and adds
cross-server progress, a teacher dashboard, and analytics. **The add-on works
fine without this** — deploy it only when you want the cloud features.

It maps almost 1:1 onto the AWS curriculum pack, so standing it up doubles as
hands-on practice for the SAA / Developer / Terraform Associate exams.

---

## What it provisions

| Piece | Service | Why |
| --- | --- | --- |
| AI gateway | **Lambda + API Gateway (HTTP API)** | Serverless `proxy/server.js` — no "start proxy first", HTTPS, multi-server |
| Model key | **Secrets Manager** | Key/token never in source or pack files |
| Question cache | **DynamoDB (TTL)** | Shared across all players/servers; cuts cost + latency |
| Player progress | **DynamoDB** | Cross-server profiles + leaderboard |
| Class assignment | **DynamoDB** | Dashboard ⇄ in-game stay in sync |
| Teacher dashboard | **S3 + CloudFront** | Live roster + lesson assignment in a browser |
| Analytics events | **S3** (Athena-queryable) | Per-answer log for learning insights |
| Cache prewarmer | **EventBridge + Lambda** | Keeps popular packs warm off-peak |

Cost is tiny — everything is pay-per-request / scales to zero. A classroom runs
for pennies.

---

## Prerequisites

- An AWS account + credentials configured (`aws configure` or env vars).
- **Terraform ≥ 1.5**.
- One of:
  - an **Anthropic API key** (`upstream = "anthropic"`), or
  - **Bedrock** access to a Claude model in your region (`upstream = "bedrock"`).

No Node build step is needed — the Lambdas use only built-ins + the AWS SDK v3
that ships in the `nodejs20.x` runtime.

---

## Deploy

```bash
cd cloud/terraform
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars: set upstream + anthropic_api_key (or switch to bedrock)

terraform init
terraform apply
```

After apply, read the outputs:

```bash
terraform output game_endpoint        # -> USER_API_ENDPOINT
terraform output -raw auth_token      # -> USER_API_KEY  (keep secret)
terraform output api_base_url         # -> USER_CLOUD_API_BASE
terraform output dashboard_url        # open in a browser
```

### Point the game at the cloud

Edit `study_quiz_bp/scripts/userConfig.js`:

```js
export const USER_API_KEY        = "<auth_token>";
export const USER_API_ENDPOINT   = "<game_endpoint>";          // .../v1/chat/completions
export const USER_CLOUD_API_BASE = "<api_base_url>";           // same host, no path
```

Repackage (`tools/build-dist.ps1`) or copy the behavior pack to your server, then
restart. `permissions.json` still needs `@minecraft/server-net` (same as the
local proxy — see the main USER_GUIDE).

> Leave `USER_CLOUD_API_BASE` blank to use the cloud **only** for AI questions
> and keep progress local.

### Open the dashboard

Browse to `dashboard_url`, paste the `auth_token`, and **Save**. You'll see the
live leaderboard and can assign/lock a class lesson — which the game picks up
within ~60s (and vice-versa).

---

## Switching to Bedrock

Set in `terraform.tfvars`:

```hcl
upstream         = "bedrock"
anthropic_api_key = ""    # not needed
# Most current Claude models on Bedrock are invokable ONLY via a cross-region
# inference profile (us.* in the US, eu.* in Europe). The bare model id
# (anthropic.claude-...) returns "on-demand throughput isn't supported".
bedrock_model_id = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
```

`terraform apply`. The gateway now calls Bedrock with IAM — no API key. List what
your account can invoke:

```bash
aws bedrock list-inference-profiles --region us-east-1 \
  --query "inferenceProfileSummaries[?contains(inferenceProfileId,'haiku')].inferenceProfileId" --output text
```

The IAM policy already allows both `foundation-model/*` and `inference-profile/*`,
which cross-region profiles require.

### ⚠️ Enable model access first (the step that bites everyone)

Before any Claude model works, your account must **request model access** and
submit the one-time **Anthropic "use case details" form**. Until you do, calls
fail with:

> `ResourceNotFoundException: Model use case details have not been submitted for this account...`

Crucially, a **cross-region inference profile invokes the model in several
regions**, so access must be granted in **every** region the profile spans — not
just your deploy region. Check which regions:

```bash
aws bedrock get-inference-profile \
  --inference-profile-identifier us.anthropic.claude-haiku-4-5-20251001-v1:0 \
  --region us-east-1 --query 'models[].modelArn' --output text
```

For `us.anthropic.claude-haiku-4-5` that's **us-east-1, us-east-2, us-west-2**.
For **each** region:

1. AWS Console → set the **Region** selector (top-right) to that region.
2. **Amazon Bedrock → Model access** → **Modify model access**.
3. Tick **Anthropic → Claude Haiku 4.5** → **Next** → **Submit**. The first time
   it asks for use-case details (one-time, account-wide); after that it's just
   the per-region checkbox.
4. Wait for **Access granted** (a minute or two; the error warns up to ~15).

No redeploy is needed afterward — invocations just start succeeding. Symptom of a
missed region: it works *intermittently* (some calls 200, some 502), because the
profile load-balances across regions.

> Prefer a single region to manage? Set `bedrock_model_id =
> "anthropic.claude-3-haiku-20240307-v1:0"` — an older model with on-demand
> throughput in `us-east-1` only (still needs the use-case form, once).

---

## Analytics with Athena

Events land in the events bucket as newline-delimited JSON under
`events/dt=YYYY-MM-DD/`. Create a partitioned table:

```sql
CREATE EXTERNAL TABLE study_quiz_events (
  type        string,
  xuid        string,
  name        string,
  topic       string,
  difficulty  string,
  curriculumId string,
  correct     boolean,
  ts          bigint,
  ingestedAt  string
)
PARTITIONED BY (dt string)
ROW FORMAT SERDE 'org.openx.data.jsonserde.JsonSerDe'
LOCATION 's3://<events_bucket>/events/';

-- register partitions (or enable partition projection)
MSCK REPAIR TABLE study_quiz_events;
```

Then, e.g. "hardest sub-topics this week":

```sql
SELECT topic, difficulty,
       count(*) answered,
       round(100.0 * sum(if(correct,1,0)) / count(*), 1) accuracy_pct
FROM study_quiz_events
WHERE type = 'answer'
GROUP BY topic, difficulty
ORDER BY accuracy_pct ASC;
```

---

## Security notes

> Publishing the repo? See [../SECURITY.md](../SECURITY.md) for the "Bring Your
> Own key" model, the pre-push checklist, and token/key rotation.

- The model key + shared token live **only** in Secrets Manager.
- Every request needs `Authorization: Bearer <auth_token>`; the gateway and data
  API reject anything else, so a leaked endpoint URL alone can't run up your bill.
- The dashboard holds the token in `localStorage` — fine for a class tool. To
  harden, front the API/dashboard with **Cognito** and per-teacher logins.
- Add **API Gateway throttling / WAF** if you expose this widely.

---

## Tear down

```bash
terraform destroy
```

(The S3 buckets use `force_destroy`, so this removes the dashboard + events too.)

---

## Architecture

```
Minecraft (server-net HTTP)
        │  Bearer <token>
        ▼
 API Gateway (HTTP API)
   ├── POST /v1/chat/completions ─► gateway Lambda ─► DynamoDB cache
   │                                         └► Anthropic API  | Bedrock
   ├── GET/POST /profiles/{xuid} ─┐
   ├── GET  /leaderboard          ├► api Lambda ─► DynamoDB (profiles, config)
   ├── GET/PUT /class             │              └► S3 (events)
   └── POST /events ──────────────┘
 EventBridge (rate) ─► prewarm Lambda ─► gateway

 Browser ─► CloudFront ─► S3 (dashboard) ─► API Gateway (leaderboard/class)
```
