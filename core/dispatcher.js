import fs from 'fs-extra';
import path from 'path';

const CHAT_URL = 'http://localhost:11434/api/chat';
const GENERATE_URL = 'http://localhost:11434/api/generate';
const TAGS_URL = 'http://localhost:11434/api/tags';

export const DEFAULT_CLOUD_BLACKLIST = ['gpt-oss:120b-cloud', 'glm-4.6:cloud'];
const FALLBACK_MODEL = 'llama3.2:3b';
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;
const REQUEST_TIMEOUT_MS = 60_000;

const CONFIG_DIR = path.resolve('config');
const LOGS_DIR = path.resolve('logs');
const MEMORY_DIR = path.resolve('memory');
const BLACKLIST_FILE = path.join(CONFIG_DIR, 'blacklist.json');
const ERROR_LOG_FILE = path.join(LOGS_DIR, 'errors.json');
const EMBEDDING_CACHE_FILE = path.join(MEMORY_DIR, 'embeddings.json');

fs.ensureDirSync(CONFIG_DIR);
fs.ensureDirSync(LOGS_DIR);
fs.ensureDirSync(MEMORY_DIR);

if (!fs.existsSync(BLACKLIST_FILE)) {
  fs.writeJsonSync(BLACKLIST_FILE, DEFAULT_CLOUD_BLACKLIST, { spaces: 2 });
}

if (!fs.existsSync(ERROR_LOG_FILE)) {
  fs.writeJsonSync(ERROR_LOG_FILE, []);
}

if (!fs.existsSync(EMBEDDING_CACHE_FILE)) {
  fs.writeJsonSync(EMBEDDING_CACHE_FILE, {});
}

function readBlacklist() {
  try {
    const payload = fs.readJsonSync(BLACKLIST_FILE);
    return Array.isArray(payload) ? payload : DEFAULT_CLOUD_BLACKLIST;
  } catch (err) {
    console.warn('[Dispatcher] Failed to read blacklist, using defaults:', err.message);
    return DEFAULT_CLOUD_BLACKLIST;
  }
}

function logError(message, data = {}) {
  try {
    const existing = fs.readJsonSync(ERROR_LOG_FILE);
    const next = Array.isArray(existing) ? existing : [];
    next.push({ time: new Date().toISOString(), message, data });
    fs.writeJsonSync(ERROR_LOG_FILE, next, { spaces: 2 });
  } catch (err) {
    console.error('[Dispatcher] Failed to record error log:', err);
  }
}

async function fetchWithTimeout(url, options, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

function messagesToPrompt(messages = []) {
  return messages
    .map(({ role, content }) => `${role || 'user'}: ${content}`)
    .join('\n');
}

async function listModels() {
  try {
    const res = await fetchWithTimeout(TAGS_URL, { method: 'GET' }, 15_000);
    if (!res.ok) {
      throw new Error(`Status ${res.status}`);
    }
    const json = await res.json();
    return Array.isArray(json?.models) ? json.models.map((item) => item.name) : [];
  } catch (err) {
    logError('Failed to list Ollama models', { error: err.message });
    return [];
  }
}

async function resolveModel(modelName) {
  const blacklist = readBlacklist();
  let candidate = modelName || FALLBACK_MODEL;
  if (blacklist.some((blocked) => candidate.includes(blocked))) {
    console.warn(`[COUNCIL] Skipping blacklisted model '${candidate}'`);
    candidate = FALLBACK_MODEL;
  }

  const available = await listModels();
  if (available.length && !available.includes(candidate)) {
    console.warn(`[COUNCIL] Model '${candidate}' not available → using fallback ${FALLBACK_MODEL}`);
    candidate = available.includes(FALLBACK_MODEL) ? FALLBACK_MODEL : available[0] || FALLBACK_MODEL;
  }

  return candidate;
}

async function performChatRequest(model, messages, stream) {
  const response = await fetchWithTimeout(
    CHAT_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, stream, messages })
    },
    REQUEST_TIMEOUT_MS
  );

  if (response.status === 404) {
    const error = new Error('Chat endpoint unavailable');
    error.status = 404;
    throw error;
  }

  if (!response.ok) {
    throw new Error(`Model request failed with status ${response.status}`);
  }

  return response.json();
}

async function performGenerateRequest(model, prompt, stream) {
  const response = await fetchWithTimeout(
    GENERATE_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream })
    },
    REQUEST_TIMEOUT_MS
  );

  if (!response.ok) {
    throw new Error(`Generate request failed with status ${response.status}`);
  }

  return response.json();
}

export async function callModel({ model, messages, prompt, stream = false }) {
  if (!model && !prompt && (!messages || !messages.length)) {
    throw new Error('Model invocation requires a model and prompt or messages');
  }

  let selectedModel = await resolveModel(model);
  const messagePayload = Array.isArray(messages) ? messages : [];
  const promptText = prompt || messagesToPrompt(messagePayload);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      let data;
      try {
        data = await performChatRequest(selectedModel, messagePayload, stream);
      } catch (err) {
        if (err.status === 404) {
          data = await performGenerateRequest(selectedModel, promptText, stream);
        } else {
          throw err;
        }
      }

      const text = data?.message?.content || data?.response || '(no reply)';
      return { text, raw: data, model: selectedModel };
    } catch (err) {
      if (attempt === MAX_ATTEMPTS) {
        logError('Model request failed', { model: selectedModel, error: err.message });
        console.error('Model invocation error:', err);
        return { text: '(seat offline)', raw: null, model: selectedModel };
      }

      console.warn(`[Dispatcher] Retry ${attempt}/${MAX_ATTEMPTS} after error: ${err.message}`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }

  return { text: '(seat offline)', raw: null, model: selectedModel };
}

export async function listOllamaModels() {
  return listModels();
}

export { EMBEDDING_CACHE_FILE, logError as logDispatcherError };
