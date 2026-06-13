import {
  ItemStack,
  system,
  world
} from "@minecraft/server";
import {
  ActionFormData,
  MessageFormData,
  ModalFormData
} from "@minecraft/server-ui";
import {
  ADMIN_TAG,
  COMMAND_OPEN_MENU,
  DEFAULT_CONFIG,
  DEFAULT_DIFFICULTY,
  DIFFICULTY_TIERS,
  ENABLE_WRONG_ANSWER_PENALTY,
  FALLBACK_TOPIC,
  MASTERY_STREAK_REQUIRED,
  PENALTY_MODES,
  REFRESH_BATCH_SIZE,
  STORE_ITEMS,
  STORE_CATEGORIES,
  STORE_SCOREBOARD_OBJECTIVE,
  THEME
} from "./constants.js";
import { ClassStore, PlayerStateStore } from "./state.js";
import { ApiProvider } from "./providers/ApiProvider.js";
import { BundledProvider } from "./providers/BundledProvider.js";
import { getBundledTopicNames } from "./questions/bundledTopics.js";
import {
  getArea,
  getCurriculumSubject,
  getCurriculumTopicKey,
  listAreas,
  pickFocus
} from "./questions/curriculum.js";
import {
  fetchClass as cloudFetchClass,
  isCloudEnabled,
  pushClass as cloudPushClass,
  pushProfile as cloudPushProfile,
  sendEvents as cloudSendEvents
} from "./cloudSync.js";
import { nowMs, shuffleInPlace, wrapButtonLabel } from "./utils.js";

const bundledProvider = new BundledProvider();
const apiProvider = new ApiProvider(bundledProvider);
const state = new PlayerStateStore();
const classStore = new ClassStore();

const topicPoolByPlayer = new Map();
const askedSessionIdsByPlayer = new Map();
const pendingPromptByPlayer = new Map();
const lastPromptMsByPlayer = new Map();
const liveUnavailableNotifiedByPlayer = new Set();
const lastFetchIssueByPlayerAndTopic = new Map();
const lastMenuOpenMsByPlayer = new Map();

// Cloud sync buffers (only used when USER_CLOUD_API_BASE is set). Profiles are
// pushed when a player's progress changes; answer events are batched.
const cloudDirtyPlayers = new Set();
const cloudEventQueue = [];
let coinObjective = null;
// Whether the in-chat "!study" command actually hooked. On some BDS runtimes the
// chat event isn't available, so we tell players to use the book instead.
let chatCommandAvailable = false;

const SETTINGS_ITEM_ID = "minecraft:book";
const SETTINGS_ITEM_NAME = "Study Settings";
const COIN_ITEM_ID = "studyquiz:coin";

function isPlayerUsable(player) {
  if (!player) {
    return false;
  }
  if (typeof player.isValid === "function") {
    return player.isValid();
  }
  if (typeof player.isValid === "boolean") {
    return player.isValid;
  }
  return true;
}

function getPlayerKey(player) {
  return `${player.id}`;
}

function getFetchIssueKey(player, topic) {
  return `${getPlayerKey(player)}::${topic}`;
}

function getTopicPool(player, topic) {
  const key = getPlayerKey(player);
  if (!topicPoolByPlayer.has(key)) {
    topicPoolByPlayer.set(key, {});
  }
  const pools = topicPoolByPlayer.get(key);
  if (!pools[topic]) {
    pools[topic] = [];
  }
  return pools[topic];
}

function getAskedSet(player) {
  const key = getPlayerKey(player);
  if (!askedSessionIdsByPlayer.has(key)) {
    askedSessionIdsByPlayer.set(key, new Set());
  }
  return askedSessionIdsByPlayer.get(key);
}

function getAvailableTopics() {
  try {
    apiProvider.readLiveConfig();
  } catch {
    // Ignore; provider handles missing config.
  }

  const bundled = getBundledTopicNames();
  const live = apiProvider.getEnabledTopics();
  const all = [...new Set([...bundled, ...live])];
  return all.length > 0 ? all : [FALLBACK_TOPIC];
}

function updatePlayerConfig(player, mutator) {
  const current = state.getConfig(player, getAvailableTopics());
  const next = mutator({ ...current }) ?? current;
  state.setConfig(player, next);
  return next;
}

function hasPlayerLiveConfig(config) {
  return Boolean(config?.apiKey);
}

function isAdmin(player) {
  try {
    return player.hasTag(ADMIN_TAG);
  } catch {
    return false;
  }
}

function difficultyLabel(value) {
  return DIFFICULTY_TIERS.find((tier) => tier.value === value)?.label ?? value;
}

// The config a quiz actually runs with: the player's saved preferences, with a
// teacher's class assignment layered on top when one is active. Extra `class*`
// fields are NON-persisted hints for the UI/fetch path; never feed this object
// back into state.setConfig (that would bake the override into player prefs).
function getEffectiveConfig(player) {
  const cfg = state.getConfig(player, getAvailableTopics());
  const cls = classStore.get();
  if (cls && cls.active) {
    cfg.topic = cls.topicKey || cfg.topic;
    cfg.curriculumId = cls.curriculumId || "";
    cfg.lang = cls.lang || cfg.lang;
    cfg.difficulty = cls.difficulty || cfg.difficulty;
    cfg.classActive = true;
    cfg.classLocked = cls.locked;
    cfg.classSubject = cls.subject;
  }
  return cfg;
}

// Turn a stored topic key (which may be a curriculum id like "cloud" or a
// per-language key like "lang_python") into a friendly display label.
function labelForTopicKey(key) {
  const direct = getArea(key);
  if (direct) {
    return direct.name;
  }
  if (`${key}`.startsWith("lang_")) {
    const langArea = listAreas().find((area) => Array.isArray(area.langs));
    const match = langArea?.langs.find((lang) => getCurriculumTopicKey(langArea, lang) === key);
    if (match) {
      return match;
    }
  }
  return key;
}

// Human-readable subject + a label for menus, derived from a (possibly
// curriculum-backed) config.
function describeConfigSubject(config) {
  if (config.curriculumId) {
    const area = getArea(config.curriculumId);
    if (area) {
      return getCurriculumSubject(area, config.lang);
    }
  }
  return config.classSubject || config.topic;
}

// Build the AI hint bundle (subject + difficulty + rotating focus) for a fetch.
function resolveQuizMeta(config) {
  const difficulty = config.difficulty || DEFAULT_DIFFICULTY;
  if (config.curriculumId) {
    const area = getArea(config.curriculumId);
    if (area) {
      return {
        subject: getCurriculumSubject(area, config.lang),
        difficulty,
        focus: pickFocus(area)
      };
    }
  }
  return { subject: config.topic, difficulty, focus: "" };
}

// ---- Cloud sync (no-ops unless USER_CLOUD_API_BASE is set) ----
function buildProfileSnapshot(player) {
  const stats = state.getStats(player);
  return {
    name: player.name,
    answered: stats.answered,
    correct: stats.correct,
    masteredTotal: state.getTotalMastered(player),
    coins: getCoinCount(player),
    perTopic: state.getMasteredCountByTopic(player)
  };
}

// Mark a player's profile dirty and log an answer event for the next flush.
function recordCloudAnswer(player, config, correct) {
  if (!isCloudEnabled()) {
    return;
  }
  cloudDirtyPlayers.add(player.id);
  if (cloudEventQueue.length < 200) {
    cloudEventQueue.push({
      type: "answer",
      xuid: player.id,
      name: player.name,
      topic: config.topic,
      difficulty: config.difficulty,
      curriculumId: config.curriculumId || "",
      correct: Boolean(correct),
      ts: nowMs()
    });
  }
}

