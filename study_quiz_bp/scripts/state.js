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

const memoryConfig = new Map();
const memoryCoins = new Map();
const memoryStreaks = new Map();
const memoryMastery = new Map();

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
}
