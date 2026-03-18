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

const tabTitle = document.getElementById("tab-title");
const tabUrl = document.getElementById("tab-url");
const pageStatus = document.getElementById("page-status");
const saveStatus = document.getElementById("save-status");
const settingsForm = document.getElementById("settings-form");
const apiKeyInput = document.getElementById("api-key");
const apiBaseUrlInput = document.getElementById("api-base-url");
const modelInput = document.getElementById("model");
const reasoningEffortInput = document.getElementById("reasoning-effort");
const reasoningEffortHint = document.getElementById("reasoning-effort-hint");
const apiModeInput = document.getElementById("api-mode");
const debugEnabledInput = document.getElementById("debug-enabled");
const systemPromptInput = document.getElementById("system-prompt");
const saveButton = document.getElementById("save-button");
const debugStatus = document.getElementById("debug-status");
const debugLogOutput = document.getElementById("debug-log-output");
const refreshLogsButton = document.getElementById("refresh-logs-button");
const clearLogsButton = document.getElementById("clear-logs-button");
const metricsStatus = document.getElementById("metrics-status");
const metricsMeta = document.getElementById("metrics-meta");
const metricFirstToken = document.getElementById("metric-first-token");
const metricTokenSpeed = document.getElementById("metric-token-speed");
const metricTotalLatency = document.getElementById("metric-total-latency");
const metricCompletionTokens = document.getElementById("metric-completion-tokens");

function isDoubaoSeedModel(model = "") {
  return /^doubao-seed/i.test(model.trim());
}

function syncReasoningEffortAvailability() {
  const enabled = isDoubaoSeedModel(modelInput.value);
  reasoningEffortInput.disabled = !enabled;
  reasoningEffortHint.textContent = enabled
    ? "当前模型支持 reasoning_effort：minimal、low、medium、high。"
    : "仅在 doubao-seed 模型下生效；当前模型不会发送这个参数。";
}

function isRestrictedUrl(url = "") {
  return (
    !url ||
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("edge://")
  );
}

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function loadSettings() {
  const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
  apiKeyInput.value = settings.apiKey || "";
  apiBaseUrlInput.value = settings.apiBaseUrl || DEFAULT_SETTINGS.apiBaseUrl;
  modelInput.value = settings.model || DEFAULT_SETTINGS.model;
  reasoningEffortInput.value = settings.reasoningEffort || DEFAULT_SETTINGS.reasoningEffort;
  apiModeInput.value = settings.apiMode || DEFAULT_SETTINGS.apiMode;
  debugEnabledInput.checked = Boolean(settings.debugEnabled);
  systemPromptInput.value = settings.systemPrompt || DEFAULT_SETTINGS.systemPrompt;
  syncReasoningEffortAvailability();
}

function formatDebugLogs(logs) {
  if (!Array.isArray(logs) || logs.length === 0) {
    return "暂无日志";
  }

  return [...logs]
    .reverse()
    .map((log) => {
      const timestamp = log?.time || "-";
      const level = (log?.level || "info").toUpperCase();
      const event = log?.event || "unknown";
      const details = log?.details ? JSON.stringify(log.details, null, 2) : "{}";
      return `[${timestamp}] ${level} ${event}\n${details}`;
    })
    .join("\n\n");
}

function formatDuration(ms) {
  return typeof ms === "number" ? `${ms} ms` : "-";
}

function formatTokenSpeed(speed) {
  return typeof speed === "number" ? `${speed} tok/s` : "-";
}

function renderMetrics(metrics) {
  metricFirstToken.textContent =
    typeof metrics?.firstTokenLatencyMs === "number"
      ? `${metrics.firstTokenLatencyMs} ms`
      : "-";
  metricTokenSpeed.textContent = formatTokenSpeed(metrics?.tokenSpeed);
  metricTotalLatency.textContent = formatDuration(metrics?.totalLatencyMs);
  metricCompletionTokens.textContent =
    typeof metrics?.completionTokens === "number" ? String(metrics.completionTokens) : "-";

  if (!metrics) {
    metricsStatus.textContent = "这里会显示最近一次 AI 请求的性能指标。";
    metricsMeta.textContent = "暂无请求记录";
    return;
  }

  metricsStatus.textContent = metrics.firstTokenLatencyApproximate
    ? "首 token 延迟按首个响应分块近似计算；token 速度基于 completion tokens 计算。"
    : "首 token 延迟来自流式响应；token 速度基于 completion tokens 计算。";
  metricsMeta.textContent = [
    `模型：${metrics.model || "-"}`,
    `接口：${metrics.endpointMode || "-"}`,
    `状态：${metrics.status || "-"}`,
    `时间：${metrics.startedAt || "-"}`
  ].join(" | ");
}

