import { world } from "@minecraft/server";
import { DEFAULT_CONFIG, DEFAULT_DIFFICULTY, DIFFICULTY_TIERS } from "./constants.js";
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
const DP_STATS = "sq_stats";
const DP_LESSONS = "sq_lessons";

// World-level (shared) dynamic property holding the teacher's class assignment:
// the lesson everyone is studying, the difficulty, and whether students may
// change it. See ClassStore below.
const WP_CLASS = "sq_class";

// Cap on how many recent question texts we remember per topic, and how much of
// each we keep. These are fed back to the AI as an "avoid these" list so it
// stops regenerating the same items once a player has mastered the obvious
// ones. Kept small and treated as SACRIFICIAL: if saving core data (mastery,
// coins, ...) ever runs out of storage budget, this is dropped first so the
// important data always persists.
const SEEN_TEXTS_PER_TOPIC = 25;
const SEEN_TEXT_MAX_LEN = 100;

const memoryConfig = new Map();
const memoryCoins = new Map();
const memoryStreaks = new Map();
const memoryMastery = new Map();
const memorySeen = new Map();
const memoryStats = new Map();
const memoryLessons = new Map();

function playerKey(player) {
  return `${player?.id ?? player?.name ?? "unknown"}`;
}

function readPlayerProperty(player, key, memoryMap, fallbackValue) {
  // Prefer the in-memory value: it reflects the most recent successful set()
  // this session even if the on-disk write later failed (e.g. storage budget),
  // so mastery/coins stay correct in-session regardless of disk state.
  const id = playerKey(player);
  if (memoryMap && memoryMap.has(id)) {
    return memoryMap.get(id);
  }
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
  } catch (error) {
    console.warn(`[StudyQuiz] Failed to persist '${key}': ${error}`);
    return false;
  }
}

// The seen-texts blob is the only optional, droppable data we store. Clearing
// it frees storage budget so a failed core write (mastery, etc.) can retry.
function freeLowPriorityStorage(player) {
  memorySeen.delete(playerKey(player));
  try {
    player.setDynamicProperty(DP_SEEN, undefined);
  } catch {
    // Best effort; nothing more we can do to reclaim space here.
  }
}

// Persist important data with memory as the in-session source of truth. If the
// disk write fails, sacrifice the seen-texts blob and retry once so mastery,
// coins, streaks and config never get starved by the avoid-list cache.
function writeCoreProperty(player, key, memoryMap, value) {
  memoryMap.set(playerKey(player), value);
  if (writePlayerProperty(player, key, value)) {
    return true;
  }
  freeLowPriorityStorage(player);
  return writePlayerProperty(player, key, value);
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

  const difficulty = DIFFICULTY_TIERS.some((tier) => tier.value === cfg.difficulty)
    ? cfg.difficulty
    : DEFAULT_DIFFICULTY;

  // Curriculum pack the player is studying (empty = plain free-text topic).
  const curriculumId = typeof cfg.curriculumId === "string" ? cfg.curriculumId.trim() : "";
  const lang = typeof cfg.lang === "string" ? cfg.lang.trim() : "";

  const apiProvider = ["anthropic", "openai", "openrouter", "openai_compatible"].includes(cfg.apiProvider)
    ? cfg.apiProvider
    : (FILE_API_PROVIDER || DEFAULT_CONFIG.apiProvider);

  // A key set in userConfig.js (e.g. the local proxy) is authoritative for the whole
  // server, so every player routes through the same gateway regardless of saved settings.
  const playerApiKey = typeof cfg.apiKey === "string" ? cfg.apiKey.trim() : "";
  const fileMode = FILE_API_KEY.length > 0;
  const apiKey = FILE_API_KEY || playerApiKey || DEFAULT_CONFIG.apiKey;

  return {
    // Stored in minutes; fractional values allowed so the interval can be set
    // below a minute (e.g. 0.25 = 15s). Floor of 0.25 keeps it above the 5s
    // auto-prompt check cadence.
    intervalMin: Number.isFinite(cfg.intervalMin) ? Math.max(0.25, Math.min(60, cfg.intervalMin)) : DEFAULT_CONFIG.intervalMin,
    answerSec: Number.isFinite(cfg.answerSec) ? Math.max(5, Math.min(120, Math.round(cfg.answerSec))) : DEFAULT_CONFIG.answerSec,
    topic,
    optionCount: Number.isFinite(cfg.optionCount) ? Math.max(2, Math.min(6, Math.round(cfg.optionCount))) : DEFAULT_CONFIG.optionCount,
    penaltyMode,
    difficulty,
    curriculumId,
    lang,
    apiProvider: fileMode && FILE_API_PROVIDER ? FILE_API_PROVIDER : apiProvider,
    apiEndpoint: FILE_API_ENDPOINT || (typeof cfg.apiEndpoint === "string" ? cfg.apiEndpoint.trim() : DEFAULT_CONFIG.apiEndpoint),
    apiModel: FILE_API_MODEL || (typeof cfg.apiModel === "string" ? cfg.apiModel.trim() : DEFAULT_CONFIG.apiModel),
    apiKey
  };
}

export class PlayerStateStore {
  getConfig(player, availableTopics) {
    const raw = `${readPlayerProperty(player, DP_CONFIG, memoryConfig, "") ?? ""}`;
    const parsed = safeJsonParse(raw, {});
    return normalizeConfig(parsed, availableTopics);
  }

  setConfig(player, config) {
    writeCoreProperty(player, DP_CONFIG, memoryConfig, JSON.stringify(config));
  }

  getCoins(player) {
    const coins = Number(readPlayerProperty(player, DP_COINS, memoryCoins, 0) ?? 0);
    if (!Number.isInteger(coins) || coins < 0) {
      return 0;
    }
    return coins;
  }

