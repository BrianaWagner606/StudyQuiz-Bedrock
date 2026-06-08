import { DEFAULT_CONFIG } from "./constants.js";
import { safeJsonParse } from "./utils.js";
import {
  USER_API_KEY,
  USER_API_PROVIDER,
  USER_API_ENDPOINT,
  USER_API_MODEL
} from "./userConfig.js";

const FILE_API_KEY = `${USER_API_KEY ?? ""}`.replace(/\s+/g, "").trim();
const FILE_API_PROVIDER = `${USER_API_PROVIDER ?? ""}`.trim().toLowerCase();
const FILE_API_ENDPOINT = `${USER_API_ENDPOINT ?? ""}`.trim();
const FILE_API_MODEL = `${USER_API_MODEL ?? ""}`.trim();

const DP_CONFIG = "sq_config";
const DP_COINS = "sq_coins";
const DP_STREAKS = "sq_streaks";
const DP_MASTERY = "sq_mastery";
const DP_SEEN = "sq_seen";

// Cap on how many recent question texts we remember per topic, and how much of
// each we keep. These are fed back to the AI as an "avoid these" list so it
// stops regenerating the same items once a player has mastered the obvious
// ones. Bounded to keep the dynamic-property payload small.
const SEEN_TEXTS_PER_TOPIC = 60;
const SEEN_TEXT_MAX_LEN = 140;

const memoryConfig = new Map();
const memoryCoins = new Map();
const memoryStreaks = new Map();
const memoryMastery = new Map();
const memorySeen = new Map();

function playerKey(player) {
  return `${player?.id ?? player?.name ?? "unknown"}`;
}

function readPlayerProperty(player, key, fallbackValue) {
  try {
    const value = player.getDynamicProperty(key);
    return value ?? fallbackValue;
  } catch {
    return fallbackValue;
  }
}

function writePlayerProperty(player, key, value) {
  try {
    player.setDynamicProperty(key, value);
    return true;
  } catch {
    return false;
  }
}

function normalizeConfig(raw, availableTopics) {
  const cfg = raw && typeof raw === "object" ? raw : {};

  const topic =
    typeof cfg.topic === "string" && cfg.topic.trim().length > 0
      ? cfg.topic.trim()
      : availableTopics[0] ?? DEFAULT_CONFIG.topic;

  const penaltyMode = ["held", "hotbar", "inventory"].includes(cfg.penaltyMode)
    ? cfg.penaltyMode
    : DEFAULT_CONFIG.penaltyMode;

  const apiProvider = ["anthropic", "openai", "openrouter", "openai_compatible"].includes(cfg.apiProvider)
    ? cfg.apiProvider
    : (FILE_API_PROVIDER || DEFAULT_CONFIG.apiProvider);

  // A key set in userConfig.js (e.g. the local proxy) is authoritative for the whole
  // server, so every player routes through the same gateway regardless of saved settings.
  const playerApiKey = typeof cfg.apiKey === "string" ? cfg.apiKey.trim() : "";
  const fileMode = FILE_API_KEY.length > 0;
  const apiKey = FILE_API_KEY || playerApiKey || DEFAULT_CONFIG.apiKey;

  return {
    intervalMin: Number.isFinite(cfg.intervalMin) ? Math.max(1, Math.min(60, Math.round(cfg.intervalMin))) : DEFAULT_CONFIG.intervalMin,
    answerSec: Number.isFinite(cfg.answerSec) ? Math.max(5, Math.min(120, Math.round(cfg.answerSec))) : DEFAULT_CONFIG.answerSec,
    topic,
    optionCount: Number.isFinite(cfg.optionCount) ? Math.max(2, Math.min(6, Math.round(cfg.optionCount))) : DEFAULT_CONFIG.optionCount,
    penaltyMode,
    apiProvider: fileMode && FILE_API_PROVIDER ? FILE_API_PROVIDER : apiProvider,
    apiEndpoint: FILE_API_ENDPOINT || (typeof cfg.apiEndpoint === "string" ? cfg.apiEndpoint.trim() : DEFAULT_CONFIG.apiEndpoint),
    apiModel: FILE_API_MODEL || (typeof cfg.apiModel === "string" ? cfg.apiModel.trim() : DEFAULT_CONFIG.apiModel),
    apiKey
  };
}

export class PlayerStateStore {
  getConfig(player, availableTopics) {
    const key = playerKey(player);
    const raw = `${readPlayerProperty(player, DP_CONFIG, memoryConfig.get(key) ?? "") ?? ""}`;
    const parsed = safeJsonParse(raw, {});
    return normalizeConfig(parsed, availableTopics);
  }

  setConfig(player, config) {
    const key = playerKey(player);
    const raw = JSON.stringify(config);
    memoryConfig.set(key, raw);
    writePlayerProperty(player, DP_CONFIG, raw);
  }

