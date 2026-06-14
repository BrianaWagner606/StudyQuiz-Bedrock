# ☁️ Study Quiz — Cloud Backend (AWS)

This is the **optional** cloud version of the AI helper. The add-on works fine
without it — deploy this only if you want the extras:

- No helper program to start before your server
- A **teacher dashboard** in your browser
- Player progress and a leaderboard that work **across servers**
- A shared question cache and some basic analytics

It's all serverless, so when nobody's playing it costs about nothing. And it maps
neatly onto the AWS topics in the curriculum packs, so setting it up is good
practice if you're studying for those certs.

---

## What it builds

| Piece | Service |
| --- | --- |
| AI gateway | Lambda + API Gateway |
| Your key / token | Secrets Manager |
| Question cache | DynamoDB (auto-expiring) |
| Player progress + leaderboard | DynamoDB |
| Teacher dashboard | S3 + CloudFront |
| Analytics events | S3 (queryable with Athena) |
| Cache warmer | EventBridge + Lambda |

---

## Before you start

- An AWS account with credentials set up (`aws configure`).
- [Terraform](https://developer.hashicorp.com/terraform/install) 1.5+.
- One of:
  - **Bedrock** access to a Claude model (no API key — recommended), or
  - an **Anthropic API key**.

No build step needed — the Lambdas use only built-ins and the AWS SDK that's
already in the Node 20 runtime.

---

## Deploy

```bash
cd cloud/terraform
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars: pick bedrock or anthropic
terraform init
terraform apply
```

Then grab the outputs:

```bash
terraform output game_endpoint        # the AI endpoint for the game
terraform output -raw auth_token      # the access token (keep it secret)
terraform output api_base_url         # the data API base
terraform output dashboard_url        # open this in a browser
```

### Point the game at it

Edit `study_quiz_bp/scripts/userConfig.js` on your **server**:

```js
export const USER_API_KEY        = "<auth_token>";
export const USER_API_ENDPOINT   = "<game_endpoint>";   // .../v1/chat/completions
export const USER_CLOUD_API_BASE = "<api_base_url>";    // same host, no path
```

Restart the server. (Leave the copy in the repo on its placeholders, so your
token never gets committed.)

### Open the dashboard

Go to the `dashboard_url`, paste the `auth_token`, and you'll see the leaderboard
and can assign a class lesson. The game picks up changes within a minute or so.

---

## Using Bedrock? Turn on model access first

This is the thing that trips everyone up. Before any Claude model works on
Bedrock, you have to **request model access** in the console and fill out the
one-time Anthropic use-case form. Until you do, calls fail with
*"use case details have not been submitted."*

One catch: the model runs across **several regions**, so you have to enable access
in **all of them**. For the default Haiku model that's **us-east-1, us-east-2, and
us-west-2**. For each one:

1. In the AWS console, switch the region (top-right).
2. Go to **Bedrock → Model access → Modify model access**.
3. Check **Claude Haiku 4.5**, submit (fill the use-case form the first time).
4. Wait a couple of minutes for it to say "Access granted."

If you miss a region, it works *sometimes* and fails *sometimes* — that's the
tell. No redeploy needed once access goes through.

Prefer to deal with one region? Set
`bedrock_model_id = "anthropic.claude-3-haiku-20240307-v1:0"` — an older model
that runs in `us-east-1` only.

---

## Analytics (optional)

Every answer is logged to the events bucket as JSON
(`{"type":"answer","name":"...","topic":"...","difficulty":"...","correct":true}`).
If you want to ask questions like "which topics is the class struggling with,"
point Athena at it:

```sql
CREATE EXTERNAL TABLE study_quiz_events (
  type string, name string, topic string, difficulty string,
  correct boolean, ts bigint
)
PARTITIONED BY (dt string)
ROW FORMAT SERDE 'org.openx.data.jsonserde.JsonSerDe'
LOCATION 's3://<your-events-bucket>/events/';

MSCK REPAIR TABLE study_quiz_events;
```

Then, for example:

```sql
SELECT topic, round(100.0 * sum(if(correct,1,0)) / count(*), 1) AS accuracy_pct
FROM study_quiz_events WHERE type = 'answer'
GROUP BY topic ORDER BY accuracy_pct;
```

---

## Staying safe

- Your key and token live only in Secrets Manager.
- Every request needs the access token, so a leaked URL alone can't run up a bill.
- There's API rate limiting, and you can set `budget_alert_email` for a spend
  alert. For a public deployment, consider adding Cognito logins.

---

## Tear it down

```bash
terraform destroy
```

Removes everything, dashboard and event history included.
