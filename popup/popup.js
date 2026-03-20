const DEFAULT_SETTINGS = {
  apiBaseUrl: "https://api.deepseek.com/v1",
  apiKey: "",
  model: "deepseek-chat",
  apiMode: "chat_completions",
  reasoningEffort: "medium",
  debugEnabled: false,
  systemPrompt:
    "你是一个网页阅读助手。请基于用户选中的内容回答，优先使用简洁清晰的中文。",
};
const SYSTEM_PROMPT_TOKENS = [
  { token: "{title}", label: "页面标题" },
  { token: "{url}", label: "页面完整地址" },
  { token: "{origin}", label: "页面来源" },
  { token: "{domain}", label: "页面域名" },
  { token: "{pathname}", label: "页面路径" },
  { token: "{language}", label: "页面语言" },
  { token: "{selected_text}", label: "当前选中文本" },
];

const saveStatus = document.getElementById("save-status");
const settingsForm = document.getElementById("settings-form");
const promptSuggestions = document.getElementById("prompt-suggestions");
const metricsPanel = document.getElementById("metrics-panel");
const debugPanel = document.getElementById("debug-panel");
const apiConfigToggle = document.getElementById("api-config-toggle");
const apiConfigFields = document.getElementById("api-config-fields");
const apiConfigSummary = document.getElementById("api-config-summary");
const apiConfigBadge = document.getElementById("api-config-badge");
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
const metricCompletionTokens = document.getElementById(
  "metric-completion-tokens",
);
let apiConfigCollapsed = false;
let lastPromptSelection = { start: 0, end: 0 };
let promptSuggestionIndex = 0;
let promptInputComposing = false;

function isDoubaoSeedModel(model = "") {
  return /^doubao-seed/i.test(model.trim());
}

function getPromptSelection() {
  if (document.activeElement !== systemPromptInput) {
    return lastPromptSelection;
  }

  const start = systemPromptInput.selectionStart ?? lastPromptSelection.start;
  const end = systemPromptInput.selectionEnd ?? start;

  return {
    start: Math.min(start, end),
    end: Math.max(start, end),
  };
}

function setPromptSelection(start, end = start, focusInput = false) {
  if (focusInput) {
    systemPromptInput.focus();
  }

  systemPromptInput.setSelectionRange(start, end);
  lastPromptSelection = { start, end };
}

function renderPromptSuggestions() {
  const selection = getPromptSelection();

  if (selection.start !== selection.end) {
    promptSuggestions.hidden = true;
    promptSuggestions.replaceChildren();
    return null;
  }

  const prefix = systemPromptInput.value.slice(0, selection.start);
  const openIndex = prefix.lastIndexOf("{");

  if (openIndex === -1) {
    promptSuggestions.hidden = true;
    promptSuggestions.replaceChildren();
    return null;
  }

  const queryText = prefix.slice(openIndex + 1);

  if (!/^[a-z]*$/i.test(queryText)) {
    promptSuggestions.hidden = true;
    promptSuggestions.replaceChildren();
    return null;
  }

  const beforeOpen = prefix.slice(0, openIndex);

  if (beforeOpen.endsWith("}")) {
    promptSuggestions.hidden = true;
    promptSuggestions.replaceChildren();
    return null;
  }

  const matches = SYSTEM_PROMPT_TOKENS.filter(({ token }) =>
    token.slice(1, -1).toLowerCase().startsWith(queryText.toLowerCase()),
  );

  if (matches.length === 0) {
    promptSuggestions.hidden = true;
    promptSuggestions.replaceChildren();
    return null;
  }

  promptSuggestionIndex = Math.max(
    0,
    Math.min(promptSuggestionIndex, matches.length - 1),
  );
  promptSuggestions.replaceChildren();

  matches.forEach((match, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "prompt-suggestion";
    button.dataset.token = match.token;
    button.classList.toggle(
      "prompt-suggestion-active",
      index === promptSuggestionIndex,
    );

    const title = document.createElement("span");
    title.className = "prompt-suggestion-label";
    title.textContent = match.label;

    const code = document.createElement("code");
    code.textContent = match.token;
    button.append(title, code);
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
    });
    button.addEventListener("click", () => {
      replaceSystemPromptRange(openIndex, selection.end, match.token);
    });
    promptSuggestions.append(button);
  });

  promptSuggestions.hidden = false;
  return { matches, start: openIndex, end: selection.end };
}

function replaceSystemPromptRange(start, end, replacement) {
  const value = systemPromptInput.value;
  systemPromptInput.value = `${value.slice(0, start)}${replacement}${value.slice(end)}`;
  const nextOffset = start + replacement.length;
  setPromptSelection(nextOffset, nextOffset, true);
  renderPromptSuggestions();
}

