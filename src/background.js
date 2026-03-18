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

async function appendDebugLog(level, event, details = {}) {
  const stored = await chrome.storage.local.get({
    debugEnabled: DEFAULT_SETTINGS.debugEnabled,
    [DEBUG_LOGS_KEY]: []
  });

  if (!stored.debugEnabled) {
    return;
  }

  const nextLogs = [
    ...stored[DEBUG_LOGS_KEY],
    {
      time: new Date().toISOString(),
      level,
      event,
      details
    }
  ].slice(-MAX_DEBUG_LOGS);

  await chrome.storage.local.set({
    [DEBUG_LOGS_KEY]: nextLogs
  });
}

async function clearDebugLogs() {
  await chrome.storage.local.set({
    [DEBUG_LOGS_KEY]: []
  });
}

async function saveLastRequestMetrics(metrics) {
  await chrome.storage.local.set({
    [LAST_REQUEST_METRICS_KEY]: metrics
  });
}

function normalizeBaseUrl(baseUrl) {
  return (baseUrl || DEFAULT_SETTINGS.apiBaseUrl).trim().replace(/\/+$/, "");
}

function isDoubaoSeedModel(model) {
  return /^doubao-seed/i.test(String(model || "").trim());
}

function resolveEndpoint(baseUrl, mode) {
  const normalized = normalizeBaseUrl(baseUrl);

  if (mode === "responses") {
    if (normalized.endsWith("/responses")) {
      return normalized;
    }

    if (normalized.endsWith("/chat/completions")) {
      return normalized.replace(/\/chat\/completions$/, "/responses");
    }

    return `${normalized}/responses`;
  }

  if (normalized.endsWith("/chat/completions")) {
    return normalized;
  }

  if (normalized.endsWith("/responses")) {
    return normalized.replace(/\/responses$/, "/chat/completions");
  }

  return `${normalized}/chat/completions`;
}

function extractResponsesText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const textParts = [];

  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content.text === "string") {
        textParts.push(content.text);
      }
    }
  }

  return textParts.join("\n\n").trim();
}

function extractChatCompletionsText(data) {
  const content = data?.choices?.[0]?.message?.content;

  if (typeof content === "string" && content.trim()) {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => item?.text || "")
      .filter(Boolean)
      .join("\n\n")
      .trim();
  }

  return "";
}

function trimSelection(text) {
  const normalized = (text || "").trim();
  return normalized.length > 12000 ? normalized.slice(0, 12000) : normalized;
}

function normalizeConversationHistory(conversationHistory) {
  if (!Array.isArray(conversationHistory)) {
    return [];
  }

  return conversationHistory
    .filter((message) => ["user", "assistant"].includes(message?.role))
    .map((message) => ({
      role: message.role,
      content: String(message.content || "").trim()
    }))
    .filter((message) => message.content);
}

function getEffectiveConversationHistory(message) {
  const history = normalizeConversationHistory(message.conversationHistory);

  if (history.length > 0) {
    return history;
  }

  const question = (message.question || "").trim() || "请解释这段内容，并告诉我重点。";
  return [
    {
      role: "user",
      content: question
    }
  ];
}

function buildPromptText(selectedText, conversationHistory) {
  const transcript = conversationHistory
    .map((message) => `${message.role === "assistant" ? "Assistant" : "User"}: ${message.content}`)
    .join("\n\n");

  return [
    "下面是我在网页中选中的内容：",
    selectedText,
    "",
    "请你始终围绕这段内容和下面的对话上下文回答。",
    "",
    transcript
  ].join("\n");
}

function buildChatMessages(systemPrompt, selectedText, conversationHistory) {
  return [
    {
      role: "system",
      content: systemPrompt
    },
    {
      role: "system",
      content:
        "用户已经在网页中选中了一段内容。请始终围绕这段内容和后续追问来回答，不要脱离上下文。"
    },
    {
      role: "user",
      content: `选中文本：\n${selectedText}`
    },
    ...conversationHistory.map((message) => ({
      role: message.role,
      content: message.content
    }))
  ];
}

function createHttpError(response, data, endpoint) {
  const messageText =
    data?.error?.message ||
    data?.message ||
    `AI 请求失败，状态码 ${response.status}`;
  const error = new Error(`${messageText} (${endpoint})`);
  error.status = response.status;
  return error;
}

