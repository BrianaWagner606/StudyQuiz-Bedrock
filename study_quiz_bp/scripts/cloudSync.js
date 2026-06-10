// ============================================================
//  STUDY QUIZ - CLOUD SYNC CLIENT
// ============================================================
// Thin client for the cloud data API (see cloud/). When USER_CLOUD_API_BASE is
// blank, every function is a no-op, so the add-on stays fully local/offline.
//
// Covers:
//   - player profile push      (cross-server progress + leaderboard source)
//   - class assignment pull/push (teacher dashboard <-> in-game stay in sync)
//   - analytics event batch send (Athena-queryable answer log)
// ============================================================

import {
  HttpHeader,
  HttpRequest,
  HttpRequestMethod,
  http
} from "@minecraft/server-net";
import { USER_API_KEY, USER_CLOUD_API_BASE } from "./userConfig.js";

const BASE = `${USER_CLOUD_API_BASE ?? ""}`.trim().replace(/\/+$/, "");
const TOKEN = `${USER_API_KEY ?? ""}`;

export function isCloudEnabled() {
  return BASE.length > 0;
}

function headers() {
  return [
    new HttpHeader("Content-Type", "application/json"),
    new HttpHeader("Authorization", `Bearer ${TOKEN}`)
  ];
}

function parseBody(text) {
  try {
    return JSON.parse(`${text ?? ""}`);
  } catch {
    return null;
  }
}

async function send(method, path, bodyObj) {
  if (!isCloudEnabled()) {
    return null;
  }
  try {
    const request = new HttpRequest(`${BASE}${path}`);
    request.method = method;
    request.headers = headers();
    if (bodyObj !== undefined) {
      request.body = JSON.stringify(bodyObj);
    }
    const response = await http.request(request);
    const status = response?.status ?? -1;
    if (status < 200 || status >= 300) {
      console.warn(`[StudyQuiz/cloud] ${method} ${path} -> ${status}`);
      return null;
    }
    return parseBody(response?.body);
  } catch (error) {
    console.warn(`[StudyQuiz/cloud] ${method} ${path} failed: ${error}`);
    return null;
  }
}

// ---- Player profiles ----
export async function pushProfile(xuid, snapshot) {
  return send(HttpRequestMethod.Post, `/profiles/${encodeURIComponent(xuid)}`, snapshot);
}

export async function fetchLeaderboard(sort = "masteredTotal", limit = 20) {
  const data = await send(HttpRequestMethod.Get, `/leaderboard?sort=${encodeURIComponent(sort)}&limit=${limit}`);
  return Array.isArray(data?.entries) ? data.entries : [];
}

// ---- Class assignment ----
export async function fetchClass() {
  return send(HttpRequestMethod.Get, "/class");
}

export async function pushClass(assignment) {
  return send(HttpRequestMethod.Put, "/class", assignment);
}

// ---- Analytics events ----
export async function sendEvents(events) {
  if (!Array.isArray(events) || events.length === 0) {
    return null;
  }
  return send(HttpRequestMethod.Post, "/events", { events });
}