async function refreshMetrics() {
  const response = await chrome.runtime.sendMessage({ type: "GET_LAST_REQUEST_METRICS" });

  if (!response?.ok) {
    metricFirstToken.textContent = "-";
    metricTokenSpeed.textContent = "-";
    metricTotalLatency.textContent = "-";
    metricCompletionTokens.textContent = "-";
    metricsStatus.textContent = response?.error || "读取性能指标失败";
    metricsMeta.textContent = "暂无可展示数据";
    return;
  }

  renderMetrics(response.metrics || null);
}

async function refreshDebugLogs() {
  debugStatus.textContent = debugEnabledInput.checked
    ? "正在读取最近日志..."
    : "Debug 模式未开启，开启后会记录新的请求日志。";

  const response = await chrome.runtime.sendMessage({ type: "GET_DEBUG_LOGS" });

  if (!response?.ok) {
    debugStatus.textContent = response?.error || "读取调试日志失败";
    return;
  }

  debugLogOutput.textContent = formatDebugLogs(response.logs);
  debugStatus.textContent = debugEnabledInput.checked
    ? "已显示最近请求日志。日志不会保存完整 API Key。"
    : "Debug 模式未开启，下面显示的是之前保留下来的日志。";
}

async function init() {
  await loadSettings();
  await refreshMetrics();
  await refreshDebugLogs();

  const tab = await getCurrentTab();

  tabTitle.textContent = tab?.title || "未识别页面";
  tabUrl.textContent = tab?.url || "无可用地址";

  if (!tab?.id || isRestrictedUrl(tab.url)) {
    pageStatus.textContent = "当前页面不支持注入，请切换到普通网页后再试。";
    return;
  }

  pageStatus.textContent = "当前页面支持滑词问 AI。如果这是刚加载的扩展，记得先刷新页面。";
}

settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  saveButton.disabled = true;
  saveStatus.textContent = "正在保存配置...";

  try {
    await chrome.storage.local.set({
      apiKey: apiKeyInput.value.trim(),
      apiBaseUrl: apiBaseUrlInput.value.trim() || DEFAULT_SETTINGS.apiBaseUrl,
      model: modelInput.value.trim() || DEFAULT_SETTINGS.model,
      reasoningEffort: reasoningEffortInput.value || DEFAULT_SETTINGS.reasoningEffort,
      apiMode: apiModeInput.value || DEFAULT_SETTINGS.apiMode,
      debugEnabled: debugEnabledInput.checked,
      systemPrompt: systemPromptInput.value.trim() || DEFAULT_SETTINGS.systemPrompt
    });

    saveStatus.textContent = "配置已保存。现在可以刷新网页并重新测试请求。";
    await refreshDebugLogs();
  } catch (error) {
    console.error(error);
    saveStatus.textContent = "保存失败，请稍后重试。";
  } finally {
    saveButton.disabled = false;
  }
});

modelInput.addEventListener("input", syncReasoningEffortAvailability);

refreshLogsButton.addEventListener("click", () => {
  void refreshDebugLogs().catch((error) => {
    console.error(error);
    debugStatus.textContent = "刷新日志失败，请稍后重试。";
  });
});

clearLogsButton.addEventListener("click", async () => {
  debugStatus.textContent = "正在清空日志...";

  try {
    const response = await chrome.runtime.sendMessage({ type: "CLEAR_DEBUG_LOGS" });

    if (!response?.ok) {
      throw new Error(response?.error || "清空日志失败");
    }

    debugLogOutput.textContent = "暂无日志";
    debugStatus.textContent = "调试日志已清空。";
  } catch (error) {
    console.error(error);
    debugStatus.textContent = error instanceof Error ? error.message : "清空日志失败";
  }
});

init().catch((error) => {
  console.error(error);
  pageStatus.textContent = "初始化失败，请刷新扩展后重试。";
});