async function readJsonResponseWithTiming(response, startedAtPerf) {
  const decoder = new TextDecoder();
  let responseText = "";
  let firstChunkLatencyMs = null;

  if (response.body) {
    const reader = response.body.getReader();

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      if (firstChunkLatencyMs === null && value && value.length > 0) {
        firstChunkLatencyMs = Math.round(performance.now() - startedAtPerf);
      }

      responseText += decoder.decode(value, { stream: true });
    }

    responseText += decoder.decode();
  } else {
    responseText = await response.text();
    firstChunkLatencyMs = Math.round(performance.now() - startedAtPerf);
  }

  return {
    data: responseText ? JSON.parse(responseText) : {},
    totalLatencyMs: Math.round(performance.now() - startedAtPerf),
    firstChunkLatencyMs
  };
}

function buildPerformanceMetrics({
  startedAtIso,
  endpoint,
  endpointMode,
  model,
  totalLatencyMs,
  firstChunkLatencyMs,
  completionTokens,
  status
}) {
  const generationMs =
    typeof firstChunkLatencyMs === "number" && totalLatencyMs > firstChunkLatencyMs
      ? totalLatencyMs - firstChunkLatencyMs
      : null;
  const tokenSpeed =
    typeof completionTokens === "number" &&
    typeof generationMs === "number" &&
    generationMs > 0
      ? Number((completionTokens / (generationMs / 1000)).toFixed(2))
      : null;

  return {
    startedAt: startedAtIso,
    endpoint,
    endpointMode,
    model,
    status,
    totalLatencyMs,
    firstTokenLatencyMs: firstChunkLatencyMs,
    firstTokenLatencyApproximate: true,
    completionTokens: typeof completionTokens === "number" ? completionTokens : null,
    tokenSpeed
  };
}

async function requestResponses(endpoint, settings, apiKey, promptText) {
  const startedAtIso = new Date().toISOString();
  const startedAtPerf = performance.now();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: (settings.model || DEFAULT_SETTINGS.model).trim(),
      instructions: (settings.systemPrompt || DEFAULT_SETTINGS.systemPrompt).trim(),
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: promptText
            }
          ]
        }
      ]
    })
  });

  const { data, totalLatencyMs, firstChunkLatencyMs } = await readJsonResponseWithTiming(
    response,
    startedAtPerf
  );

  if (!response.ok) {
    await saveLastRequestMetrics(
      buildPerformanceMetrics({
        startedAtIso,
        endpoint,
        endpointMode: "responses",
        model: (settings.model || DEFAULT_SETTINGS.model).trim(),
        totalLatencyMs,
        firstChunkLatencyMs,
        completionTokens: data?.usage?.output_tokens ?? null,
        status: "error"
      })
    );
    throw createHttpError(response, data, endpoint);
  }

  const answer = extractResponsesText(data);

  if (!answer) {
    throw new Error(`AI 已返回结果，但没有解析出可展示的文本。(${endpoint})`);
  }

  await saveLastRequestMetrics(
    buildPerformanceMetrics({
      startedAtIso,
      endpoint,
      endpointMode: "responses",
      model: (settings.model || DEFAULT_SETTINGS.model).trim(),
      totalLatencyMs,
      firstChunkLatencyMs,
      completionTokens: data?.usage?.output_tokens ?? null,
      status: "success"
    })
  );

  return {
    answer,
    endpointMode: "responses"
  };
}

