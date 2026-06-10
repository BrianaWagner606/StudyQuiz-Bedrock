// ============================================================
//  STUDY QUIZ - CLOUD AI GATEWAY (Lambda)
// ============================================================
// The serverless version of proxy/server.js. Same contract: the Minecraft
// add-on POSTs an OpenAI-shaped /v1/chat/completions request; this function
// translates to the real model provider, returns an OpenAI-shaped response,
// and caches identical requests in DynamoDB so every player/server shares them.
//
// Upstream is selectable (env UPSTREAM):
//   - "anthropic" : calls api.anthropic.com with a key from Secrets Manager
//   - "bedrock"   : calls Amazon Bedrock InvokeModel (no API key; uses IAM)
//
// Auth: the request must carry  Authorization: Bearer <token>  where <token>
// matches the shared token in the secret. The game already sends its
// USER_API_KEY as this bearer, so no game-side auth code is needed.
// ============================================================

const https = require("https");
const crypto = require("crypto");
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");

const REGION = process.env.AWS_REGION || "us-east-1";
const UPSTREAM = (process.env.UPSTREAM || "anthropic").toLowerCase();
const SECRET_ARN = process.env.SECRET_ARN || "";
const CACHE_TABLE = process.env.CACHE_TABLE || "";
const CACHE_TTL_SECONDS = Number(process.env.CACHE_TTL_SECONDS || 60 * 60 * 24); // 24h
const DEFAULT_MODEL = process.env.DEFAULT_MODEL || "claude-haiku-4-5-20251001";
const BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID || "anthropic.claude-3-5-haiku-20241022-v1:0";

const ANTHROPIC_HOST = "api.anthropic.com";
const ANTHROPIC_PATH = "/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

const ddb = CACHE_TABLE ? DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION })) : null;
const secrets = new SecretsManagerClient({ region: REGION });
const bedrock = UPSTREAM === "bedrock" ? new BedrockRuntimeClient({ region: REGION }) : null;

// Cache the secret across warm invocations so we don't hit Secrets Manager
// on every request.
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

// ---- OpenAI <-> Anthropic translation (ported from proxy/server.js) ----
function openAiToAnthropic(openai) {
  const messages = Array.isArray(openai.messages) ? openai.messages : [];
  let system = "";
  const out = [];
  for (const m of messages) {
    const content = `${m?.content ?? ""}`;
    if (m?.role === "system") {
      system += (system ? "\n" : "") + content;
    } else {
      out.push({ role: m?.role === "assistant" ? "assistant" : "user", content });
    }
  }
  return {
    model: openai.model || DEFAULT_MODEL,
    max_tokens: Number.isFinite(openai.max_tokens) ? openai.max_tokens : 1400,
    temperature: typeof openai.temperature === "number" ? openai.temperature : 0.5,
    ...(system ? { system } : {}),
    messages: out.length > 0 ? out : [{ role: "user", content: "Hello" }]
  };
}

function anthropicToOpenAi(anthropicJson, model) {
  const text = Array.isArray(anthropicJson?.content)
    ? anthropicJson.content.filter((p) => p && p.type === "text").map((p) => p.text).join("")
    : "";
  return {
    id: anthropicJson?.id || `gw-${crypto.randomUUID()}`,
    object: "chat.completion",
    model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: anthropicJson?.stop_reason || "stop"
      }
    ],
    usage: anthropicJson?.usage || {}
  };
}

// ---- Upstreams ----
function callAnthropicApi(apiKey, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = https.request(
      {
        host: ANTHROPIC_HOST,
        path: ANTHROPIC_PATH,
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
          "content-length": Buffer.byteLength(data)
        }
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode || -1, body }));
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function callBedrock(payload) {
  // Bedrock uses the Anthropic Messages schema but takes anthropic_version in
  // the body and the model id in the request, not in the body.
  const body = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: payload.max_tokens,
    temperature: payload.temperature,
    ...(payload.system ? { system: payload.system } : {}),
    messages: payload.messages
  };
  const out = await bedrock.send(
    new InvokeModelCommand({
      modelId: BEDROCK_MODEL_ID,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(body)
    })
  );
  const text = Buffer.from(out.body).toString("utf8");
  return { status: 200, body: text };
}