// ---- UI theme helpers (girly, pink, cute, but clean & readable) ----
function uiTitle(text) {
  return `${THEME.bold}${THEME.pink}${THEME.flower} ${text} ${THEME.flower}`;
}

function uiHeart(text) {
  return `${THEME.pink}${THEME.heart} ${THEME.white}${text}`;
}

function uiDivider() {
  return `${THEME.purple}- - - - - - - - - - - - -`;
}

function delayTicks(ticks) {
  return new Promise((resolve) => system.runTimeout(resolve, ticks));
}

// Cute 3-2-1 countdown shown on screen before a quiz question appears.
async function countdownBeforeQuiz(player) {
  for (let n = 3; n >= 1; n -= 1) {
    if (!isPlayerUsable(player)) {
      return;
    }
    try {
      player.onScreenDisplay.setTitle(`${THEME.pink}${THEME.heart} ${n} ${THEME.heart}`, {
        fadeInDuration: 0,
        stayDuration: 18,
        fadeOutDuration: 2,
        subtitle: `${THEME.white}Get ready!`
      });
    } catch {
      /* onScreenDisplay may be unavailable on some runtimes */
    }
    try {
      player.playSound("random.orb");
    } catch {
      /* ignore */
    }
    await delayTicks(20);
  }
}

function getLiveStatusLine(config) {
  // AI is server-managed via the local proxy. When it is off/unreachable the
  // game automatically uses the built-in questions, so we never tell players to
  // set their own key.
  return hasPlayerLiveConfig(config)
    ? `${THEME.pink}${THEME.sparkle} ${THEME.green}AI questions: on ${THEME.gray}(server proxy)`
    : `${THEME.pink}${THEME.sparkle} ${THEME.gray}AI questions: off ${THEME.gray}(using built-in questions)`;
}

function sendPlayerMessage(player, message) {
  player.sendMessage(`${THEME.pink}${THEME.heart} ${THEME.white}${message}`);
}

function ensureCoinObjective() {
  if (coinObjective) {
    return coinObjective;
  }

  coinObjective = world.scoreboard.getObjective(STORE_SCOREBOARD_OBJECTIVE);
  if (!coinObjective) {
    coinObjective = world.scoreboard.addObjective(STORE_SCOREBOARD_OBJECTIVE, "Study Coins");
  }
  return coinObjective;
}

function syncCoinScoreboard(player) {
  try {
    const objective = ensureCoinObjective();
    const coins = getCoinCount(player);
    if (player.scoreboardIdentity) {
      objective.setScore(player.scoreboardIdentity, coins);
    } else {
      objective.setScore(player, coins);
    }
  } catch (error) {
    console.warn(`[StudyQuiz] Could not sync scoreboard for ${player.name}: ${error}`);
  }
}

// Physical coin economy: coins are real inventory items (studyquiz:coin)
// so they show up as the cute pink coin and can be dropped on a wrong answer.
function getCoinCount(player) {
  try {
    const container = player.getComponent("minecraft:inventory")?.container;
    if (!container) {
      return 0;
    }
    let total = 0;
    for (let i = 0; i < container.size; i += 1) {
      const item = container.getItem(i);
      if (item && item.typeId === COIN_ITEM_ID) {
        total += item.amount;
      }
    }
    return total;
  } catch (error) {
    console.warn(`[StudyQuiz] Could not count coins for ${player.name}: ${error}`);
    return 0;
  }
}

function giveCoins(player, amount) {
  if (amount <= 0) {
    return;
  }
  try {
    const container = player.getComponent("minecraft:inventory")?.container;
    const stack = new ItemStack(COIN_ITEM_ID, amount);
    const leftover = container?.addItem(stack);
    if (leftover) {
      player.dimension.spawnItem(leftover, player.location);
    }
  } catch (error) {
    console.warn(`[StudyQuiz] Could not give coins to ${player.name}: ${error}`);
    try {
      player.runCommandAsync(`give @s ${COIN_ITEM_ID} ${amount}`);
    } catch {
      // ignore
    }
  }
  syncCoinScoreboard(player);
}

function takeCoins(player, amount) {
  if (amount <= 0) {
    return true;
  }
  try {
    const container = player.getComponent("minecraft:inventory")?.container;
    if (!container) {
      return false;
    }
    if (getCoinCount(player) < amount) {
      return false;
    }
    let remaining = amount;
    for (let i = 0; i < container.size && remaining > 0; i += 1) {
      const item = container.getItem(i);
      if (!item || item.typeId !== COIN_ITEM_ID) {
        continue;
      }
      if (item.amount <= remaining) {
        remaining -= item.amount;
        container.setItem(i, undefined);
      } else {
        item.amount -= remaining;
        container.setItem(i, item);
        remaining = 0;
      }
    }
    syncCoinScoreboard(player);
    return remaining === 0;
  } catch (error) {
    console.warn(`[StudyQuiz] Could not take coins from ${player.name}: ${error}`);
    return false;
  }
}

function ensureSettingsItem(player) {
  const container = player.getComponent("minecraft:inventory")?.container;
  if (!container) {
    return;
  }

  for (let i = 0; i < container.size; i += 1) {
    const item = container.getItem(i);
    if (item && item.typeId === SETTINGS_ITEM_ID && `${item.nameTag ?? ""}` === SETTINGS_ITEM_NAME) {
      return;
    }
  }

  try {
    const settingsItem = new ItemStack(SETTINGS_ITEM_ID, 1);
    settingsItem.nameTag = SETTINGS_ITEM_NAME;
    const leftover = container.addItem(settingsItem);
    if (leftover) {
      player.dimension.spawnItem(leftover, player.location);
    }
  } catch (error) {
    console.warn(`[StudyQuiz] Could not grant settings item to ${player.name}: ${error}`);
  }
}

