async function saveLastRequestMetrics(metrics) {
  await chrome.storage.local.set({
    [LAST_REQUEST_METRICS_KEY]: metrics
  });
}

function shouldCollectDebugData(settings) {
  return Boolean(settings?.debugEnabled);
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

function extractChatCompletionsDelta(data) {
  const content = data?.choices?.[0]?.delta?.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => item?.text || "")
      .filter(Boolean)
      .join("");
  }

  return "";
}

function extractChatCompletionsReasoningDelta(data) {
  const reasoningContent = data?.choices?.[0]?.delta?.reasoning_content;

  if (typeof reasoningContent === "string") {
    return reasoningContent;
  }

  if (Array.isArray(reasoningContent)) {
    return reasoningContent
      .map((item) => item?.text || "")
      .filter(Boolean)
      .join("");
  }

  return "";
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

async function readJsonResponse(response) {
  const responseText = await response.text();
  return responseText ? JSON.parse(responseText) : {};
}

function buildPerformanceMetrics({
  startedAtIso,
  endpoint,
  endpointMode,
  model,
  totalLatencyMs,
  firstChunkLatencyMs,
  completionTokens,
  status,
  firstTokenLatencyApproximate = true
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
    firstTokenLatencyApproximate,
    completionTokens: typeof completionTokens === "number" ? completionTokens : null,
    tokenSpeed
  };
}

function safePortPostMessage(port, payload) {
  try {
    port.postMessage(payload);
    return true;
  } catch {
    return false;
  }
}

function normalizeSseLineEndings(text) {
  return String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function splitSseEvents(buffer) {
  const normalizedBuffer = normalizeSseLineEndings(buffer);
  const events = [];
  let remaining = normalizedBuffer;

  while (remaining.includes("\n\n")) {
    const splitIndex = remaining.indexOf("\n\n");
    events.push(remaining.slice(0, splitIndex));
    remaining = remaining.slice(splitIndex + 2);
  }

  return {
    events,
    remaining
  };
}

function extractSseEventData(rawEvent) {
  const dataLines = rawEvent
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);

  if (dataLines.length === 0) {
    return "";
  }

  return dataLines.join("\n");
}

async function streamChatCompletions(endpoint, settings, apiKey, messages, port) {
  const model = (settings.model || DEFAULT_SETTINGS.model).trim();
  const collectDebugData = shouldCollectDebugData(settings);
  const startedAtIso = collectDebugData ? new Date().toISOString() : "";
  const startedAtPerf = collectDebugData ? performance.now() : 0;
  const payload = {
    model,
    stream: true,
    messages
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

  if (!response.ok) {
    let data;

    if (collectDebugData) {
      const timedResult = await readJsonResponseWithTiming(response, startedAtPerf);
      data = timedResult.data;

      await saveLastRequestMetrics(
        buildPerformanceMetrics({
          startedAtIso,
          endpoint,
          endpointMode: "chat/completions",
          model,
          totalLatencyMs: timedResult.totalLatencyMs,
          firstChunkLatencyMs: timedResult.firstChunkLatencyMs,
          completionTokens: data?.usage?.completion_tokens ?? null,
          status: "error",
          firstTokenLatencyApproximate: true
        })
      );
    } else {
      data = await readJsonResponse(response);
    }

    throw createHttpError(response, data, endpoint);
  }

  if (!response.body) {
    throw new Error("当前服务未返回可流式读取的响应体。");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";
  let usage = null;
  let firstTokenLatencyMs = null;
  let firstTransportChunkLatencyMs = null;
  let firstReasoningChunkLatencyMs = null;
  let firstContentChunkLatencyMs = null;
  let reasoningChunkCount = 0;
  let contentChunkCount = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    if (
      collectDebugData &&
      firstTransportChunkLatencyMs === null &&
      value &&
      value.length > 0
    ) {
      firstTransportChunkLatencyMs = Math.round(performance.now() - startedAtPerf);
      await appendDebugLog("info", "stream_first_transport_chunk", {
        endpoint,
        latencyMs: firstTransportChunkLatencyMs,
        bytes: value.length
      });
    }

    buffer += decoder.decode(value, { stream: true });
    const parsed = splitSseEvents(buffer);
    buffer = parsed.remaining;

    for (const rawEvent of parsed.events) {
      const dataText = extractSseEventData(rawEvent);

      if (!dataText) {
        continue;
      }

      if (dataText === "[DONE]") {
        continue;
      }

      let chunk;

      try {
        chunk = JSON.parse(dataText);
      } catch {
        continue;
      }

      if (collectDebugData && chunk?.usage) {
        usage = chunk.usage;
      }

      const reasoningDeltaText = extractChatCompletionsReasoningDelta(chunk);
      const deltaText = extractChatCompletionsDelta(chunk);

      if (reasoningDeltaText) {
        reasoningChunkCount += 1;

        if (collectDebugData && firstReasoningChunkLatencyMs === null) {
          firstReasoningChunkLatencyMs = Math.round(performance.now() - startedAtPerf);
          await appendDebugLog("info", "stream_first_reasoning_chunk", {
            endpoint,
            latencyMs: firstReasoningChunkLatencyMs,
            preview: previewText(reasoningDeltaText, 40)
          });
        }

        if (
          !safePortPostMessage(port, {
            type: "reasoning",
            delta: reasoningDeltaText
          })
        ) {
          return {
            answer,
            endpointMode: "chat/completions"
          };
        }
      }

      if (!deltaText) {
        continue;
      }

      contentChunkCount += 1;

      if (collectDebugData && firstTokenLatencyMs === null) {
        firstTokenLatencyMs = Math.round(performance.now() - startedAtPerf);
      }

      if (collectDebugData && firstContentChunkLatencyMs === null) {
        firstContentChunkLatencyMs = Math.round(performance.now() - startedAtPerf);
        await appendDebugLog("info", "stream_first_content_chunk", {
          endpoint,
          latencyMs: firstContentChunkLatencyMs,
          preview: previewText(deltaText, 40)
        });
      }

      answer += deltaText;

      if (
        !safePortPostMessage(port, {
          type: "chunk",
          delta: deltaText
        })
      ) {
        return {
          answer,
          endpointMode: "chat/completions"
        };
      }
    }
  }

  if (buffer.trim()) {
    const dataText = extractSseEventData(buffer);

    if (dataText && dataText !== "[DONE]") {
      try {
        const chunk = JSON.parse(dataText);

        if (collectDebugData && chunk?.usage) {
          usage = chunk.usage;
        }

        const deltaText = extractChatCompletionsDelta(chunk);
        const reasoningDeltaText = extractChatCompletionsReasoningDelta(chunk);

        if (reasoningDeltaText) {
          reasoningChunkCount += 1;

          if (collectDebugData && firstReasoningChunkLatencyMs === null) {
            firstReasoningChunkLatencyMs = Math.round(performance.now() - startedAtPerf);
            await appendDebugLog("info", "stream_first_reasoning_chunk", {
              endpoint,
              latencyMs: firstReasoningChunkLatencyMs,
              preview: previewText(reasoningDeltaText, 40)
            });
          }

          if (
            !safePortPostMessage(port, {
              type: "reasoning",
              delta: reasoningDeltaText
            })
          ) {
            return {
              answer,
              endpointMode: "chat/completions"
            };
          }
        }

        if (deltaText) {
          contentChunkCount += 1;

          if (collectDebugData && firstTokenLatencyMs === null) {
            firstTokenLatencyMs = Math.round(performance.now() - startedAtPerf);
          }

          if (collectDebugData && firstContentChunkLatencyMs === null) {
            firstContentChunkLatencyMs = Math.round(performance.now() - startedAtPerf);
            await appendDebugLog("info", "stream_first_content_chunk", {
              endpoint,
              latencyMs: firstContentChunkLatencyMs,
              preview: previewText(deltaText, 40)
            });
          }

          answer += deltaText;
          safePortPostMessage(port, {
            type: "chunk",
            delta: deltaText
          });
        }
      } catch {}
    }
  }

  answer = answer.trim();

  if (!answer) {
    throw new Error(`AI 已返回结果，但没有解析出可展示的文本。(${endpoint})`);
  }

  if (collectDebugData) {
    const totalLatencyMs = Math.round(performance.now() - startedAtPerf);

    await appendDebugLog("info", "stream_chunk_summary", {
      endpoint,
      totalLatencyMs,
      firstTransportChunkLatencyMs,
      firstReasoningChunkLatencyMs,
      firstContentChunkLatencyMs,
      reasoningChunkCount,
      contentChunkCount,
      answerPreview: previewText(answer, 80)
    });

    await saveLastRequestMetrics(
      buildPerformanceMetrics({
        startedAtIso,
        endpoint,
        endpointMode: "chat/completions",
        model,
        totalLatencyMs,
        firstChunkLatencyMs: firstTokenLatencyMs,
        completionTokens: usage?.completion_tokens ?? null,
        status: "success",
        firstTokenLatencyApproximate: false
      })
    );
  }

  return {
    answer,
    endpointMode: "chat/completions"
  };
}

async function requestResponses(endpoint, settings, apiKey, systemPrompt, promptText) {
  const collectDebugData = shouldCollectDebugData(settings);
  const startedAtIso = collectDebugData ? new Date().toISOString() : "";
  const startedAtPerf = collectDebugData ? performance.now() : 0;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: (settings.model || DEFAULT_SETTINGS.model).trim(),
      instructions: systemPrompt,
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

  const timingResult = collectDebugData
    ? await readJsonResponseWithTiming(response, startedAtPerf)
    : null;
  const data = timingResult ? timingResult.data : await readJsonResponse(response);

  if (!response.ok) {
    if (collectDebugData) {
      await saveLastRequestMetrics(
        buildPerformanceMetrics({
          startedAtIso,
          endpoint,
          endpointMode: "responses",
          model: (settings.model || DEFAULT_SETTINGS.model).trim(),
          totalLatencyMs: timingResult.totalLatencyMs,
          firstChunkLatencyMs: timingResult.firstChunkLatencyMs,
          completionTokens: data?.usage?.output_tokens ?? null,
          status: "error"
        })
      );
    }
    throw createHttpError(response, data, endpoint);
  }

  const answer = extractResponsesText(data);

  if (!answer) {
    throw new Error(`AI 已返回结果，但没有解析出可展示的文本。(${endpoint})`);
  }

  if (collectDebugData) {
    await saveLastRequestMetrics(
      buildPerformanceMetrics({
        startedAtIso,
        endpoint,
        endpointMode: "responses",
        model: (settings.model || DEFAULT_SETTINGS.model).trim(),
        totalLatencyMs: timingResult.totalLatencyMs,
        firstChunkLatencyMs: timingResult.firstChunkLatencyMs,
        completionTokens: data?.usage?.output_tokens ?? null,
        status: "success"
      })
    );
  }

  return {
    answer,
    endpointMode: "responses"
  };
}

async function requestChatCompletions(endpoint, settings, apiKey, promptText) {
  const model = (settings.model || DEFAULT_SETTINGS.model).trim();
  const collectDebugData = shouldCollectDebugData(settings);
  const startedAtIso = collectDebugData ? new Date().toISOString() : "";
  const startedAtPerf = collectDebugData ? performance.now() : 0;
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

  const timingResult = collectDebugData
    ? await readJsonResponseWithTiming(response, startedAtPerf)
    : null;
  const data = timingResult ? timingResult.data : await readJsonResponse(response);

  if (!response.ok) {
    if (collectDebugData) {
      await saveLastRequestMetrics(
        buildPerformanceMetrics({
          startedAtIso,
          endpoint,
          endpointMode: "chat/completions",
          model,
          totalLatencyMs: timingResult.totalLatencyMs,
          firstChunkLatencyMs: timingResult.firstChunkLatencyMs,
          completionTokens: data?.usage?.completion_tokens ?? null,
          status: "error"
        })
      );
    }
    throw createHttpError(response, data, endpoint);
  }

  const answer = extractChatCompletionsText(data);

  if (!answer) {
    throw new Error(`AI 已返回结果，但没有解析出可展示的文本。(${endpoint})`);
  }

  if (collectDebugData) {
    await saveLastRequestMetrics(
      buildPerformanceMetrics({
        startedAtIso,
        endpoint,
        endpointMode: "chat/completions",
        model,
        totalLatencyMs: timingResult.totalLatencyMs,
        firstChunkLatencyMs: timingResult.firstChunkLatencyMs,
        completionTokens: data?.usage?.completion_tokens ?? null,
        status: "success"
      })
    );
  }

  return {
    answer,
    endpointMode: "chat/completions"
  };
}