// ---- DynamoDB shared cache ----
function cacheKeyFor(openai) {
  const raw = JSON.stringify({ u: UPSTREAM, model: openai.model, messages: openai.messages });
  return crypto.createHash("sha256").update(raw).digest("hex");
}

async function cacheGet(key) {
  if (!ddb) {
    return null;
  }
  try {
    const out = await ddb.send(new GetCommand({ TableName: CACHE_TABLE, Key: { cacheKey: key } }));
    return out.Item?.body ?? null;
  } catch (err) {
    console.warn(`[gateway] cache get failed: ${err}`);
    return null;
  }
}

async function cachePut(key, body) {
  if (!ddb) {
    return;
  }
  try {
    const ttl = Math.floor(Date.now() / 1000) + CACHE_TTL_SECONDS;
    await ddb.send(new PutCommand({ TableName: CACHE_TABLE, Item: { cacheKey: key, body, ttl } }));
  } catch (err) {
    console.warn(`[gateway] cache put failed: ${err}`);
  }
}

// ---- HTTP helpers ----
function resp(statusCode, obj, extraHeaders = {}) {
  return {
    statusCode,
    headers: { "content-type": "application/json", ...extraHeaders },
    body: typeof obj === "string" ? obj : JSON.stringify(obj)
  };
}

function bearerToken(headers) {
  const auth = headers?.authorization || headers?.Authorization || "";
  const m = `${auth}`.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

exports.handler = async (event) => {
  const method = event?.requestContext?.http?.method || "GET";
  const path = event?.rawPath || "/";
  const headers = event?.headers || {};
  const secret = await getSecret();

  if (method === "GET" && path.endsWith("/health")) {
    return resp(200, { ok: true, upstream: UPSTREAM, model: UPSTREAM === "bedrock" ? BEDROCK_MODEL_ID : DEFAULT_MODEL, cache: Boolean(ddb) });
  }

  if (method !== "POST" || !path.includes("/chat/completions")) {
    return resp(404, { error: { message: "Not found. POST to /v1/chat/completions." } });
  }

  // Auth: shared bearer token (the game's USER_API_KEY).
  const expected = `${secret.authToken ?? ""}`.trim();
  if (expected && bearerToken(headers) !== expected) {
    return resp(401, { error: { message: "Unauthorized." } });
  }

  let openai;
  try {
    openai = JSON.parse(event.body || "{}");
  } catch {
    return resp(400, { error: { message: "Invalid JSON request body." } });
  }

  const key = cacheKeyFor(openai);
  const hit = await cacheGet(key);
  if (hit) {
    return resp(200, hit, { "x-gw-cache": "hit" });
  }

  try {
    const payload = openAiToAnthropic(openai);
    const result = UPSTREAM === "bedrock"
      ? await callBedrock(payload)
      : await callAnthropicApi(`${secret.anthropicApiKey ?? ""}`, payload);

    if (result.status < 200 || result.status >= 300) {
      console.error(`[gateway] upstream error ${result.status}: ${result.body.slice(0, 200)}`);
      return resp(result.status, result.body);
    }

    let anthropicJson;
    try {
      anthropicJson = JSON.parse(result.body);
    } catch {
      return resp(502, { error: { message: "Upstream returned non-JSON." } });
    }

    const openAiResp = JSON.stringify(anthropicToOpenAi(anthropicJson, payload.model));
    await cachePut(key, openAiResp);
    return resp(200, openAiResp, { "x-gw-cache": "miss" });
  } catch (err) {
    console.error(`[gateway] request failed: ${err}`);
    return resp(502, { error: { message: `${err}` } });
  }
};