async function openSettingsMenu(player) {
  const cfg = state.getConfig(player, getAvailableTopics());
  const cls = classStore.get();
  // When a teacher has locked the lesson, students cannot change the topic or
  // difficulty; those controls are hidden and the rest stay editable.
  const lessonLocked = Boolean(cls && cls.active && cls.locked);

  // Interval values are in minutes; sub-minute options use fractions.
  const intervalChoices = [0.25, 0.5, 0.75, 1, 3, 5, 10, 15, 20, 30, 45, 60];
  const intervalLabels = ["15 sec", "30 sec", "45 sec", "1 min", "3 min", "5 min", "10 min", "15 min", "20 min", "30 min", "45 min", "60 min"];
  const answerChoices = [5, 10, 15, 20, 25, 30, 45, 60, 90, 120];
  const optionChoices = [2, 3, 4, 5, 6];

  // Pre-select the player's currently saved values so opening Settings shows the
  // real configuration. Without these defaults a dropdown always shows its first
  // option, and pressing Save would silently reset everything to that first option.
  const intervalIndex = Math.max(0, intervalChoices.indexOf(cfg.intervalMin));
  const answerIndex = Math.max(0, answerChoices.indexOf(cfg.answerSec));
  const optionIndex = Math.max(0, optionChoices.indexOf(cfg.optionCount));
  const penaltyIndex = Math.max(0, PENALTY_MODES.findIndex((mode) => mode.value === cfg.penaltyMode));
  const difficultyIndex = Math.max(0, DIFFICULTY_TIERS.findIndex((tier) => tier.value === cfg.difficulty));

  // If a curriculum pack is selected, the topic field is shown blank and the
  // pack is named in a label - players switch packs from the Curriculum menu.
  const studyingPack = cfg.curriculumId ? getArea(cfg.curriculumId) : null;
  const topicFieldDefault = studyingPack ? "" : (cfg.topic ?? FALLBACK_TOPIC);

  // Track which form field index maps to which setting, since topic/difficulty
  // are omitted when the lesson is locked.
  const fieldOrder = [];
  const form = new ModalFormData().title(uiTitle("Settings"));

  form.dropdown(`${THEME.white}${THEME.flower} Quiz interval`, intervalLabels, { defaultValueIndex: intervalIndex });
  fieldOrder.push("interval");
  form.dropdown(`${THEME.white}${THEME.flower} Answer time limit (seconds)`, answerChoices.map((v) => `${v}`), { defaultValueIndex: answerIndex });
  fieldOrder.push("answer");

  if (lessonLocked) {
    form.label(`${THEME.purple}${THEME.star} Lesson set by teacher: ${THEME.white}${cls.subject || cls.topicKey} ${THEME.gray}(${difficultyLabel(cls.difficulty)})`);
  } else {
    if (studyingPack) {
      form.label(`${THEME.purple}${THEME.star} Studying pack: ${THEME.white}${getCurriculumSubject(studyingPack, cfg.lang)}\n${THEME.gray}Type a topic below to switch to free study, or pick another pack in Curriculum.`);
    }
    form.textField(`${THEME.white}${THEME.flower} Topic (type anything)`, topicFieldDefault);
    fieldOrder.push("topic");
    form.dropdown(`${THEME.white}${THEME.flower} Difficulty`, DIFFICULTY_TIERS.map((tier) => tier.label), { defaultValueIndex: difficultyIndex });
    fieldOrder.push("difficulty");
  }

  form.dropdown(`${THEME.white}${THEME.flower} Options per question`, optionChoices.map((v) => `${v}`), { defaultValueIndex: optionIndex });
  fieldOrder.push("options");
  form.dropdown(`${THEME.white}${THEME.flower} Penalty mode`, PENALTY_MODES.map((mode) => mode.label), { defaultValueIndex: penaltyIndex });
  fieldOrder.push("penalty");
  form.label(getLiveStatusLine(cfg));

  const result = await form.show(player);
  if (result.canceled) {
    return;
  }

  const values = result.formValues;
  if (!values) {
    return;
  }

  const valueOf = (name) => {
    const idx = fieldOrder.indexOf(name);
    return idx === -1 ? undefined : values[idx];
  };

  const topicInput = `${valueOf("topic") ?? ""}`.trim();

  updatePlayerConfig(player, (prev) => {
    const next = {
      ...prev,
      intervalMin: intervalChoices[Math.round(valueOf("interval"))] ?? cfg.intervalMin,
      answerSec: answerChoices[Math.round(valueOf("answer"))] ?? cfg.answerSec,
      optionCount: optionChoices[Math.round(valueOf("options"))] ?? cfg.optionCount,
      penaltyMode: PENALTY_MODES[Math.round(valueOf("penalty"))]?.value ?? cfg.penaltyMode
    };
    if (!lessonLocked) {
      const difficultyValue = DIFFICULTY_TIERS[Math.round(valueOf("difficulty"))]?.value;
      if (difficultyValue) {
        next.difficulty = difficultyValue;
      }
      // A non-empty topic field means "switch to this free topic" and leaves any
      // curriculum pack behind; an empty field keeps the current pack/topic.
      if (topicInput.length > 0) {
        next.topic = topicInput;
        next.curriculumId = "";
        next.lang = "";
      }
    }
    return next;
  });

  sendPlayerMessage(player, "Settings saved.");
}

async function openStatsMenu(player) {
  const coins = getCoinCount(player);
  const stats = state.getStats(player);
  const accuracy = stats.answered > 0 ? Math.round((stats.correct / stats.answered) * 100) : 0;
  const masteredByTopic = state.getMasteredCountByTopic(player);
  const lines = Object.keys(masteredByTopic).length
    ? Object.entries(masteredByTopic).map(([topic, count]) => `${THEME.pink}${THEME.flower} ${THEME.white}${labelForTopicKey(topic)}: ${THEME.purple}${count}`)
    : [`${THEME.gray}none yet - go take a quiz!`];

  const form = new MessageFormData()
    .title(uiTitle("My Stats"))
    .body([
      `${THEME.gold}${THEME.heart} Study coins: ${THEME.white}${coins}`,
      `${THEME.green}${THEME.sparkle} Answered: ${THEME.white}${stats.answered} ${THEME.gray}· Correct: ${THEME.white}${stats.correct} ${THEME.gray}· Accuracy: ${THEME.white}${stats.answered > 0 ? accuracy + "%" : "-"}`,
      uiDivider(),
      `${THEME.purple}${THEME.star} Mastered by topic:`,
      ...lines
    ].join("\n"))
    .button1(`${THEME.white}${THEME.heart} Back`)
    .button2(`${THEME.gray}Close`);

  const result = await form.show(player);
  if (!result.canceled && result.selection === 0) {
    await openMainMenu(player);
  }
}

// ---- Curriculum packs: browse structured tech tracks and start a drill ----
async function openCurriculumMenu(player) {
  const areas = listAreas();
  const form = new ActionFormData()
    .title(uiTitle("Curriculum"))
    .body(`${THEME.white}Pick a study pack. Questions are generated to match the pack and your chosen difficulty.\n${uiDivider()}`);

  for (const area of areas) {
    form.button(`${THEME.white}${area.name}\n${THEME.gray}${area.eyebrow}`);
  }
  form.button(`${THEME.white}${THEME.heart} Back`, "textures/ui/arrow_left");

  const result = await form.show(player);
  if (result.canceled) {
    return;
  }
  if (result.selection === areas.length) {
    await openMainMenu(player);
    return;
  }
  const area = areas[result.selection];
  if (area) {
    await openCurriculumArea(player, area.id);
  }
}

async function openCurriculumArea(player, areaId) {
  const area = getArea(areaId);
  if (!area) {
    await openCurriculumMenu(player);
    return;
  }

  const moduleLines = area.modules.map((m) => `${THEME.pink}${THEME.flower} ${THEME.white}${m.t}`);
  const certLines = area.certs.map((c) => `${THEME.gray}• ${c}`);

  const form = new ActionFormData()
    .title(uiTitle(area.name))
    .body([
      `${THEME.white}${area.desc}`,
      uiDivider(),
      `${THEME.purple}${THEME.star} Modules:`,
      ...moduleLines,
      uiDivider(),
      `${THEME.gold}${THEME.heart} Targets / proof:`,
      ...certLines
    ].join("\n"))
    .button(`${THEME.white}${THEME.sparkle} Start drill`, "textures/items/book_enchanted")
    .button(`${THEME.white}${THEME.heart} Back`, "textures/ui/arrow_left");

  const result = await form.show(player);
  if (result.canceled) {
    return;
  }
  if (result.selection === 0) {
    await startCurriculum(player, area);
    return;
  }
  await openCurriculumMenu(player);
}