  setCoins(player, coins) {
    const safe = Math.max(0, Math.round(coins));
    writeCoreProperty(player, DP_COINS, memoryCoins, safe);
    return safe;
  }

  addCoins(player, delta) {
    const current = this.getCoins(player);
    return this.setCoins(player, current + delta);
  }

  getStreaks(player) {
    const raw = `${readPlayerProperty(player, DP_STREAKS, memoryStreaks, "{}") ?? "{}"}`;
    const parsed = safeJsonParse(raw, {});
    return parsed && typeof parsed === "object" ? parsed : {};
  }

  setStreaks(player, streaks) {
    writeCoreProperty(player, DP_STREAKS, memoryStreaks, JSON.stringify(streaks));
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
    const raw = `${readPlayerProperty(player, DP_MASTERY, memoryMastery, "{}") ?? "{}"}`;
    const parsed = safeJsonParse(raw, {});
    return parsed && typeof parsed === "object" ? parsed : {};
  }

  setMasteryMap(player, masteryMap) {
    writeCoreProperty(player, DP_MASTERY, memoryMastery, JSON.stringify(masteryMap));
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
    const raw = `${readPlayerProperty(player, DP_SEEN, memorySeen, "{}") ?? "{}"}`;
    const parsed = safeJsonParse(raw, {});
    return parsed && typeof parsed === "object" ? parsed : {};
  }

  setSeenMap(player, seenMap) {
    // Low-priority/sacrificial: keep it in memory and make a best-effort disk
    // write. If the budget is full the write simply fails and that is fine;
    // core data writes take precedence via writeCoreProperty.
    const raw = JSON.stringify(seenMap);
    memorySeen.set(playerKey(player), raw);
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

  // ---- Lifetime answer stats (powers accuracy in My Stats + the roster) ----
  getStats(player) {
    const raw = `${readPlayerProperty(player, DP_STATS, memoryStats, "{}") ?? "{}"}`;
    const parsed = safeJsonParse(raw, {});
    const answered = Number(parsed?.answered ?? 0);
    const correct = Number(parsed?.correct ?? 0);
    return {
      answered: Number.isInteger(answered) && answered > 0 ? answered : 0,
      correct: Number.isInteger(correct) && correct > 0 ? correct : 0
    };
  }

  recordAnswer(player, wasCorrect) {
    const stats = this.getStats(player);
    stats.answered += 1;
    if (wasCorrect) {
      stats.correct += 1;
    }
    writeCoreProperty(player, DP_STATS, memoryStats, JSON.stringify(stats));
    return stats;
  }

  // ---- Completed lessons (in-game lesson mode) ----
  getCompletedLessons(player) {
    const raw = `${readPlayerProperty(player, DP_LESSONS, memoryLessons, "[]") ?? "[]"}`;
    const parsed = safeJsonParse(raw, []);
    const list = Array.isArray(parsed) ? parsed : [];
    return new Set(list.filter((item) => typeof item === "string" && item.length > 0));
  }

  addCompletedLesson(player, key) {
    const done = this.getCompletedLessons(player);
    done.add(`${key}`);
    writeCoreProperty(player, DP_LESSONS, memoryLessons, JSON.stringify([...done]));
  }

  getLessonCount(player) {
    return this.getCompletedLessons(player).size;
  }

  getTotalMastered(player) {
    const masteryMap = this.getMasteryMap(player);
    let total = 0;
    for (const ids of Object.values(masteryMap)) {
      total += Array.isArray(ids) ? ids.length : 0;
    }
    return total;
  }

  // Wipe a student's progress (mastery, streaks, seen, stats). Coins are real
  // inventory items, so they are intentionally left alone here.
  resetPlayer(player) {
    const id = playerKey(player);
    memoryStreaks.set(id, "{}");
    memoryMastery.set(id, "{}");
    memoryStats.set(id, "{}");
    memoryLessons.set(id, "[]");
    memorySeen.delete(id);
    writePlayerProperty(player, DP_STREAKS, "{}");
    writePlayerProperty(player, DP_MASTERY, "{}");
    writePlayerProperty(player, DP_STATS, "{}");
    writePlayerProperty(player, DP_LESSONS, "[]");
    try {
      player.setDynamicProperty(DP_SEEN, undefined);
    } catch {
      // best effort
    }
  }
}

// Shared, world-level class assignment set by a teacher. When `active` is true
// every player studies the assigned lesson; when `locked` is also true they
// cannot change the topic/difficulty themselves.
export class ClassStore {
  get() {
    let raw = "";
    try {
      raw = `${world.getDynamicProperty(WP_CLASS) ?? ""}`;
    } catch {
      raw = "";
    }
    const parsed = safeJsonParse(raw, null);
    if (!parsed || typeof parsed !== "object" || !parsed.active) {
      return null;
    }
    return {
      active: true,
      locked: Boolean(parsed.locked),
      topicKey: `${parsed.topicKey ?? ""}`.trim(),
      subject: `${parsed.subject ?? ""}`.trim(),
      curriculumId: `${parsed.curriculumId ?? ""}`.trim(),
      lang: `${parsed.lang ?? ""}`.trim(),
      difficulty: DIFFICULTY_TIERS.some((tier) => tier.value === parsed.difficulty)
        ? parsed.difficulty
        : DEFAULT_DIFFICULTY
    };
  }

  set(assignment) {
    try {
      world.setDynamicProperty(WP_CLASS, JSON.stringify({ active: true, ...assignment }));
      return true;
    } catch (error) {
      console.warn(`[StudyQuiz] Could not save class assignment: ${error}`);
      return false;
    }
  }

  clear() {
    try {
      world.setDynamicProperty(WP_CLASS, undefined);
    } catch {
      // best effort
    }
  }
}
