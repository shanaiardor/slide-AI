const DEFAULT_SETTINGS = {
  apiBaseUrl: "https://api.deepseek.com/v1",
  apiKey: "",
  model: "deepseek-chat",
  apiMode: "chat_completions",
  reasoningEffort: "medium",
  debugEnabled: false,
  systemPrompt:
    "你是一个网页阅读助手。请基于用户选中的内容回答，优先使用简洁清晰的中文。"
};

const DEBUG_LOGS_KEY = "debugLogs";
const LAST_REQUEST_METRICS_KEY = "lastRequestMetrics";
const MAX_DEBUG_LOGS = 80;
const SYSTEM_PROMPT_VARIABLES = Object.freeze([
  "title",
  "url",
  "origin",
  "domain",
  "pathname",
  "language"
]);

async function ensureDefaults() {
  const stored = await chrome.storage.local.get(null);
  const patch = {};

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    if (typeof stored[key] === "undefined") {
      patch[key] = value;
    }
  }

  if (!Array.isArray(stored[DEBUG_LOGS_KEY])) {
    patch[DEBUG_LOGS_KEY] = [];
  }

  if (typeof stored[LAST_REQUEST_METRICS_KEY] === "undefined") {
    patch[LAST_REQUEST_METRICS_KEY] = null;
  }

  if (Object.keys(patch).length > 0) {
    await chrome.storage.local.set(patch);
  }
}

function maskApiKey(apiKey) {
  const trimmed = (apiKey || "").trim();

  if (!trimmed) {
    return "";
  }

  if (trimmed.length <= 8) {
    return `${trimmed.slice(0, 2)}***`;
  }

  return `${trimmed.slice(0, 4)}***${trimmed.slice(-4)}`;
}

function previewText(text, maxLength = 120) {
  const normalized = (text || "").replace(/\s+/g, " ").trim();

  if (!normalized) {
    return "";
  }

  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength)}...`
    : normalized;
}

function normalizeBaseUrl(baseUrl) {
  return (baseUrl || DEFAULT_SETTINGS.apiBaseUrl).trim().replace(/\/+$/, "");
}

function isDoubaoSeedModel(model) {
  return /^doubao-seed/i.test(String(model || "").trim());
}