async function startCurriculum(player, area) {
  const cfg = state.getConfig(player, getAvailableTopics());
  const difficultyIndex = Math.max(0, DIFFICULTY_TIERS.findIndex((tier) => tier.value === cfg.difficulty));

  const hasLangs = Array.isArray(area.langs) && area.langs.length > 0;
  const langDefaultIndex = hasLangs ? Math.max(0, area.langs.indexOf(cfg.lang)) : 0;

  const form = new ModalFormData().title(uiTitle(area.name));
  if (hasLangs) {
    form.dropdown(`${THEME.white}${THEME.flower} Language`, area.langs, { defaultValueIndex: langDefaultIndex });
  }
  form.dropdown(`${THEME.white}${THEME.flower} Difficulty`, DIFFICULTY_TIERS.map((tier) => tier.label), { defaultValueIndex: difficultyIndex });

  const result = await form.show(player);
  if (result.canceled) {
    await openCurriculumArea(player, area.id);
    return;
  }

  const values = result.formValues ?? [];
  const chosenLang = hasLangs ? (area.langs[Math.round(values[0])] ?? area.langs[0]) : "";
  const difficultyValue = DIFFICULTY_TIERS[Math.round(values[hasLangs ? 1 : 0])]?.value ?? cfg.difficulty;
  const topicKey = getCurriculumTopicKey(area, chosenLang);

  updatePlayerConfig(player, (prev) => ({
    ...prev,
    topic: topicKey,
    curriculumId: area.id,
    lang: chosenLang,
    difficulty: difficultyValue
  }));

  sendPlayerMessage(player, `${THEME.green}Now studying ${THEME.pink}${getCurriculumSubject(area, chosenLang)} ${THEME.gray}(${difficultyLabel(difficultyValue)}). Here comes your first question!`);
  await askQuestion(player, "manual");
}

// ============================================================
//  TEACHER / ADMIN TOOLS (gated by the sq_admin tag)
// ============================================================
async function openAdminMenu(player) {
  if (!isAdmin(player)) {
    sendPlayerMessage(player, `${THEME.red}Teacher tools are restricted.`);
    return;
  }

  const cls = classStore.get();
  const assignmentLine = cls && cls.active
    ? `${THEME.green}Active lesson: ${THEME.white}${cls.subject || cls.topicKey} ${THEME.gray}(${difficultyLabel(cls.difficulty)}${cls.locked ? ", locked" : ""})`
    : `${THEME.gray}No class lesson assigned. Students study their own picks.`;

  const form = new ActionFormData()
    .title(uiTitle("Teacher"))
    .body(`${assignmentLine}\n${uiDivider()}`)
    .button(`${THEME.white}${THEME.flower} Assign lesson to class`, "textures/items/book_writable")
    .button(`${THEME.white}${THEME.star} Class roster`, "textures/items/book_written")
    .button(`${THEME.white}${THEME.heart} Reset a student`, "textures/ui/refresh")
    .button(`${THEME.white}${THEME.sparkle} Clear class lesson`, "textures/ui/cancel")
    .button(`${THEME.white}${THEME.heart} Back`, "textures/ui/arrow_left");

  const result = await form.show(player);
  if (result.canceled) {
    return;
  }
  if (result.selection === 0) {
    await openAdminAssign(player);
  } else if (result.selection === 1) {
    await openAdminRoster(player);
  } else if (result.selection === 2) {
    await openAdminResetPick(player);
  } else if (result.selection === 3) {
    classStore.clear();
    if (isCloudEnabled()) {
      cloudPushClass({ active: false }).catch(() => {});
    }
    sendPlayerMessage(player, `${THEME.green}Class lesson cleared. Students study their own picks again.`);
    for (const p of world.getPlayers()) {
      if (p.id !== player.id) {
        sendPlayerMessage(p, "Your teacher cleared the class lesson. Pick your own topic anytime!");
      }
    }
    await openAdminMenu(player);
  } else if (result.selection === 4) {
    await openMainMenu(player);
  }
}

async function openAdminAssign(player) {
  if (!isAdmin(player)) {
    return;
  }

  const areas = listAreas();
  const langArea = areas.find((area) => Array.isArray(area.langs));
  const langs = langArea?.langs ?? [];
  const cls = classStore.get();

  // Lesson dropdown: every curriculum pack, plus a final "Free topic" entry that
  // uses the text box instead.
  const lessonLabels = [...areas.map((area) => area.name), "Free topic (use box below)"];
  const freeIndex = lessonLabels.length - 1;
  const defaultLesson = cls && cls.active && cls.curriculumId
    ? Math.max(0, areas.findIndex((area) => area.id === cls.curriculumId))
    : freeIndex;
  const difficultyIndex = Math.max(0, DIFFICULTY_TIERS.findIndex((tier) => tier.value === (cls?.difficulty ?? DEFAULT_DIFFICULTY)));

  const form = new ModalFormData()
    .title(uiTitle("Assign lesson"))
    .dropdown(`${THEME.white}${THEME.flower} Lesson pack`, lessonLabels, { defaultValueIndex: defaultLesson })
    .textField(`${THEME.white}${THEME.flower} Free topic (if chosen above)`, cls && cls.active && !cls.curriculumId ? cls.topicKey : "", "e.g. world_history")
    .dropdown(`${THEME.white}${THEME.flower} Language (Programming Languages pack)`, langs.length ? langs : ["n/a"], { defaultValueIndex: 0 })
    .dropdown(`${THEME.white}${THEME.flower} Difficulty`, DIFFICULTY_TIERS.map((tier) => tier.label), { defaultValueIndex: difficultyIndex })
    .toggle(`${THEME.white}${THEME.flower} Lock topic & difficulty for students`, { defaultValue: Boolean(cls?.locked) });

  const result = await form.show(player);
  if (result.canceled) {
    await openAdminMenu(player);
    return;
  }

  const values = result.formValues ?? [];
  const lessonChoice = Math.round(values[0]);
  const freeTopic = `${values[1] ?? ""}`.trim();
  const chosenLang = langs[Math.round(values[2])] ?? "";
  const difficultyValue = DIFFICULTY_TIERS[Math.round(values[3])]?.value ?? DEFAULT_DIFFICULTY;
  const locked = Boolean(values[4]);

  let assignment;
  if (lessonChoice === freeIndex) {
    if (!freeTopic) {
      sendPlayerMessage(player, `${THEME.red}Pick a pack or type a free topic.`);
      await openAdminAssign(player);
      return;
    }
    assignment = { topicKey: freeTopic, subject: freeTopic, curriculumId: "", lang: "", difficulty: difficultyValue, locked };
  } else {
    const area = areas[lessonChoice];
    const usesLang = Array.isArray(area.langs);
    assignment = {
      topicKey: getCurriculumTopicKey(area, usesLang ? chosenLang : ""),
      subject: getCurriculumSubject(area, usesLang ? chosenLang : ""),
      curriculumId: area.id,
      lang: usesLang ? chosenLang : "",
      difficulty: difficultyValue,
      locked
    };
  }

  classStore.set(assignment);
  if (isCloudEnabled()) {
    cloudPushClass({ active: true, ...assignment }).catch(() => {});
  }
  sendPlayerMessage(player, `${THEME.green}Assigned ${THEME.pink}${assignment.subject} ${THEME.gray}(${difficultyLabel(assignment.difficulty)}${locked ? ", locked" : ""}) to the class.`);
  for (const p of world.getPlayers()) {
    if (p.id !== player.id) {
      sendPlayerMessage(p, `Your teacher assigned a new lesson: ${assignment.subject} (${difficultyLabel(assignment.difficulty)}).`);
    }
  }
  await openAdminMenu(player);
}

