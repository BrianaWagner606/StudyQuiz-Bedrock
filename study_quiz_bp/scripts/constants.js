export const COMMAND_OPEN_MENU = "!study";

export const DEFAULT_CONFIG = {
  intervalMin: 5,
  answerSec: 25,
  topic: "general_science",
  optionCount: 4,
  penaltyMode: "inventory",
  apiProvider: "anthropic",
  apiEndpoint: "",
  apiModel: "",
  apiKey: ""
};

export const PLAYER_API_ENDPOINT = "https://api.anthropic.com/v1/messages";
export const PLAYER_API_MODEL = "claude-haiku-4-5-20251001";

export const API_PROVIDERS = [
  {
    value: "anthropic",
    label: "Anthropic Claude",
    defaultEndpoint: "https://api.anthropic.com/v1/messages",
    defaultModel: "claude-haiku-4-5-20251001",
    apiKeyHint: "sk-ant-..."
  },
  {
    value: "openai",
    label: "OpenAI",
    defaultEndpoint: "https://api.openai.com/v1/chat/completions",
    defaultModel: "gpt-4.1-mini",
    apiKeyHint: "sk-..."
  },
  {
    value: "openrouter",
    label: "OpenRouter",
    defaultEndpoint: "https://openrouter.ai/api/v1/chat/completions",
    defaultModel: "openai/gpt-4o-mini",
    apiKeyHint: "sk-or-v1-..."
  },
  {
    value: "openai_compatible",
    label: "Custom OpenAI-compatible",
    defaultEndpoint: "https://api.openai.com/v1/chat/completions",
    defaultModel: "gpt-4.1-mini",
    apiKeyHint: "provider-key"
  }
];

export const PENALTY_MODES = [
  { value: "held", label: "Held item only" },
  { value: "hotbar", label: "Hotbar" },
  { value: "inventory", label: "Full inventory" }
];

export const MASTERY_STREAK_REQUIRED = 3;
export const STORE_SCOREBOARD_OBJECTIVE = "study_coins";

export const STORE_ITEMS = [
  // Cheap consumables
  { id: "minecraft:bread", label: "Bread", price: 1, amount: 4, icon: "textures/items/bread", category: "Food" },
  { id: "minecraft:cooked_beef", label: "Steak", price: 2, amount: 4, icon: "textures/items/beef_cooked", category: "Food" },
  { id: "minecraft:golden_apple", label: "Golden Apple", price: 8, amount: 1, icon: "textures/items/apple_golden", category: "Food" },
  { id: "minecraft:enchanted_golden_apple", label: "Enchanted Golden Apple", price: 50, amount: 1, icon: "textures/items/apple_golden", category: "Food" },

  // Materials & utility
  { id: "minecraft:torch", label: "Torch", price: 1, amount: 16, icon: "textures/blocks/torch_on", category: "Materials" },
  { id: "minecraft:arrow", label: "Arrows", price: 2, amount: 16, icon: "textures/items/arrow", category: "Materials" },
  { id: "minecraft:experience_bottle", label: "XP Bottle", price: 3, amount: 4, icon: "textures/items/experience_bottle", category: "Materials" },
  { id: "minecraft:iron_ingot", label: "Iron Ingot", price: 3, amount: 2, icon: "textures/items/iron_ingot", category: "Materials" },
  { id: "minecraft:gold_ingot", label: "Gold Ingot", price: 3, amount: 2, icon: "textures/items/gold_ingot", category: "Materials" },
  { id: "minecraft:ender_pearl", label: "Ender Pearl", price: 4, amount: 1, icon: "textures/items/ender_pearl", category: "Materials" },

  // Premium / top tier
  { id: "minecraft:diamond", label: "Diamond", price: 5, amount: 1, icon: "textures/items/diamond", category: "Premium" },
  { id: "minecraft:emerald", label: "Emerald", price: 6, amount: 1, icon: "textures/items/emerald", category: "Premium" },
  { id: "minecraft:netherite_scrap", label: "Netherite Scrap", price: 25, amount: 1, icon: "textures/items/netherite_scrap", category: "Premium" },
  { id: "minecraft:diamond_block", label: "Diamond Block", price: 40, amount: 1, icon: "textures/blocks/diamond_block", category: "Premium" }
];

// Store categories shown as sub-menus, with a cute icon for each.
export const STORE_CATEGORIES = [
  { name: "Food", icon: "textures/items/apple_golden" },
  { name: "Materials", icon: "textures/items/iron_ingot" },
  { name: "Premium", icon: "textures/items/diamond" }
];

// ============================================================
//  UI THEME - girly, pink, cute, but clean & readable
// ============================================================
// Minecraft formatting codes (§). Pink palette with high-contrast text.
export const THEME = {
  pink: "\u00a7d",       // light pink / magenta - headers & accents
  purple: "\u00a75",     // dark purple - secondary accents
  white: "\u00a7f",      // body text (max readability)
  gray: "\u00a77",       // muted hints
  gold: "\u00a76",       // coins / prices
  green: "\u00a7a",      // success
  red: "\u00a7c",        // warnings
  bold: "\u00a7l",       // bold
  italic: "\u00a7o",     // italic
  reset: "\u00a7r",      // reset
  heart: "\u2665",       // ♥
  flower: "\u273f",      // ✿
  sparkle: "\u2727",     // ✧
  star: "\u2740"         // ❀
};

// Set to false if you want to skip penalties in Creative/keepInventory scenarios.
export const DROP_PENALTY_IGNORES_GAMEMODE_AND_KEEPINVENTORY = true;

export const FALLBACK_TOPIC = "general_science";
export const REFRESH_BATCH_SIZE = 8;