  getCoins(player) {
    const key = playerKey(player);
    const coins = Number(readPlayerProperty(player, DP_COINS, memoryCoins.get(key) ?? 0) ?? 0);
    if (!Number.isInteger(coins) || coins < 0) {
      return 0;
    }
    return coins;
  }

  setCoins(player, coins) {
    const key = playerKey(player);
    const safe = Math.max(0, Math.round(coins));
    memoryCoins.set(key, safe);
    writePlayerProperty(player, DP_COINS, safe);
    return safe;
  }

  addCoins(player, delta) {
    const current = this.getCoins(player);
    return this.setCoins(player, current + delta);
  }

  getStreaks(player) {
    const key = playerKey(player);
    const raw = `${readPlayerProperty(player, DP_STREAKS, memoryStreaks.get(key) ?? "{}") ?? "{}"}`;
    const parsed = safeJsonParse(raw, {});
    return parsed && typeof parsed === "object" ? parsed : {};
  }

  setStreaks(player, streaks) {
    const key = playerKey(player);
    const raw = JSON.stringify(streaks);
    memoryStreaks.set(key, raw);
    writePlayerProperty(player, DP_STREAKS, raw);
  }

  getQuestionStreak(player, questionId) {
    const streaks = this.getStreaks(player);
    const value = Number(streaks[questionId] ?? 0);
    return Number.isInteger(value) && value > 0 ? value : 0;
  }

  setQuestionStreak(player, questionId, streak) {
    const streaks = this.getStreaks(player);
    if (streak <= 0) {
      delete streaks[questionId];
    } else {
      streaks[questionId] = Math.round(streak);
    }
    this.setStreaks(player, streaks);
  }

  getMasteryMap(player) {
    const key = playerKey(player);
    const raw = `${readPlayerProperty(player, DP_MASTERY, memoryMastery.get(key) ?? "{}") ?? "{}"}`;
    const parsed = safeJsonParse(raw, {});
    return parsed && typeof parsed === "object" ? parsed : {};
  }

  setMasteryMap(player, masteryMap) {
    const key = playerKey(player);
    const raw = JSON.stringify(masteryMap);
    memoryMastery.set(key, raw);
    writePlayerProperty(player, DP_MASTERY, raw);
  }

  getMasteredIds(player, topic) {
    const masteryMap = this.getMasteryMap(player);
    const list = Array.isArray(masteryMap[topic]) ? masteryMap[topic] : [];
    return new Set(list.filter((item) => typeof item === "string" && item.length > 0));
  }

  addMasteredId(player, topic, questionId) {
    const masteryMap = this.getMasteryMap(player);
    const existing = new Set(Array.isArray(masteryMap[topic]) ? masteryMap[topic] : []);
    existing.add(questionId);
    masteryMap[topic] = [...existing];
    this.setMasteryMap(player, masteryMap);
  }

  getMasteredCountByTopic(player) {
    const masteryMap = this.getMasteryMap(player);
    const result = {};
    for (const [topic, ids] of Object.entries(masteryMap)) {
      result[topic] = Array.isArray(ids) ? ids.length : 0;
    }
    return result;
  }

  getSeenMap(player) {
    const key = playerKey(player);
    const raw = `${readPlayerProperty(player, DP_SEEN, memorySeen.get(key) ?? "{}") ?? "{}"}`;
    const parsed = safeJsonParse(raw, {});
    return parsed && typeof parsed === "object" ? parsed : {};
  }

  setSeenMap(player, seenMap) {
    const key = playerKey(player);
    const raw = JSON.stringify(seenMap);
    memorySeen.set(key, raw);
    writePlayerProperty(player, DP_SEEN, raw);
  }

  getSeenTexts(player, topic) {
    const seenMap = this.getSeenMap(player);
    const list = Array.isArray(seenMap[topic]) ? seenMap[topic] : [];
    return list.filter((item) => typeof item === "string" && item.length > 0);
  }

  // Remember the text of a question the player has already been shown, keeping a
  // rolling window of the most recent ones (oldest dropped first).
  addSeenText(player, topic, text) {
    const clean = `${text ?? ""}`.trim().slice(0, SEEN_TEXT_MAX_LEN);
    if (!clean) {
      return;
    }
    const seenMap = this.getSeenMap(player);
    const existing = Array.isArray(seenMap[topic]) ? seenMap[topic] : [];
    if (existing.includes(clean)) {
      return;
    }
    const next = [...existing, clean];
    if (next.length > SEEN_TEXTS_PER_TOPIC) {
      next.splice(0, next.length - SEEN_TEXTS_PER_TOPIC);
    }
    seenMap[topic] = next;
    this.setSeenMap(player, seenMap);
  }
}