async function openAdminRoster(player) {
  if (!isAdmin(player)) {
    return;
  }

  const players = world.getPlayers().filter(isPlayerUsable);
  const lines = players.map((p) => {
    const stats = state.getStats(p);
    const acc = stats.answered > 0 ? Math.round((stats.correct / stats.answered) * 100) : 0;
    const mastered = state.getTotalMastered(p);
    const coins = getCoinCount(p);
    return [
      `${THEME.pink}${THEME.flower} ${THEME.white}${p.name}`,
      `${THEME.gray}  ans ${THEME.white}${stats.answered}${THEME.gray} · acc ${THEME.white}${stats.answered > 0 ? acc + "%" : "-"}${THEME.gray} · mastered ${THEME.white}${mastered}${THEME.gray} · coins ${THEME.gold}${coins}`
    ].join("\n");
  });

  const form = new MessageFormData()
    .title(uiTitle("Class roster"))
    .body(players.length ? lines.join(`\n${THEME.purple}- - - - -\n`) : `${THEME.gray}No players online.`)
    .button1(`${THEME.white}${THEME.heart} Back`)
    .button2(`${THEME.gray}Close`);

  const result = await form.show(player);
  if (!result.canceled && result.selection === 0) {
    await openAdminMenu(player);
  }
}

async function openAdminResetPick(player) {
  if (!isAdmin(player)) {
    return;
  }

  const players = world.getPlayers().filter(isPlayerUsable);
  const form = new ActionFormData()
    .title(uiTitle("Reset a student"))
    .body(`${THEME.white}Pick a student to reset (mastery, streaks, and stats). ${THEME.gray}Coins are kept.\n${uiDivider()}`);
  for (const p of players) {
    form.button(`${THEME.white}${p.name}`);
  }
  form.button(`${THEME.white}${THEME.heart} Back`, "textures/ui/arrow_left");

  const result = await form.show(player);
  if (result.canceled) {
    return;
  }
  if (result.selection === players.length) {
    await openAdminMenu(player);
    return;
  }

  const target = players[result.selection];
  if (!target) {
    await openAdminMenu(player);
    return;
  }

  const confirm = new MessageFormData()
    .title(uiTitle("Confirm reset"))
    .body(`${THEME.white}Reset ${THEME.pink}${target.name}${THEME.white}'s progress?\n${THEME.gray}Mastery, streaks, and stats are wiped. Coins are kept.`)
    .button1(`${THEME.red}Reset`)
    .button2(`${THEME.gray}Cancel`);

  const confirmResult = await confirm.show(player);
  if (!confirmResult.canceled && confirmResult.selection === 0) {
    state.resetPlayer(target);
    sendPlayerMessage(player, `${THEME.green}Reset ${THEME.pink}${target.name}${THEME.green}'s progress.`);
    if (target.id !== player.id) {
      sendPlayerMessage(target, "Your teacher reset your study progress. Fresh start!");
    }
  }
  await openAdminResetPick(player);
}

async function openStoreMenu(player) {
  const coins = getCoinCount(player);
  const form = new ActionFormData()
    .title(uiTitle("Store"))
    .body(`${THEME.gold}${THEME.heart} Balance: ${THEME.white}${coins} ${THEME.gold}coins\n${THEME.gray}Pick a category to shop${THEME.white}\n${uiDivider()}`);

  for (const cat of STORE_CATEGORIES) {
    form.button(`${THEME.white}${cat.name}`, cat.icon);
  }
  form.button(`${THEME.white}${THEME.heart} Back`, "textures/ui/arrow_left");

  const result = await form.show(player);
  if (result.canceled) {
    return;
  }

  if (result.selection === STORE_CATEGORIES.length) {
    await openMainMenu(player);
    return;
  }

  const category = STORE_CATEGORIES[result.selection];
  if (category) {
    await openStoreCategory(player, category.name);
  }
}

async function openStoreCategory(player, categoryName) {
  const coins = getCoinCount(player);
  const items = STORE_ITEMS.filter((item) => item.category === categoryName);
  const form = new ActionFormData()
    .title(uiTitle(categoryName))
    .body(`${THEME.gold}${THEME.heart} Balance: ${THEME.white}${coins} ${THEME.gold}coins\n${uiDivider()}`);

  for (const item of items) {
    const affordable = coins >= item.price;
    const priceColor = affordable ? THEME.gold : THEME.red;
    const label = `${THEME.white}${item.label} ${THEME.gray}x${item.amount}\n${priceColor}${item.price} ${THEME.gold}coins`;
    if (item.icon) {
      form.button(label, item.icon);
    } else {
      form.button(label);
    }
  }
  form.button(`${THEME.white}${THEME.heart} Back`, "textures/ui/arrow_left");

  const result = await form.show(player);
  if (result.canceled) {
    return;
  }

  if (result.selection === items.length) {
    await openStoreMenu(player);
    return;
  }

  const product = items[result.selection];
  if (!product) {
    return;
  }

  const balance = getCoinCount(player);
  if (balance < product.price) {
    sendPlayerMessage(player, `${THEME.red}Not enough coins! ${THEME.white}You need ${THEME.gold}${product.price}${THEME.white}.`);
    await openStoreCategory(player, categoryName);
    return;
  }

  if (!takeCoins(player, product.price)) {
    sendPlayerMessage(player, `${THEME.red}Not enough coins!`);
    await openStoreCategory(player, categoryName);
    return;
  }

  try {
    const stack = new ItemStack(product.id, product.amount);
    const container = player.getComponent("minecraft:inventory")?.container;
    const added = container?.addItem(stack);
    if (added) {
      player.dimension.spawnItem(added, player.location);
      sendPlayerMessage(player, `${THEME.green}Purchased! ${THEME.gray}Inventory full - dropped at your feet.`);
    } else {
      sendPlayerMessage(player, `${THEME.green}Purchased ${THEME.pink}${product.label} ${THEME.gray}x${product.amount}${THEME.green}!`);
    }
  } catch {
    await player.runCommandAsync(`give @s ${product.id} ${product.amount}`);
    sendPlayerMessage(player, `${THEME.green}Purchased ${THEME.pink}${product.label} ${THEME.gray}x${product.amount}${THEME.green}!`);
  }

  await openStoreCategory(player, categoryName);
}

function getPenaltySlots(player, mode) {
  if (mode === "held") {
    return [player.selectedSlotIndex];
  }
  if (mode === "hotbar") {
    return [0, 1, 2, 3, 4, 5, 6, 7, 8];
  }

  const inventory = player.getComponent("minecraft:inventory")?.container;
  if (!inventory) {
    return [];
  }

  const slots = [];
  for (let slot = 0; slot < inventory.size; slot += 1) {
    slots.push(slot);
  }
  return slots;
}

function applyPenalty(player, mode) {
  if (!ENABLE_WRONG_ANSWER_PENALTY) {
    return;
  }

  const container = player.getComponent("minecraft:inventory")?.container;
  if (!container) {
    return;
  }

  let dropped = 0;
  for (const slot of getPenaltySlots(player, mode)) {
    const item = container.getItem(slot);
    if (!item) {
      continue;
    }
    // Never take the Study Settings book - it is the player's tool for opening the
    // menu, not loot. Removing it would lock them out of Settings/quizzes.
    if (item.typeId === SETTINGS_ITEM_ID && `${item.nameTag ?? ""}` === SETTINGS_ITEM_NAME) {
      continue;
    }
    // Permanently remove the item. We intentionally do NOT spawn a pickup-able
    // entity here, because a script-spawned item has no pickup delay and the
    // player would instantly collect it again. Deleting the slot makes the items
    // truly disappear and they cannot be picked back up.
    container.setItem(slot, undefined);
    dropped += 1;
  }

  if (dropped > 0) {
    // Feedback so it still feels like a penalty (sound + smoke puff), even though
    // nothing collectible is dropped.
    try {
      player.playSound("random.break");
      player.dimension.spawnParticle("minecraft:large_explosion", player.location);
    } catch {
      // Particle/sound are cosmetic only; ignore if unavailable.
    }
  }

  if (dropped === 0) {
    sendPlayerMessage(player, "Penalty applied: no items to lose.");
  } else {
    sendPlayerMessage(player, `${THEME.red}Penalty: ${THEME.white}lost items from ${dropped} slot(s). ${THEME.gray}(gone for good)`);
  }
}