async function requestChatCompletions(endpoint, settings, apiKey, promptText) {
  const model = (settings.model || DEFAULT_SETTINGS.model).trim();
  const startedAtIso = new Date().toISOString();
  const startedAtPerf = performance.now();
  const payload = {
    model,
    messages: promptText
  };

  if (
    isDoubaoSeedModel(model) &&
    ["minimal", "low", "medium", "high"].includes(settings.reasoningEffort)
  ) {
    payload.reasoning_effort = settings.reasoningEffort;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  const { data, totalLatencyMs, firstChunkLatencyMs } = await readJsonResponseWithTiming(
    response,
    startedAtPerf
  );

  if (!response.ok) {
    await saveLastRequestMetrics(
      buildPerformanceMetrics({
        startedAtIso,
        endpoint,
        endpointMode: "chat/completions",
        model,
        totalLatencyMs,
        firstChunkLatencyMs,
        completionTokens: data?.usage?.completion_tokens ?? null,
        status: "error"
      })
    );
    throw createHttpError(response, data, endpoint);
  }

  const answer = extractChatCompletionsText(data);

  if (!answer) {
    throw new Error(`AI 已返回结果，但没有解析出可展示的文本。(${endpoint})`);
  }

  await saveLastRequestMetrics(
    buildPerformanceMetrics({
      startedAtIso,
      endpoint,
      endpointMode: "chat/completions",
      model,
      totalLatencyMs,
      firstChunkLatencyMs,
      completionTokens: data?.usage?.completion_tokens ?? null,
      status: "success"
    })
  );

  return {
    answer,
    endpointMode: "chat/completions"
  };
}

async function askAI(message) {
  const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
  const apiKey = (settings.apiKey || "").trim();
  const selectedText = trimSelection(message.selectedText);
  const conversationHistory = getEffectiveConversationHistory(message);

  if (!selectedText) {
    await appendDebugLog("warn", "validation_failed", {
      reason: "missing_selected_text"
    });
    throw new Error("没有检测到选中文本。");
  }

  if (!apiKey) {
    await appendDebugLog("warn", "validation_failed", {
      reason: "missing_api_key"
    });
    throw new Error("请先在插件弹窗中配置 API Key。");
  }

  const systemPrompt = (settings.systemPrompt || DEFAULT_SETTINGS.systemPrompt).trim();
  const promptText = buildPromptText(selectedText, conversationHistory);
  const chatMessages = buildChatMessages(systemPrompt, selectedText, conversationHistory);
  const requestMode = settings.apiMode || DEFAULT_SETTINGS.apiMode;
  const modes =
    requestMode === "responses"
      ? ["responses"]
      : requestMode === "chat_completions"
        ? ["chat_completions"]
        : ["responses", "chat_completions"];

  const errors = [];
  let result = null;

  await appendDebugLog("info", "ask_ai_started", {
    apiBaseUrl: normalizeBaseUrl(settings.apiBaseUrl),
    apiKeyMasked: maskApiKey(apiKey),
    model: (settings.model || DEFAULT_SETTINGS.model).trim(),
    requestMode,
    reasoningEffort: isDoubaoSeedModel(settings.model) ? settings.reasoningEffort : null,
    selectedLength: selectedText.length,
    selectedPreview: previewText(selectedText),
    conversationLength: conversationHistory.length,
    lastTurnPreview: previewText(conversationHistory[conversationHistory.length - 1]?.content || "")
  });

  for (const mode of modes) {
    const endpoint = resolveEndpoint(settings.apiBaseUrl, mode);

    try {
      await appendDebugLog("info", "request_attempt", {
        endpoint,
        mode
      });

      result =
        mode === "responses"
          ? await requestResponses(endpoint, settings, apiKey, promptText)
          : await requestChatCompletions(endpoint, settings, apiKey, chatMessages);

      await appendDebugLog("info", "request_succeeded", {
        endpoint,
        mode,
        resolvedMode: result.endpointMode,
        answerLength: result.answer.length
      });

      break;
    } catch (error) {
      errors.push(error);

      await appendDebugLog("error", "request_failed", {
        endpoint,
        mode,
        status: error?.status || null,
        message: error instanceof Error ? error.message : "未知错误"
      });

      if (requestMode !== "auto") {
        throw error;
      }

      if (error?.status !== 404) {
        throw error;
      }

      await appendDebugLog("warn", "fallback_after_404", {
        failedMode: mode,
        nextMode: mode === "responses" ? "chat_completions" : null
      });
    }
  }

  if (!result) {
    throw errors[errors.length - 1] || new Error("AI 请求失败。");
  }

  return {
    answer: result.answer,
    model: (settings.model || DEFAULT_SETTINGS.model).trim(),
    endpointMode: result.endpointMode
  };
}

chrome.runtime.onInstalled.addListener(() => {
  void ensureDefaults();
});

chrome.runtime.onStartup.addListener(() => {
  void ensureDefaults();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_LAST_REQUEST_METRICS") {
    chrome.storage.local
      .get({ [LAST_REQUEST_METRICS_KEY]: null })
      .then((stored) => {
        sendResponse({ ok: true, metrics: stored[LAST_REQUEST_METRICS_KEY] });
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "读取性能指标失败"
        });
      });

    return true;
  }

  if (message?.type === "GET_DEBUG_LOGS") {
    chrome.storage.local
      .get({ [DEBUG_LOGS_KEY]: [] })
      .then((stored) => {
        sendResponse({ ok: true, logs: stored[DEBUG_LOGS_KEY] || [] });
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "读取调试日志失败"
        });
      });

    return true;
  }

  if (message?.type === "CLEAR_DEBUG_LOGS") {
    clearDebugLogs()
      .then(() => {
        sendResponse({ ok: true });
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "清空调试日志失败"
        });
      });

    return true;
  }

  if (message?.type !== "ASK_AI") {
    return;
  }

  askAI(message)
    .then((result) => {
      sendResponse({ ok: true, ...result });
    })
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "未知错误"
      });
    });

  return true;
});
