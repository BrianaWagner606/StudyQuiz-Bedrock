// ============================================================
//  STUDY QUIZ - CLOUD DATA API (Lambda)
// ============================================================
// Backs cross-server player progress, the global leaderboard, the shared class
// assignment, and analytics event ingestion. Called by the game (cloudSync.js)
// and by the teacher dashboard.
//
// Routes (HTTP API v2):
//   GET    /profiles/{xuid}     -> read a player's profile
//   POST   /profiles/{xuid}     -> upsert a player's profile snapshot
//   GET    /leaderboard         -> top players (?limit, ?sort=mastered|correct|coins)
//   GET    /class               -> current class assignment
//   PUT    /class               -> set the class assignment (teacher)
//   POST   /events              -> append analytics events (array) to S3
//
// Auth: Authorization: Bearer <token> matching the shared secret token.
// ============================================================

const crypto = require("crypto");
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const REGION = process.env.AWS_REGION || "us-east-1";
const SECRET_ARN = process.env.SECRET_ARN || "";
const PROFILES_TABLE = process.env.PROFILES_TABLE || "";
const CONFIG_TABLE = process.env.CONFIG_TABLE || "";
const EVENTS_BUCKET = process.env.EVENTS_BUCKET || "";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
const secrets = new SecretsManagerClient({ region: REGION });
const s3 = EVENTS_BUCKET ? new S3Client({ region: REGION }) : null;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization,content-type",
  "access-control-allow-methods": "GET,POST,PUT,OPTIONS"
};

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

function resp(statusCode, obj) {
  return {
    statusCode,
    headers: { "content-type": "application/json", ...CORS },
    body: typeof obj === "string" ? obj : JSON.stringify(obj)
  };
}

function bearerToken(headers) {
  const auth = headers?.authorization || headers?.Authorization || "";
  const m = `${auth}`.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

// Clamp/sanitize a profile snapshot from the game before we store it.
function sanitizeProfile(xuid, raw) {
  const perTopic = raw && typeof raw.perTopic === "object" && raw.perTopic ? raw.perTopic : {};
  const cleanPerTopic = {};
  for (const [k, v] of Object.entries(perTopic)) {
    cleanPerTopic[`${k}`.slice(0, 64)] = num(v);
  }
  return {
    xuid: `${xuid}`.slice(0, 64),
    name: `${raw?.name ?? "player"}`.slice(0, 48),
    answered: num(raw?.answered),
    correct: num(raw?.correct),
    masteredTotal: num(raw?.masteredTotal),
    coins: num(raw?.coins),
    perTopic: cleanPerTopic,
    updatedAt: new Date().toISOString()
  };
}

async function getProfile(xuid) {
  const out = await ddb.send(new GetCommand({ TableName: PROFILES_TABLE, Key: { xuid } }));
  return out.Item ?? null;
}

async function putProfile(profile) {
  await ddb.send(new PutCommand({ TableName: PROFILES_TABLE, Item: profile }));
}

async function listProfiles(limit, sortKey) {
  // Class-sized data: a Scan is fine. For large deployments add a GSI and Query.
  const out = await ddb.send(new ScanCommand({ TableName: PROFILES_TABLE, Limit: 500 }));
  const items = out.Items ?? [];
  const key = ["masteredTotal", "correct", "coins", "answered"].includes(sortKey) ? sortKey : "masteredTotal";
  items.sort((a, b) => num(b[key]) - num(a[key]));
  return items.slice(0, limit).map((p) => ({
    name: p.name,
    answered: num(p.answered),
    correct: num(p.correct),
    accuracy: num(p.answered) > 0 ? Math.round((num(p.correct) / num(p.answered)) * 100) : 0,
    masteredTotal: num(p.masteredTotal),
    coins: num(p.coins)
  }));
}

async function getClass() {
  const out = await ddb.send(new GetCommand({ TableName: CONFIG_TABLE, Key: { id: "class" } }));
  return out.Item?.value ?? null;
}

async function putClass(value) {
  await ddb.send(new PutCommand({ TableName: CONFIG_TABLE, Item: { id: "class", value, updatedAt: new Date().toISOString() } }));
}

async function writeEvents(events) {
  if (!s3 || !Array.isArray(events) || events.length === 0) {
    return 0;
  }
  const now = new Date();
  const dt = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const key = `events/dt=${dt}/${now.getTime()}-${crypto.randomUUID()}.json`;
  // One JSON-lines object per request; Athena/Glue can read the partitioned prefix.
  const body = events.map((e) => JSON.stringify({ ...e, ingestedAt: now.toISOString() })).join("\n");
  await s3.send(new PutObjectCommand({ Bucket: EVENTS_BUCKET, Key: key, Body: body, ContentType: "application/x-ndjson" }));
  return events.length;
}

exports.handler = async (event) => {
  const method = event?.requestContext?.http?.method || "GET";
  const path = event?.rawPath || "/";

  if (method === "OPTIONS") {
    return { statusCode: 204, headers: CORS, body: "" };
  }

  const secret = await getSecret();
  const expected = `${secret.authToken ?? ""}`.trim();
  if (expected && bearerToken(event?.headers || {}) !== expected) {
    return resp(401, { error: "Unauthorized" });
  }

  let body = {};
  if (event.body) {
    try {
      body = JSON.parse(event.body);
    } catch {
      return resp(400, { error: "Invalid JSON body" });
    }
  }

  try {
    // /profiles/{xuid}
    const profileMatch = path.match(/\/profiles\/([^/]+)$/);
    if (profileMatch) {
      const xuid = decodeURIComponent(profileMatch[1]);
      if (method === "GET") {
        return resp(200, (await getProfile(xuid)) ?? {});
      }
      if (method === "POST") {
        const profile = sanitizeProfile(xuid, body);
        await putProfile(profile);
        return resp(200, profile);
      }
    }

    if (path.endsWith("/leaderboard") && method === "GET") {
      const q = event?.queryStringParameters || {};
      const limit = Math.max(1, Math.min(100, num(q.limit) || 20));
      return resp(200, { entries: await listProfiles(limit, q.sort) });
    }

    if (path.endsWith("/class")) {
      if (method === "GET") {
        return resp(200, (await getClass()) ?? { active: false });
      }
      if (method === "PUT") {
        await putClass(body);
        return resp(200, { ok: true, value: body });
      }
    }

    if (path.endsWith("/events") && method === "POST") {
      const written = await writeEvents(body?.events ?? body);
      return resp(200, { ok: true, written });
    }

    return resp(404, { error: "Not found" });
  } catch (err) {
    console.error(`[api] error: ${err}`);
    return resp(500, { error: `${err}` });
  }
};