async function fetchPoolQuestions(player, config, topic, masteredIds) {
  const askedIds = getAskedSet(player);
  const pool = getTopicPool(player, topic);
  const poolIds = new Set(pool.map((q) => q.id));
  const excludeIds = new Set([...masteredIds, ...askedIds, ...poolIds]);

  // Texts of questions the player has already seen, plus anything still pooled,
  // so the AI is told what NOT to regenerate (IDs alone can't convey this).
  const avoidTexts = [
    ...state.getSeenTexts(player, topic),
    ...pool.map((q) => q.question)
  ].filter((text) => `${text ?? ""}`.trim().length > 0);

  const result = await apiProvider.getQuestions(topic, config.optionCount, excludeIds, {
    apiProvider: config.apiProvider,
    apiEndpoint: config.apiEndpoint,
    apiModel: config.apiModel,
    apiKey: config.apiKey
  }, avoidTexts, resolveQuizMeta(config));

  const issueKey = getFetchIssueKey(player, topic);
  if (result.questions.length > 0) {
    lastFetchIssueByPlayerAndTopic.delete(issueKey);
  } else {
    lastFetchIssueByPlayerAndTopic.set(issueKey, `${result.reason ?? "no_questions"}`);
  }

  for (const question of result.questions) {
    if (excludeIds.has(question.id)) {
      continue;
    }
    pool.push({ ...question, __source: result.source ?? "unknown" });
    poolIds.add(question.id);
  }

  if (!result.liveConfigured) {
    const key = getPlayerKey(player);
    if (!liveUnavailableNotifiedByPlayer.has(key)) {
      liveUnavailableNotifiedByPlayer.add(key);
      sendPlayerMessage(player, "AI questions are off right now - using built-in questions.");
    }
  }

  return pool;
}

async function selectQuestionForPlayer(player, config) {
  const topic = config.topic;
  const masteredIds = state.getMasteredIds(player, topic);
  const pool = getTopicPool(player, topic);

  // Built-in (bundled) questions are always eligible, so any topic you add in
  // bundledTopics.js works whether or not the AI proxy is reachable. When the
  // AI is available it simply adds more questions to the same pool.
  if (pool.filter((q) => !masteredIds.has(q.id)).length === 0) {
    await fetchPoolQuestions(player, config, topic, masteredIds);
  }

  let refreshed = getTopicPool(player, topic).filter((q) => !masteredIds.has(q.id));
  if (refreshed.length === 0) {
    // Session asked-set can exhaust small pools; reset and refill once so quizzes keep flowing.
    getAskedSet(player).clear();
    await fetchPoolQuestions(player, config, topic, masteredIds);
    refreshed = getTopicPool(player, topic).filter((q) => !masteredIds.has(q.id));
    if (refreshed.length === 0) {
      return null;
    }
  }

  shuffleInPlace(refreshed);
  return refreshed[0];
}

function clearFromPool(player, topic, questionId) {
  const pool = getTopicPool(player, topic);
  const idx = pool.findIndex((q) => q.id === questionId);
  if (idx !== -1) {
    pool.splice(idx, 1);
  }
}

async function resolveWrongAnswer(player, config, question, reason) {
  state.recordAnswer(player, false);
  recordCloudAnswer(player, config, false);
  state.setQuestionStreak(player, question.id, 0);
  applyPenalty(player, config.penaltyMode);
  const answer = question.options[question.answerIndex] ?? "(unknown)";
  sendPlayerMessage(player, `${THEME.red}${reason}${THEME.white} Correct answer: ${THEME.pink}${answer}`);
}

async function resolveCorrectAnswer(player, config, question) {
  const topic = config.topic;
  state.recordAnswer(player, true);
  recordCloudAnswer(player, config, true);
  giveCoins(player, 1);

  const streak = state.getQuestionStreak(player, question.id) + 1;
  state.setQuestionStreak(player, question.id, streak);

  if (streak >= MASTERY_STREAK_REQUIRED) {
    state.addMasteredId(player, topic, question.id);
    state.setQuestionStreak(player, question.id, 0);
    clearFromPool(player, topic, question.id);
    sendPlayerMessage(player, `${THEME.green}Correct! ${THEME.gold}+1 coin. ${THEME.purple}${THEME.star} Mastered!`);
  } else {
    sendPlayerMessage(player, `${THEME.green}Correct! ${THEME.gold}+1 coin. ${THEME.pink}Streak: ${THEME.white}${streak}/${MASTERY_STREAK_REQUIRED}`);
  }
}

// Showing a form the instant a player closes another one can bounce back with
// "UserBusy". Retry a few times so a follow-up form reliably appears.
async function showFormResilient(player, form, maxAttempts = 20) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (!isPlayerUsable(player)) {
      return null;
    }
    const response = await form.show(player);
    if (response.canceled && response.cancelationReason === "UserBusy") {
      await delayTicks(10);
      continue;
    }
    return response;
  }
  return null;
}

// When a player closes a question with the X, turn it into a study moment:
// reveal the correct answer and show a short overview of the topic. The recap is
// AI-generated when available, with a friendly offline fallback. No penalty.
async function showQuestionOverview(player, config, question) {
  const correct = question.options[question.answerIndex] ?? "(unknown)";
  const subject = describeConfigSubject(config);

  // A brief on-screen heads-up while the recap (if any) is fetched.
  try {
    player.onScreenDisplay.setActionBar(`${THEME.pink}${THEME.heart} ${THEME.white}Here's a quick overview...`);
  } catch {
    /* onScreenDisplay may be unavailable on some runtimes */
  }

  let recap = null;
  try {
    recap = await apiProvider.getSummary(subject, {
      apiProvider: config.apiProvider,
      apiEndpoint: config.apiEndpoint,
      apiModel: config.apiModel,
      apiKey: config.apiKey
    });
  } catch {
    recap = null;
  }

  const overviewLine = recap && `${recap}`.trim().length > 0
    ? `${THEME.gold}${THEME.sparkle} ${THEME.white}${recap}`
    : `${THEME.gray}Tip: review ${subject} and you'll have this one next time!`;

  const body = [
    `${THEME.purple}${THEME.star} Topic: ${THEME.white}${subject}`,
    uiDivider(),
    `${THEME.white}${question.question}`,
    `${THEME.green}${THEME.heart} Correct answer: ${THEME.pink}${correct}`,
    uiDivider(),
    overviewLine
  ].join("\n");

  const form = new ActionFormData()
    .title(uiTitle("Overview"))
    .body(body)
    .button(`${THEME.white}${THEME.heart} Got it`);

  await showFormResilient(player, form);
}

