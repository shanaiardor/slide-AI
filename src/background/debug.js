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
