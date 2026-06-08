// ============================================================
//  STUDY QUIZ - LOCAL AI GATEWAY (proxy)
// ============================================================
// Holds your API key OUTSIDE the game. The Minecraft add-on talks to this
// proxy using the OpenAI-compatible /v1/chat/completions format, and the
// proxy translates to your real provider (Anthropic by default), adds your
// key, caches repeat questions, and returns an OpenAI-shaped response.
//
// HOW TO RUN:
//   1. Put your real API key in:  proxy/anthropic-key.txt   (one line)
//   2. Open a terminal in this folder and run:   node server.js
//   3. Leave it running while you play. Start it before the Minecraft server.
//
// No dependencies required. Uses only Node's built-in modules.
// ============================================================

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const HOST = process.env.PROXY_HOST || "127.0.0.1";
const PORT = Number(process.env.PROXY_PORT || 8787);

const ANTHROPIC_HOST = "api.anthropic.com";
const ANTHROPIC_PATH = "/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

const CACHE_TTL_MS = 1000 * 60 * 60; // cache identical requests for 1 hour
const cache = new Map();

function loadKey() {
  if (process.env.ANTHROPIC_API_KEY) {
    return `${process.env.ANTHROPIC_API_KEY}`.trim();
  }
  const keyFile = path.join(__dirname, "anthropic-key.txt");
  try {
    if (fs.existsSync(keyFile)) {
      return fs.readFileSync(keyFile, "utf8").replace(/\s+/g, "").trim();
    }
  } catch {
    /* ignore */
  }
  return "";
}

function callAnthropic(apiKey, payload) {
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
    ? anthropicJson.content
        .filter((p) => p && p.type === "text")
        .map((p) => p.text)
        .join("")
    : "";
  return {
    id: anthropicJson?.id || `proxy-${Date.now()}`,
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

function sendJson(res, status, obj, extraHeaders = {}) {
  const body = typeof obj === "string" ? obj : JSON.stringify(obj);
  res.writeHead(status, { "content-type": "application/json", ...extraHeaders });
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    sendJson(res, 200, { ok: true, keyLoaded: loadKey().length > 0, model: DEFAULT_MODEL });
    return;
  }

  if (req.method !== "POST" || !`${req.url}`.includes("/chat/completions")) {
    sendJson(res, 404, { error: { message: "Not found. POST to /v1/chat/completions." } });
    return;
  }

  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", async () => {
    const apiKey = loadKey();
    if (!apiKey) {
      console.error("[Proxy] No API key. Put your key in proxy/anthropic-key.txt");
      sendJson(res, 500, {
        error: { message: "Proxy has no API key. Put your key in proxy/anthropic-key.txt and restart." }
      });
      return;
    }

    let openai;
    try {
      openai = JSON.parse(raw || "{}");
    } catch {
      sendJson(res, 400, { error: { message: "Invalid JSON request body." } });
      return;
    }

    const cacheKey = JSON.stringify({ model: openai.model, messages: openai.messages });
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.time < CACHE_TTL_MS) {
      console.log(`[Proxy] cache HIT (${openai.model || DEFAULT_MODEL})`);
      sendJson(res, 200, hit.body, { "x-proxy-cache": "hit" });
      return;
    }

    try {
      const payload = openAiToAnthropic(openai);
      const result = await callAnthropic(apiKey, payload);
      if (result.status < 200 || result.status >= 300) {
        console.error(`[Proxy] Anthropic error ${result.status}: ${result.body.slice(0, 200)}`);
        sendJson(res, result.status, result.body);
        return;
      }

      let anthropicJson;
      try {
        anthropicJson = JSON.parse(result.body);
      } catch {
        sendJson(res, 502, { error: { message: "Upstream returned non-JSON." } });
        return;
      }

      const openAiResp = JSON.stringify(anthropicToOpenAi(anthropicJson, payload.model));
      cache.set(cacheKey, { time: Date.now(), body: openAiResp });
      console.log(`[Proxy] OK (${payload.model})`);
      sendJson(res, 200, openAiResp, { "x-proxy-cache": "miss" });
    } catch (err) {
      console.error(`[Proxy] Request failed: ${err}`);
      sendJson(res, 502, { error: { message: `${err}` } });
    }
  });
});

server.listen(PORT, HOST, () => {
  const keyOk = loadKey().length > 0;
  console.log("============================================================");
  console.log(` Study Quiz local AI gateway running`);
  console.log(`   URL:   http://${HOST}:${PORT}/v1/chat/completions`);
  console.log(`   Model: ${DEFAULT_MODEL}`);
  console.log(`   Key:   ${keyOk ? "loaded from anthropic-key.txt / env" : "MISSING -> add proxy/anthropic-key.txt"}`);
  console.log("   Keep this window open while you play. Ctrl+C to stop.");
  console.log("============================================================");
});