async function askQuestion(player, triggerSource) {
  if (!isPlayerUsable(player)) {
    return;
  }

  const config = getEffectiveConfig(player);

  // No AI gate here: if the proxy is unreachable (or off), the provider falls
  // back to the built-in questions, so quizzes keep working offline.
  const question = await selectQuestionForPlayer(player, config);
  if (!question) {
    if (hasPlayerLiveConfig(config) && config.topic !== FALLBACK_TOPIC) {
      const issueKey = getFetchIssueKey(player, config.topic);
      const reason = `${lastFetchIssueByPlayerAndTopic.get(issueKey) ?? "unknown"}`;
      sendPlayerMessage(player, `No valid API questions returned for '${config.topic}'. API detail: ${reason}`);
    } else {
      sendPlayerMessage(player, "No available questions for this topic yet.");
    }
    return;
  }

  // Remember this question's text so future API batches are told to avoid it,
  // even across sessions and after it has been mastered (mastery stores only IDs).
  state.addSeenText(player, config.topic, question.question);

  const options = question.options.map((text, idx) => ({ text, idx }));
  shuffleInPlace(options);
  const correctButton = options.findIndex((entry) => entry.idx === question.answerIndex);

  // Cute 3-2-1 countdown so players can get ready before the question shows.
  await countdownBeforeQuiz(player);
  if (!isPlayerUsable(player)) {
    return;
  }

  // Long answers must never get cut off. Two things keep them fully readable:
  //   1) Each BUTTON label is wrapped onto multiple lines (wrapButtonLabel) so a
  //      long answer never clips at the edge of the button.
  //   2) The full options are ALSO listed in the form BODY as a numbered list,
  //      which wraps and scrolls, so every choice is always readable in full.
  // Button order matches `options`, so `correctButton` (above) still lines up.
  const numberedOptions = options
    .map((option, idx) => `${THEME.pink}${idx + 1}.${THEME.white} ${option.text}`)
    .join("\n");

  const form = new ActionFormData()
    .title(uiTitle(describeConfigSubject(config)))
    .body(`${THEME.white}${question.question}\n${uiDivider()}\n${numberedOptions}`);
  options.forEach((option, idx) => {
    form.button(`${THEME.white}${wrapButtonLabel(`${idx + 1}. ${option.text}`)}`);
  });

  const playerKey = getPlayerKey(player);
  const token = `${playerKey}:${nowMs()}:${Math.random()}`;
  const askedAt = nowMs();
  let settled = false;
  let timedOut = false;

  pendingPromptByPlayer.set(playerKey, { token, topic: config.topic, question, askedAt, triggerSource });

  system.runTimeout(async () => {
    const pending = pendingPromptByPlayer.get(playerKey);
    if (!pending || pending.token !== token || settled) {
      return;
    }

    timedOut = true;
    settled = true;
    pendingPromptByPlayer.delete(playerKey);
    getAskedSet(player).add(question.id);
    clearFromPool(player, config.topic, question.id);
    await resolveWrongAnswer(player, config, question, "Timed out.");
  }, config.answerSec * 20);

  const result = await form.show(player);
  if (settled) {
    return;
  }

  settled = true;
  pendingPromptByPlayer.delete(playerKey);

  if (result.canceled) {
    // "UserBusy" means the game closed the form (e.g. chat opened), not the
    // player - don't treat that as a deliberate close.
    if (result.cancelationReason !== "UserBusy") {
      await showQuestionOverview(player, config, question);
    }
    return;
  }

  const elapsed = nowMs() - askedAt;
  if (timedOut || elapsed > config.answerSec * 1000) {
    getAskedSet(player).add(question.id);
    clearFromPool(player, config.topic, question.id);
    await resolveWrongAnswer(player, config, question, "Too slow.");
    return;
  }

  getAskedSet(player).add(question.id);
  clearFromPool(player, config.topic, question.id);

  if (result.selection === correctButton) {
    await resolveCorrectAnswer(player, config, question);
  } else {
    await resolveWrongAnswer(player, config, question, "Incorrect.");
  }
}

async function openMainMenu(player) {
  // Persist defaults from the raw player config, but display the effective one
  // (which reflects any active teacher lesson) so the menu shows what a quiz
  // will actually use.
  state.setConfig(player, state.getConfig(player, getAvailableTopics()));
  const config = getEffectiveConfig(player);

  const coins = getCoinCount(player);
  const masteredCount = state.getMasteredIds(player, config.topic).size;
  const subjectLine = config.classActive
    ? `${THEME.pink}${THEME.flower} Lesson: ${THEME.white}${describeConfigSubject(config)} ${THEME.gray}(${difficultyLabel(config.difficulty)}${config.classLocked ? ", set by teacher" : ""})`
    : `${THEME.pink}${THEME.flower} Topic: ${THEME.white}${describeConfigSubject(config)} ${THEME.gray}(${difficultyLabel(config.difficulty)})`;

  const form = new ActionFormData()
    .title(uiTitle("Study Quiz"))
    .body([
      `${THEME.gold}${THEME.heart} Coins: ${THEME.white}${coins}`,
      subjectLine,
      `${THEME.purple}${THEME.star} Mastered: ${THEME.white}${masteredCount}`,
      getLiveStatusLine(config),
      uiDivider()
    ].join("\n"));

  // Build buttons + their handlers together so adding the conditional Teacher
  // entry never desyncs the selection indices.
  const actions = [
    { label: `${THEME.white}${THEME.heart} Take a Quiz`, icon: "textures/items/book_enchanted", run: () => askQuestion(player, "manual") },
    { label: `${THEME.white}${THEME.sparkle} Curriculum`, icon: "textures/items/book_portfolio", run: () => openCurriculumMenu(player) },
    { label: `${THEME.white}${THEME.flower} Settings`, icon: "textures/items/comparator", run: () => openSettingsMenu(player) },
    { label: `${THEME.white}${THEME.sparkle} Store`, icon: "textures/items/emerald", run: () => openStoreMenu(player) },
    { label: `${THEME.white}${THEME.star} My Stats`, icon: "textures/items/book_writable", run: () => openStatsMenu(player) }
  ];
  if (isAdmin(player)) {
    actions.push({ label: `${THEME.white}${THEME.flower} Teacher`, icon: "textures/items/name_tag", run: () => openAdminMenu(player) });
  }

  for (const action of actions) {
    form.button(action.label, action.icon);
  }

  const result = await form.show(player);
  if (result.canceled) {
    return;
  }

  const chosen = actions[result.selection];
  if (chosen) {
    await chosen.run();
  }
}

function setupJoinSync() {
  world.afterEvents.playerSpawn.subscribe((event) => {
    const player = event.player;
    const cfg = state.getConfig(player, getAvailableTopics());
    state.setConfig(player, cfg);
    syncCoinScoreboard(player);
    ensureSettingsItem(player);
    player.sendMessage(`${THEME.bold}${THEME.pink}${THEME.flower} Welcome to Study Quiz ${THEME.flower}`);
    sendPlayerMessage(player, `${THEME.white}Hold the ${THEME.pink}Study Settings ${THEME.white}book and ${THEME.pink}right-click/use ${THEME.white}it to open the cute quiz menu!`);
    if (chatCommandAvailable) {
      sendPlayerMessage(player, `${THEME.white}Or just type ${THEME.pink}!study${THEME.white} in chat.`);
    }
  });
}