function findPromptTokenRangeBeforeOffset(offset) {
  for (const { token } of SYSTEM_PROMPT_TOKENS) {
    const start = offset - token.length;

    if (start >= 0 && systemPromptInput.value.slice(start, offset) === token) {
      return { start, end: offset };
    }
  }

  return null;
}

function findPromptTokenRangeAfterOffset(offset) {
  for (const { token } of SYSTEM_PROMPT_TOKENS) {
    const end = offset + token.length;

    if (systemPromptInput.value.slice(offset, end) === token) {
      return { start: offset, end };
    }
  }

  return null;
}

function hasSavedApiKey() {
  return Boolean(apiKeyInput.value.trim());
}

function renderApiConfigCard() {
  const configured = hasSavedApiKey();

  apiConfigToggle.setAttribute("aria-expanded", String(!apiConfigCollapsed));
  apiConfigFields.hidden = apiConfigCollapsed;
  apiConfigToggle.classList.toggle(
    "api-config-toggle-collapsed",
    apiConfigCollapsed,
  );
  apiConfigBadge.textContent = configured ? "已配置" : "未配置";
  apiConfigBadge.classList.toggle("api-config-badge-ready", configured);
  apiConfigSummary.textContent = configured
    ? "API Key 已保存"
    : "首次使用时需要填写 API Key。";
}

function setApiConfigCollapsed(nextValue) {
  apiConfigCollapsed = nextValue;
  renderApiConfigCard();
}

function syncDebugPanelsVisibility() {
  const visible = debugEnabledInput.checked;
  metricsPanel.hidden = !visible;
  debugPanel.hidden = !visible;
}

function syncReasoningEffortAvailability() {
  const enabled = isDoubaoSeedModel(modelInput.value);
  reasoningEffortInput.disabled = !enabled;
  reasoningEffortHint.textContent = enabled
    ? "当前模型支持 reasoning_effort：minimal、low、medium、high。"
    : "仅在 doubao-seed 模型下生效；当前模型不会发送这个参数。";
}

async function loadSettings() {
  const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
  apiKeyInput.value = settings.apiKey || "";
  apiBaseUrlInput.value = settings.apiBaseUrl || DEFAULT_SETTINGS.apiBaseUrl;
  modelInput.value = settings.model || DEFAULT_SETTINGS.model;
  reasoningEffortInput.value =
    settings.reasoningEffort || DEFAULT_SETTINGS.reasoningEffort;
  apiModeInput.value = settings.apiMode || DEFAULT_SETTINGS.apiMode;
  debugEnabledInput.checked = Boolean(settings.debugEnabled);
  systemPromptInput.value =
    settings.systemPrompt || DEFAULT_SETTINGS.systemPrompt;
  lastPromptSelection = {
    start: systemPromptInput.value.length,
    end: systemPromptInput.value.length,
  };
  apiConfigCollapsed = Boolean(settings.apiKey);
  promptSuggestions.hidden = true;
  renderApiConfigCard();
  syncDebugPanelsVisibility();
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
      const details = log?.details
        ? JSON.stringify(log.details, null, 2)
        : "{}";
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
    typeof metrics?.completionTokens === "number"
      ? String(metrics.completionTokens)
      : "-";

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
    `时间：${metrics.startedAt || "-"}`,
  ].join(" | ");
}

async function refreshMetrics() {
  const response = await chrome.runtime.sendMessage({
    type: "GET_LAST_REQUEST_METRICS",
  });

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

  if (debugEnabledInput.checked) {
    await refreshMetrics();
    await refreshDebugLogs();
  }
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
      reasoningEffort:
        reasoningEffortInput.value || DEFAULT_SETTINGS.reasoningEffort,
      apiMode: apiModeInput.value || DEFAULT_SETTINGS.apiMode,
      debugEnabled: debugEnabledInput.checked,
      systemPrompt:
        systemPromptInput.value.trim() || DEFAULT_SETTINGS.systemPrompt,
    });

    setApiConfigCollapsed(hasSavedApiKey());
    saveStatus.textContent = "配置已保存。现在可以刷新网页并重新测试请求。";

    if (debugEnabledInput.checked) {
      await refreshDebugLogs();
    }
  } catch (error) {
    console.error(error);
    saveStatus.textContent = "保存失败，请稍后重试。";
  } finally {
    saveButton.disabled = false;
  }
});

