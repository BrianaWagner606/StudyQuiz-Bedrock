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
  API_PROVIDERS,
  COMMAND_OPEN_MENU,
  DEFAULT_CONFIG,
  DROP_PENALTY_IGNORES_GAMEMODE_AND_KEEPINVENTORY,
  FALLBACK_TOPIC,
  MASTERY_STREAK_REQUIRED,
  PENALTY_MODES,
  REFRESH_BATCH_SIZE,
  STORE_ITEMS,
  STORE_CATEGORIES,
  STORE_SCOREBOARD_OBJECTIVE,
  THEME
} from "./constants.js";
import { PlayerStateStore } from "./state.js";
import { ApiProvider } from "./providers/ApiProvider.js";
import { BundledProvider } from "./providers/BundledProvider.js";
import { getBundledTopicNames } from "./questions/bundledTopics.js";
import { nowMs, shuffleInPlace } from "./utils.js";

const bundledProvider = new BundledProvider();
const apiProvider = new ApiProvider(bundledProvider);
const state = new PlayerStateStore();

const topicPoolByPlayer = new Map();
const askedSessionIdsByPlayer = new Map();
const pendingPromptByPlayer = new Map();
const lastPromptMsByPlayer = new Map();
const liveUnavailableNotifiedByPlayer = new Set();
const apiSetupReminderByPlayer = new Set();
const lastFetchIssueByPlayerAndTopic = new Map();
const lastMenuOpenMsByPlayer = new Map();
let coinObjective = null;

const SETTINGS_ITEM_ID = "minecraft:book";
const SETTINGS_ITEM_NAME = "Study Settings";
const COIN_ITEM_ID = "studyquiz:coin";

function getProviderMeta(providerValue) {
  return API_PROVIDERS.find((p) => p.value === providerValue) ?? API_PROVIDERS[0];
}

// Guess the provider from the key's prefix so players only need to paste their key.
function inferProviderFromKey(apiKey) {
  const key = `${apiKey ?? ""}`.trim();
  if (key.startsWith("sk-ant-")) return "anthropic";
  if (key.startsWith("sk-or-v1-")) return "openrouter";
  if (key.startsWith("sk-")) return "openai";
  return "";
}

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
  const provider = getProviderMeta(config?.apiProvider).label;
  return hasPlayerLiveConfig(config)
    ? `${THEME.pink}${THEME.sparkle} ${THEME.green}Connected ${THEME.gray}(${provider})`
    : `${THEME.pink}${THEME.sparkle} ${THEME.gray}No AI key yet. Type !key in chat.`;
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

async function promptForPlayerApiConfig(player, config) {
  sendPlayerMessage(player, "To use live AI quizzes, type in chat:  !key YOUR-API-KEY");
  sendPlayerMessage(player, "Your key is hidden from other players. Then try the quiz again.");
  return null;
}

async function openSettingsMenu(player) {
  const cfg = state.getConfig(player, getAvailableTopics());
  const intervalChoices = [1, 3, 5, 10, 15, 20, 30, 45, 60];
  const answerChoices = [5, 10, 15, 20, 25, 30, 45, 60, 90, 120];
  const optionChoices = [2, 3, 4, 5, 6];
  const providerChoices = API_PROVIDERS.map((p) => p.label);

  // Pre-select the player's currently saved values so opening Settings shows the
  // real configuration. Without these defaults a dropdown always shows its first
  // option, and pressing Save would silently reset everything to that first option.
  const intervalIndex = Math.max(0, intervalChoices.indexOf(cfg.intervalMin));
  const answerIndex = Math.max(0, answerChoices.indexOf(cfg.answerSec));
  const optionIndex = Math.max(0, optionChoices.indexOf(cfg.optionCount));
  const penaltyIndex = Math.max(0, PENALTY_MODES.findIndex((mode) => mode.value === cfg.penaltyMode));
  const providerIndexDefault = Math.max(0, API_PROVIDERS.findIndex((p) => p.value === cfg.apiProvider));

  const form = new ModalFormData()
    .title(uiTitle("Settings"))
    .dropdown(`${THEME.white}${THEME.flower} Quiz interval (minutes)`, intervalChoices.map((v) => `${v}`), { defaultValueIndex: intervalIndex })
    .dropdown(`${THEME.white}${THEME.flower} Answer time limit (seconds)`, answerChoices.map((v) => `${v}`), { defaultValueIndex: answerIndex })
    .textField(`${THEME.white}${THEME.flower} Topic (type anything)`, cfg.topic ?? FALLBACK_TOPIC)
    .dropdown(`${THEME.white}${THEME.flower} Options per question`, optionChoices.map((v) => `${v}`), { defaultValueIndex: optionIndex })
    .dropdown(`${THEME.white}${THEME.flower} Penalty mode`, PENALTY_MODES.map((mode) => mode.label), { defaultValueIndex: penaltyIndex })
    .dropdown(`${THEME.white}${THEME.flower} AI Provider`, providerChoices, { defaultValueIndex: providerIndexDefault })
    .label(getLiveStatusLine(cfg))
    .label(`${THEME.gray}To set your API key, type in chat: ${THEME.white}!key YOUR-API-KEY`);

  const result = await form.show(player);
  if (result.canceled) {
    return;
  }

  const values = result.formValues;
  if (!values || values.length < 6) {
    return;
  }

  const topicInput = `${values[2] ?? ""}`.trim();
  const providerIdx = Math.round(values[5]);
  const selectedProvider = API_PROVIDERS[providerIdx] ?? API_PROVIDERS[0];

  updatePlayerConfig(player, (prev) => ({
    intervalMin: intervalChoices[Math.round(values[0])] ?? cfg.intervalMin,
    answerSec: answerChoices[Math.round(values[1])] ?? cfg.answerSec,
    topic: topicInput.length > 0 ? topicInput : cfg.topic,
    optionCount: optionChoices[Math.round(values[3])] ?? cfg.optionCount,
    penaltyMode: PENALTY_MODES[Math.round(values[4])]?.value ?? cfg.penaltyMode,
    apiProvider: selectedProvider.value,
    apiEndpoint: selectedProvider.defaultEndpoint,
    apiModel: selectedProvider.defaultModel,
    apiKey: prev.apiKey
  }));

  sendPlayerMessage(player, "Settings saved.");
}

