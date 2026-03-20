import { marked } from "marked";
import { createBundledHighlighter } from "@shikijs/core";
import { createJavaScriptRegexEngine } from "shiki";
import { renderCodeWithTokens } from "stream-markdown";

import * as bashLang from "@shikijs/langs/bash";
import * as cssLang from "@shikijs/langs/css";
import * as htmlLang from "@shikijs/langs/html";
import * as javascriptLang from "@shikijs/langs/javascript";
import * as jsonLang from "@shikijs/langs/json";
import * as pythonLang from "@shikijs/langs/python";
import * as typescriptLang from "@shikijs/langs/typescript";

import * as vitesseLightTheme from "@shikijs/themes/vitesse-light";

const THEME = "vitesse-light";
const SUPPORTED_LANGS = {
  bash: () => Promise.resolve(bashLang),
  css: () => Promise.resolve(cssLang),
  html: () => Promise.resolve(htmlLang),
  javascript: () => Promise.resolve(javascriptLang),
  json: () => Promise.resolve(jsonLang),
  python: () => Promise.resolve(pythonLang),
  typescript: () => Promise.resolve(typescriptLang),
};
const SUPPORTED_THEMES = {
  [THEME]: () => Promise.resolve(vitesseLightTheme),
};
const LANGUAGE_ALIASES = {
  cjs: "javascript",
  cs: null,
  html: "html",
  htm: "html",
  js: "javascript",
  jsx: "javascript",
  md: "markdown",
  py: "python",
  sh: "bash",
  shell: "bash",
  ts: "typescript",
  tsx: "typescript",
  xml: "html",
  yml: "yaml",
  zsh: "bash",
};
const RENDER_STATE = new WeakMap();

const createHighlighter = createBundledHighlighter({
  langs: SUPPORTED_LANGS,
  themes: SUPPORTED_THEMES,
  engine: () => createJavaScriptRegexEngine(),
});

let highlighterPromise = null;

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(text) {
  return escapeHtml(text).replaceAll("`", "&#96;");
}

function sanitizeUrl(url) {
  const value = String(url || "").trim();

  if (!value) {
    return "#";
  }

  try {
    const resolved = new URL(value, window.location.href);
    return ["http:", "https:", "mailto:"].includes(resolved.protocol)
      ? resolved.href
      : "#";
  } catch {
    return "#";
  }
}

function normalizeLanguage(lang) {
  const normalized = String(lang || "")
    .trim()
    .toLowerCase()
    .replace(/^language-/, "");

  if (!normalized) {
    return null;
  }

  if (Object.hasOwn(SUPPORTED_LANGS, normalized)) {
    return normalized;
  }

  if (Object.hasOwn(LANGUAGE_ALIASES, normalized)) {
    return LANGUAGE_ALIASES[normalized];
  }

  return null;
}

function createFallbackCodeBlock(code, lang) {
  const className = lang ? ` class="language-${escapeAttribute(lang)}"` : "";
  return `<pre class="slide-ask-ai-code-fallback"><code${className}>${escapeHtml(code)}</code></pre>`;
}

async function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: [THEME],
      langs: Object.keys(SUPPORTED_LANGS),
    });
  }

  return highlighterPromise;
}

function createRenderer(highlighter) {
  const renderer = new marked.Renderer();

  renderer.html = ({ text }) => escapeHtml(text);
  renderer.image = ({ text, href }) =>
    `<a href="${escapeAttribute(sanitizeUrl(href))}" target="_blank" rel="noreferrer noopener">${escapeHtml(
      text || href || "image",
    )}</a>`;
  renderer.link = function ({ href, title, tokens }) {
    const label = tokens?.length
      ? this.parser.parseInline(tokens)
      : escapeHtml(String(href || "").trim());
    const safeHref = escapeAttribute(sanitizeUrl(href));
    const titleAttr = title ? ` title="${escapeAttribute(title)}"` : "";
    return `<a href="${safeHref}"${titleAttr} target="_blank" rel="noreferrer noopener">${label}</a>`;
  };
  renderer.code = ({ text, lang }) => {
    const normalizedLang = normalizeLanguage(lang);

    if (!normalizedLang) {
      return createFallbackCodeBlock(text, lang);
    }

    try {
      return renderCodeWithTokens(highlighter, text, {
        lang: normalizedLang,
        theme: THEME,
        preClass: "shiki slide-ask-ai-code-block",
        codeClass: "slide-ask-ai-code",
        lineClass: "line",
      });
    } catch {
      return createFallbackCodeBlock(text, lang);
    }
  };

  return renderer;
}

async function renderMarkdown(markdown) {
  const highlighter = await getHighlighter();
  const renderer = createRenderer(highlighter);

  return marked.parse(String(markdown || ""), {
    renderer,
    async: false,
    gfm: true,
    breaks: true,
  });
}

async function renderInto(element, markdown) {
  if (!element) {
    return;
  }

  const content = String(markdown || "");
  const previousState = RENDER_STATE.get(element) || {
    source: "",
    version: 0,
  };
  const nextVersion = previousState.version + 1;

  RENDER_STATE.set(element, {
    source: content,
    version: nextVersion,
  });

  if (!content.trim()) {
    element.innerHTML = "";
    return;
  }

  const html = await renderMarkdown(content);
  const currentState = RENDER_STATE.get(element);

  if (
    !currentState ||
    currentState.version !== nextVersion ||
    currentState.source !== content
  ) {
    return;
  }

  element.innerHTML = html;
}

const runtime = {
  renderInto,
  warmup: getHighlighter,
};

export { renderInto, getHighlighter as warmup };
export default runtime;