modelInput.addEventListener("input", syncReasoningEffortAvailability);
systemPromptInput.addEventListener("focus", () => {
  setPromptSelection(lastPromptSelection.start, lastPromptSelection.end);
  renderPromptSuggestions();
});
systemPromptInput.addEventListener("mouseup", () => {
  lastPromptSelection = getPromptSelection();
  renderPromptSuggestions();
});
systemPromptInput.addEventListener("keyup", () => {
  lastPromptSelection = getPromptSelection();
  renderPromptSuggestions();
});
systemPromptInput.addEventListener("blur", () => {
  promptInputComposing = false;
  window.setTimeout(() => {
    if (
      document.activeElement !== systemPromptInput &&
      !promptSuggestions.contains(document.activeElement)
    ) {
      promptSuggestions.hidden = true;
    }
  }, 0);
});
systemPromptInput.addEventListener("compositionstart", () => {
  promptInputComposing = true;
});
systemPromptInput.addEventListener("compositionend", () => {
  promptInputComposing = false;
  lastPromptSelection = getPromptSelection();
  window.setTimeout(() => {
    renderPromptSuggestions();
  }, 0);
});
systemPromptInput.addEventListener("keydown", (event) => {
  const selection = getPromptSelection();
  lastPromptSelection = selection;
  const suggestionContext = !promptSuggestions.hidden
    ? renderPromptSuggestions()
    : null;
  const isComposing =
    promptInputComposing || event.isComposing || event.keyCode === 229;

  if (!isComposing && event.key === "ArrowDown" && suggestionContext) {
    event.preventDefault();
    promptSuggestionIndex =
      (promptSuggestionIndex + 1) % suggestionContext.matches.length;
    renderPromptSuggestions();
    return;
  }

  if (!isComposing && event.key === "ArrowUp" && suggestionContext) {
    event.preventDefault();
    promptSuggestionIndex =
      (promptSuggestionIndex - 1 + suggestionContext.matches.length) %
      suggestionContext.matches.length;
    renderPromptSuggestions();
    return;
  }

  if (
    !isComposing &&
    (event.key === "Enter" || event.key === "Tab") &&
    suggestionContext
  ) {
    event.preventDefault();
    replaceSystemPromptRange(
      suggestionContext.start,
      suggestionContext.end,
      suggestionContext.matches[promptSuggestionIndex].token,
    );
    return;
  }

  if (!isComposing && event.key === "Escape" && !promptSuggestions.hidden) {
    event.preventDefault();
    promptSuggestions.hidden = true;
    return;
  }

  if (
    !isComposing &&
    event.key === "Backspace" &&
    selection.start === selection.end
  ) {
    const tokenRange = findPromptTokenRangeBeforeOffset(selection.start);

    if (tokenRange) {
      event.preventDefault();
      replaceSystemPromptRange(tokenRange.start, tokenRange.end, "");
    }
    return;
  }

  if (
    !isComposing &&
    event.key === "Delete" &&
    selection.start === selection.end
  ) {
    const tokenRange = findPromptTokenRangeAfterOffset(selection.start);

    if (tokenRange) {
      event.preventDefault();
      replaceSystemPromptRange(tokenRange.start, tokenRange.end, "");
    }
  }
});
systemPromptInput.addEventListener("input", () => {
  lastPromptSelection = getPromptSelection();
  renderPromptSuggestions();
});
debugEnabledInput.addEventListener("change", () => {
  syncDebugPanelsVisibility();

  if (debugEnabledInput.checked) {
    void refreshMetrics().catch((error) => {
      console.error(error);
      metricsStatus.textContent = "读取性能指标失败";
    });
    void refreshDebugLogs().catch((error) => {
      console.error(error);
      debugStatus.textContent = "刷新日志失败，请稍后重试。";
    });
  }
});
apiConfigToggle.addEventListener("click", () => {
  setApiConfigCollapsed(!apiConfigCollapsed);
});

refreshLogsButton.addEventListener("click", () => {
  void refreshDebugLogs().catch((error) => {
    console.error(error);
    debugStatus.textContent = "刷新日志失败，请稍后重试。";
  });
});

clearLogsButton.addEventListener("click", async () => {
  debugStatus.textContent = "正在清空日志...";

  try {
    const response = await chrome.runtime.sendMessage({
      type: "CLEAR_DEBUG_LOGS",
    });

    if (!response?.ok) {
      throw new Error(response?.error || "清空日志失败");
    }

    debugLogOutput.textContent = "暂无日志";
    debugStatus.textContent = "调试日志已清空。";
  } catch (error) {
    console.error(error);
    debugStatus.textContent =
      error instanceof Error ? error.message : "清空日志失败";
  }
});

init().catch((error) => {
  console.error(error);
  saveStatus.textContent = "初始化失败，请刷新扩展后重试。";
});