async function openStatsMenu(player) {
  const coins = getCoinCount(player);
  const masteredByTopic = state.getMasteredCountByTopic(player);
  const lines = Object.keys(masteredByTopic).length
    ? Object.entries(masteredByTopic).map(([topic, count]) => `${THEME.pink}${THEME.flower} ${THEME.white}${topic}: ${THEME.purple}${count}`)
    : [`${THEME.gray}none yet - go take a quiz!`];

  const form = new MessageFormData()
    .title(uiTitle("My Stats"))
    .body([
      `${THEME.gold}${THEME.heart} Study coins: ${THEME.white}${coins}`,
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
  if (!DROP_PENALTY_IGNORES_GAMEMODE_AND_KEEPINVENTORY) {
    sendPlayerMessage(player, "Penalty drop is disabled by server config.");
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

  const result = await apiProvider.getQuestions(topic, config.optionCount, excludeIds, {
    apiProvider: config.apiProvider,
    apiEndpoint: config.apiEndpoint,
    apiModel: config.apiModel,
    apiKey: config.apiKey
  });

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
      sendPlayerMessage(player, "Live questions unavailable. Check your API key in Settings.");
    }
  }

  return pool;
}

async function selectQuestionForPlayer(player, config) {
  const topic = config.topic;
  const masteredIds = state.getMasteredIds(player, topic);
  const pool = getTopicPool(player, topic);

  // When using live custom topics, only serve API-generated items.
  if (hasPlayerLiveConfig(config) && topic !== FALLBACK_TOPIC) {
    for (let i = pool.length - 1; i >= 0; i -= 1) {
      const source = `${pool[i]?.__source ?? ""}`.toLowerCase();
      if (source !== "api") {
        pool.splice(i, 1);
      }
    }
  }

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
  state.setQuestionStreak(player, question.id, 0);
  applyPenalty(player, config.penaltyMode);
  const answer = question.options[question.answerIndex] ?? "(unknown)";
  sendPlayerMessage(player, `${THEME.red}${reason}${THEME.white} Correct answer: ${THEME.pink}${answer}`);
}

async function resolveCorrectAnswer(player, topic, question) {
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

async function askQuestion(player, triggerSource) {
  if (!isPlayerUsable(player)) {
    return;
  }

  let config = state.getConfig(player, getAvailableTopics());

  if (!hasPlayerLiveConfig(config)) {
    if (triggerSource === "interval") {
      const key = getPlayerKey(player);
      if (!apiSetupReminderByPlayer.has(key)) {
        apiSetupReminderByPlayer.add(key);
        sendPlayerMessage(player, "Type !key YOUR-API-KEY in chat to set your AI key.");
      }
      return;
    }

    const updated = await promptForPlayerApiConfig(player, config);
    if (!updated) {
      return;
    }
    config = updated;
  }

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

  const options = question.options.map((text, idx) => ({ text, idx }));
  shuffleInPlace(options);
  const correctButton = options.findIndex((entry) => entry.idx === question.answerIndex);

  // Cute 3-2-1 countdown so players can get ready before the question shows.
  await countdownBeforeQuiz(player);
  if (!isPlayerUsable(player)) {
    return;
  }

  const form = new ActionFormData()
    .title(uiTitle(config.topic))
    .body(`${THEME.white}${question.question}\n${uiDivider()}`);
  for (const option of options) {
    form.button(`${THEME.white}${option.text}`);
  }

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
    sendPlayerMessage(player, "Question closed. No penalty applied.");
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
    await resolveCorrectAnswer(player, config.topic, question);
  } else {
    await resolveWrongAnswer(player, config, question, "Incorrect.");
  }
}

async function openMainMenu(player) {
  const config = state.getConfig(player, getAvailableTopics());
  state.setConfig(player, config);

  const coins = getCoinCount(player);
  const masteredCount = state.getMasteredIds(player, config.topic).size;

  const form = new ActionFormData()
    .title(uiTitle("Study Quiz"))
    .body([
      `${THEME.gold}${THEME.heart} Coins: ${THEME.white}${coins}`,
      `${THEME.pink}${THEME.flower} Topic: ${THEME.white}${config.topic}`,
      `${THEME.purple}${THEME.star} Mastered: ${THEME.white}${masteredCount}`,
      getLiveStatusLine(config),
      uiDivider()
    ].join("\n"))
    .button(`${THEME.white}${THEME.heart} Take a Quiz`, "textures/items/book_enchanted")
    .button(`${THEME.white}${THEME.flower} Settings`, "textures/items/comparator")
    .button(`${THEME.white}${THEME.sparkle} Store`, "textures/items/emerald")
    .button(`${THEME.white}${THEME.star} My Stats`, "textures/items/book_writable");

  const result = await form.show(player);
  if (result.canceled) {
    return;
  }

  if (result.selection === 0) {
    await askQuestion(player, "manual");
    return;
  }
  if (result.selection === 1) {
    await openSettingsMenu(player);
    return;
  }
  if (result.selection === 2) {
    await openStoreMenu(player);
    return;
  }
  if (result.selection === 3) {
    await openStatsMenu(player);
  }
}

function setupJoinSync() {
  world.afterEvents.playerSpawn.subscribe((event) => {
    const player = event.player;
    const cfg = state.getConfig(player, getAvailableTopics());
    state.setConfig(player, cfg);
    syncCoinScoreboard(player);
    ensureSettingsItem(player);
    if (hasPlayerLiveConfig(cfg)) {
      player.sendMessage(`${THEME.bold}${THEME.pink}${THEME.flower} Welcome to Study Quiz ${THEME.flower}`);
      sendPlayerMessage(player, `${THEME.white}Type ${THEME.pink}!study${THEME.white} to open the cute quiz menu!`);
    } else {
      player.sendMessage(`${THEME.bold}${THEME.pink}${THEME.flower} Welcome to Study Quiz ${THEME.flower}`);
      sendPlayerMessage(player, `${THEME.white}To connect AI, type ${THEME.pink}!key YOUR-API-KEY${THEME.white} in chat.`);
      sendPlayerMessage(player, `${THEME.white}Then type ${THEME.pink}!study${THEME.white} to play. (Your key stays hidden!)`);
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

    // !key <your full api key> — set your own key via chat (no length limit, hidden from others).
    if (lower.startsWith("!key")) {
      const key = raw.slice(4).replace(/\s+/g, "").trim();
      system.run(() => {
        if (!key) {
          sendPlayerMessage(player, "Usage: !key <your-api-key>  (paste your full key after !key)");
          return;
        }
        const inferred = inferProviderFromKey(key);
        const meta = inferred ? getProviderMeta(inferred) : null;
        const next = updatePlayerConfig(player, (prev) => ({
          ...prev,
          apiKey: key,
          ...(meta ? { apiProvider: meta.value, apiEndpoint: meta.defaultEndpoint, apiModel: meta.defaultModel } : {})
        }));
        sendPlayerMessage(player, `API key saved (length ${key.length}). Provider: ${getProviderMeta(next.apiProvider).label}.`);
        sendPlayerMessage(player, "Type !study to open the quiz menu. (Use !provider to change provider.)");
      });
      return true;
    }

    // !provider <name> — switch provider.
    if (lower.startsWith("!provider")) {
      const name = lower.slice(9).trim();
      system.run(() => {
        const meta = API_PROVIDERS.find((p) => p.value === name || p.label.toLowerCase() === name);
        if (!meta) {
          sendPlayerMessage(player, `Unknown provider. Options: ${API_PROVIDERS.map((p) => p.value).join(", ")}.`);
          return;
        }
        updatePlayerConfig(player, (prev) => ({
          ...prev,
          apiProvider: meta.value,
          apiEndpoint: meta.defaultEndpoint,
          apiModel: meta.defaultModel
        }));
        sendPlayerMessage(player, `Provider set to ${meta.label}.`);
      });
      return true;
    }

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
    return;
  }

  const legacySignal = world.events?.beforeChat;
  if (legacySignal?.subscribe) {
    legacySignal.subscribe((event) => {
      if (handle(event.sender, event.message)) {
        event.cancel = true;
      }
    });
    return;
  }

  console.warn("[StudyQuiz] Chat command listener unavailable on this runtime. Use /scriptevent study:open.");
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

      const config = state.getConfig(player, getAvailableTopics());
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

      const cfg = state.getConfig(player, getAvailableTopics());
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

function bootstrap() {
  setupJoinSync();
  setupChatCommand();
  setupScriptEventCommand();
  setupSettingsItemUse();
  setupAutoPrompts();
  setupWarmupPrefetch();

  system.runTimeout(() => {
    try {
      ensureCoinObjective();
    } catch (error) {
      console.warn(`[StudyQuiz] Scoreboard objective creation failed: ${error}`);
    }

    console.warn(`[StudyQuiz] Loaded. Command: ${COMMAND_OPEN_MENU}. Default topic fallback: ${FALLBACK_TOPIC}.`);
  }, 20);
}

bootstrap();