function setupSettingsItemUse() {
  const openIfSettingsItem = (player, itemStack) => {
    if (!player || player.typeId !== "minecraft:player") {
      return;
    }
    if (!itemStack || itemStack.typeId !== SETTINGS_ITEM_ID) {
      return;
    }

    const tag = `${itemStack.nameTag ?? ""}`;
    if (tag.length > 0 && tag !== SETTINGS_ITEM_NAME) {
      return;
    }

    // A single right-click fires several item-use signals (before/after, use/useOn,
    // legacy). Debounce so the settings menu opens exactly once per click instead
    // of stacking 2-4 identical forms on top of each other.
    const key = getPlayerKey(player);
    const now = nowMs();
    if (now - (lastMenuOpenMsByPlayer.get(key) ?? 0) < 500) {
      return;
    }
    lastMenuOpenMsByPlayer.set(key, now);

    system.run(async () => {
      await openMainMenu(player);
    });
  };

  let hooked = false;
  const modernBefore = world.beforeEvents?.itemUse;
  if (modernBefore?.subscribe) {
    modernBefore.subscribe((event) => openIfSettingsItem(event.source, event.itemStack ?? event.item));
    hooked = true;
  }
  const modernBeforeOn = world.beforeEvents?.itemUseOn;
  if (modernBeforeOn?.subscribe) {
    modernBeforeOn.subscribe((event) => openIfSettingsItem(event.source, event.itemStack ?? event.item));
    hooked = true;
  }
  const modernAfter = world.afterEvents?.itemUse;
  if (modernAfter?.subscribe) {
    modernAfter.subscribe((event) => openIfSettingsItem(event.source, event.itemStack ?? event.item));
    hooked = true;
  }
  const modernAfterOn = world.afterEvents?.itemUseOn;
  if (modernAfterOn?.subscribe) {
    modernAfterOn.subscribe((event) => openIfSettingsItem(event.source, event.itemStack ?? event.item));
    hooked = true;
  }
  const legacyBefore = world.events?.beforeItemUse;
  if (legacyBefore?.subscribe) {
    legacyBefore.subscribe((event) => openIfSettingsItem(event.source, event.itemStack ?? event.item));
    hooked = true;
  }
  const legacyAfter = world.events?.itemUse;
  if (legacyAfter?.subscribe) {
    legacyAfter.subscribe((event) => openIfSettingsItem(event.source, event.itemStack ?? event.item));
    hooked = true;
  }

  if (!hooked) {
    console.warn("[StudyQuiz] Item-use listener unavailable; settings item opener disabled.");
  }
}

function setupChatCommand() {
  const handle = (player, rawMessage) => {
    const raw = `${rawMessage ?? ""}`.trim();
    const lower = raw.toLowerCase();

    if (lower === COMMAND_OPEN_MENU) {
      system.run(async () => {
        await openMainMenu(player);
      });
      return true;
    }

    return false;
  };

  const modernSignal = world.beforeEvents?.chatSend;
  if (modernSignal?.subscribe) {
    modernSignal.subscribe((event) => {
      if (handle(event.sender, event.message)) {
        event.cancel = true;
      }
    });
    chatCommandAvailable = true;
    return;
  }

  const legacySignal = world.events?.beforeChat;
  if (legacySignal?.subscribe) {
    legacySignal.subscribe((event) => {
      if (handle(event.sender, event.message)) {
        event.cancel = true;
      }
    });
    chatCommandAvailable = true;
    return;
  }

  console.warn("[StudyQuiz] Chat command listener unavailable on this runtime. Players open the menu with the Study Settings book or /scriptevent study:open.");
}

function setupScriptEventCommand() {
  const signal = system.afterEvents?.scriptEventReceive;
  if (!signal?.subscribe) {
    console.warn("[StudyQuiz] scriptEventReceive unavailable; no command fallback is available.");
    return;
  }

  signal.subscribe((event) => {
    const id = `${event.id ?? ""}`.trim().toLowerCase();
    if (id !== "study:open") {
      return;
    }

    const player = event.sourceEntity;
    if (player && player.typeId === "minecraft:player") {
      system.run(async () => {
        await openMainMenu(player);
      });
      return;
    }

    system.run(async () => {
      for (const p of world.getPlayers()) {
        if (isPlayerUsable(p)) {
          await openMainMenu(p);
        }
      }
    });
  });
}

function setupAutoPrompts() {
  system.runInterval(async () => {
    for (const player of world.getPlayers()) {
      if (!isPlayerUsable(player)) {
        continue;
      }

      const key = getPlayerKey(player);
      if (pendingPromptByPlayer.has(key)) {
        continue;
      }

      const config = getEffectiveConfig(player);
      const everyMs = config.intervalMin * 60 * 1000;
      const lastMs = lastPromptMsByPlayer.get(key) ?? 0;
      if (nowMs() - lastMs < everyMs) {
        continue;
      }

      lastPromptMsByPlayer.set(key, nowMs());
      try {
        await askQuestion(player, "interval");
      } catch (error) {
        console.warn(`[StudyQuiz] Interval ask failed for ${player.name}: ${error}`);
      }
    }
  }, 100);
}

function setupWarmupPrefetch() {
  system.runInterval(async () => {
    for (const player of world.getPlayers()) {
      if (!isPlayerUsable(player)) {
        continue;
      }

      const cfg = getEffectiveConfig(player);
      if (!hasPlayerLiveConfig(cfg)) {
        continue;
      }

      const pool = getTopicPool(player, cfg.topic);
      if (pool.length >= REFRESH_BATCH_SIZE) {
        continue;
      }

      const mastered = state.getMasteredIds(player, cfg.topic);
      try {
        await fetchPoolQuestions(player, cfg, cfg.topic, mastered);
      } catch (error) {
        console.warn(`[StudyQuiz] Warmup prefetch failed for ${player.name}: ${error}`);
      }
    }
  }, 200);
}

// Pushes dirty profiles + batched events to the cloud and pulls the class
// assignment so the teacher dashboard and the in-game lesson stay in sync.
// Entirely skipped when cloud sync is disabled.
function setupCloudSync() {
  if (!isCloudEnabled()) {
    return;
  }

  // Pull the class assignment from the cloud (dashboard is the source of truth).
  system.runInterval(() => {
    cloudFetchClass()
      .then((cls) => {
        if (cls && cls.active) {
          classStore.set(cls);
        } else if (cls) {
          // An explicit {active:false} from the API means "no lesson".
          classStore.clear();
        }
      })
      .catch(() => {});
  }, 1200); // ~60s

  // Flush profile snapshots + answer events.
  system.runInterval(() => {
    const onlineById = new Map(world.getPlayers().map((p) => [p.id, p]));
    for (const id of [...cloudDirtyPlayers]) {
      cloudDirtyPlayers.delete(id);
      const player = onlineById.get(id);
      if (player && isPlayerUsable(player)) {
        cloudPushProfile(player.id, buildProfileSnapshot(player)).catch(() => {});
      }
    }

    if (cloudEventQueue.length > 0) {
      const batch = cloudEventQueue.splice(0, cloudEventQueue.length);
      cloudSendEvents(batch).catch(() => {});
    }
  }, 1200); // ~60s
}

function bootstrap() {
  setupJoinSync();
  setupChatCommand();
  setupScriptEventCommand();
  setupSettingsItemUse();
  setupAutoPrompts();
  setupWarmupPrefetch();
  setupCloudSync();

  system.runTimeout(() => {
    try {
      ensureCoinObjective();
    } catch (error) {
      console.warn(`[StudyQuiz] Scoreboard objective creation failed: ${error}`);
    }

    const opener = chatCommandAvailable
      ? `${COMMAND_OPEN_MENU} or the Study Settings book`
      : `the Study Settings book or /scriptevent study:open`;
    console.warn(`[StudyQuiz] Loaded. Open the menu with ${opener}. Default topic fallback: ${FALLBACK_TOPIC}.`);
  }, 20);
}

bootstrap();
