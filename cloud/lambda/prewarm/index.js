// ============================================================
//  STUDY QUIZ - CACHE PREWARMER (Lambda, scheduled by EventBridge)
// ============================================================
// Periodically issues representative question requests to the gateway so the
// DynamoDB cache and the model/container stay warm for popular curriculum
// packs. Runs off-peak; bounded so it never runs up a surprise bill.
//
// NOTE ON CACHE HITS: the live game rotates focus sub-topics randomly and grows
// a per-player "avoid" list, so a prewarmed entry matches a real request only
// when the prompts line up (e.g. a brand-new player's first pull). Treat this
// as best-effort warming + a cheap health/keepalive, not a guaranteed hit.
// ============================================================

const https = require("https");
const { URL } = require("url");
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");

const REGION = process.env.AWS_REGION || "us-east-1";
const SECRET_ARN = process.env.SECRET_ARN || "";
const GATEWAY_URL = process.env.GATEWAY_URL || ""; // e.g. https://abc.execute-api.us-east-1.amazonaws.com/v1/chat/completions
const MODEL = process.env.DEFAULT_MODEL || "claude-haiku-4-5-20251001";
const MAX_REQUESTS = Number(process.env.PREWARM_MAX_REQUESTS || 12); // hard cost ceiling per run
const OPTION_COUNT = Number(process.env.PREWARM_OPTION_COUNT || 4);

const secrets = new SecretsManagerClient({ region: REGION });

// Compact mirror of the curriculum subjects + the most popular difficulties to
// warm. Keep this short; each entry is one model call.
const SUBJECTS = [
  { subject: "Cloud & IaC", focus: "VPC networking; IAM and least privilege; Lambda and serverless" },
  { subject: "DevOps & SRE", focus: "CI/CD pipeline design; Kubernetes pods deployments services; SLO SLI and error budgets" },
  { subject: "AI / ML Engineering", focus: "RAG chunking and embeddings; agentic tool use and orchestration; LLM evaluation rubrics and LLM-as-judge" },
  { subject: "Security", focus: "IAM least privilege and RBAC; encryption at rest and KMS; OWASP Top 10" }
];
const DIFFICULTIES = [
  { value: "associate", note: "associate / mid-level practitioner difficulty" },
  { value: "mixed", note: "a mix of foundational, associate, and professional difficulty" }
];

let cachedSecret = null;
async function getSecret() {
  if (cachedSecret) {
    return cachedSecret;
  }
  if (!SECRET_ARN) {
    cachedSecret = {};
    return cachedSecret;
  }
  const out = await secrets.send(new GetSecretValueCommand({ SecretId: SECRET_ARN }));
  cachedSecret = JSON.parse(out.SecretString || "{}");
  return cachedSecret;
}

// Mirror ApiProvider.buildPrompt so a prewarm can line up with a fresh request.
function buildPrompt(subject, optionCount, difficultyNote, focus) {
  const lines = [
    "Return ONLY a JSON array with no markdown and no extra text.",
    "Each array item must match exactly:",
    '{ "question": "...", "options": ["...","...","...","..."], "answerIndex": 0 }',
    `Topic: ${subject}`,
    `Generate 10 questions. Use exactly ${optionCount} distinct options for each question.`,
    "answerIndex must be the integer index of the correct option.",
    "Every question must be NEW and clearly different in wording AND subject matter from any listed below.",
    "Explore less-common sub-topics, deeper details, and applied/scenario angles rather than repeating the most obvious facts."
  ];
  if (difficultyNote) {
    lines.push(`Difficulty: ${difficultyNote}.`);
  }
  if (focus) {
    lines.push(`Focus topics this batch: ${focus}.`);
  }
  return lines.join("\n");
}

function postChat(token, payload) {
  return new Promise((resolve) => {
    const url = new URL(GATEWAY_URL);
    const data = JSON.stringify(payload);
    const req = https.request(
      {
        host: url.host,
        path: url.pathname + url.search,
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          "content-length": Buffer.byteLength(data)
        }
      },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode || -1, cache: res.headers["x-gw-cache"] }));
      }
    );
    req.on("error", (e) => resolve({ status: -1, error: `${e}` }));
    req.write(data);
    req.end();
  });
}

exports.handler = async () => {
  if (!GATEWAY_URL) {
    console.warn("[prewarm] GATEWAY_URL not set; nothing to do.");
    return { ok: false, reason: "no_gateway_url" };
  }
  const secret = await getSecret();
  const token = `${secret.authToken ?? ""}`.trim();

  const targets = [];
  for (const s of SUBJECTS) {
    for (const d of DIFFICULTIES) {
      targets.push({ ...s, ...d });
    }
  }

  let sent = 0;
  const results = [];
  for (const t of targets) {
    if (sent >= MAX_REQUESTS) {
      break;
    }
    const payload = {
      model: MODEL,
      temperature: 0.9,
      messages: [
        { role: "system", content: "You generate concise, varied quiz items and never repeat questions." },
        { role: "user", content: buildPrompt(t.subject, OPTION_COUNT, t.note, t.focus) }
      ]
    };
    const r = await postChat(token, payload);
    results.push({ subject: t.subject, difficulty: t.value, status: r.status, cache: r.cache });
    sent += 1;
  }

  console.log(`[prewarm] sent ${sent} requests: ${JSON.stringify(results)}`);
  return { ok: true, sent, results };
};
