import fs from 'fs';
import path from 'path';
import { trace, logError } from './trace.js';

const OLLAMA = 'http://localhost:11434';
const CHAT_PATH = '/api/chat';
const GEN_PATH = '/api/generate';
const TAGS_PATH = '/api/tags';

const CONFIG_DIR = path.join(process.cwd(), 'config');
const MEMORY_DIR = path.join(process.cwd(), 'memory');
const RUNTIME_FILE = path.join(CONFIG_DIR, 'runtime.json');
export const EMBEDDING_CACHE_FILE = path.join(MEMORY_DIR, 'embeddings.json');

const CLOUD_BLACKLIST = new Set(['gpt-oss:120b-cloud', 'glm-4.6:cloud']);

try {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
} catch {
  // ignore
}

if (!fs.existsSync(RUNTIME_FILE)) {
  fs.writeFileSync(RUNTIME_FILE, JSON.stringify({ safeMode: true }, null, 2));
}

if (!fs.existsSync(EMBEDDING_CACHE_FILE)) {
  fs.writeFileSync(EMBEDDING_CACHE_FILE, '{}');
}

function readRuntime() {
  try {
    return JSON.parse(fs.readFileSync(RUNTIME_FILE, 'utf8'));
  } catch {
    return { safeMode: true };
  }
}

function writeRuntime(next) {
  fs.writeFileSync(RUNTIME_FILE, JSON.stringify(next, null, 2));
}

export function getSafeMode() {
  return Boolean(readRuntime().safeMode);
}

export function setSafeMode(enabled) {
  const current = readRuntime();
  current.safeMode = Boolean(enabled);
  writeRuntime(current);
  trace('System', 'safeMode.set', { enabled: current.safeMode });
  return current.safeMode;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const RETRY_DELAYS = [2000, 4000, 8000];

function isBlacklisted(model) {
  return CLOUD_BLACKLIST.has(String(model || '').trim());
}

async function callOllamaJson(pathname, body, preferChat = true) {
  const url = `${OLLAMA}${pathname}`;

  for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt += 1) {
    try {
      const response = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        },
        20000 + attempt * 5000
      );

      if (!response.ok) {
        if (preferChat && response.status === 404) {
          return callOllamaJson(GEN_PATH, body, false);
        }

        const text = await response.text();
        throw new Error(`Model request failed ${response.status}: ${text.slice(0, 200)}`);
      }

      return await response.json();
    } catch (err) {
      const message = err?.message || String(err);
      if (
        err?.name === 'AbortError' ||
        /fetch failed|Headers Timeout/i.test(message)
      ) {
        trace('Dispatcher', 'retry', { attempt, wait: RETRY_DELAYS[attempt] });
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS[attempt]));
        continue;
      }
      throw err;
    }
  }

  throw new Error('Model request failed after retries');
}

export async function callModel({ model, messages, prompt, stream = false }) {
  if (!model && !prompt && (!messages || !messages.length)) {
    throw new Error('Model invocation requires a model and prompt or messages');
  }

  const safeMode = getSafeMode();
  const chosen = String(model || '').trim();

  if (safeMode && isBlacklisted(chosen)) {
    trace('Dispatcher', 'model.blacklisted', { model: chosen });
    return callModel({ model: 'llama3.2:3b', messages, prompt, stream });
  }

  const useChat = Array.isArray(messages) && messages.length > 0;
  const effectiveModel = chosen || 'llama3.2:3b';
  const body = useChat
    ? { model: effectiveModel, stream: Boolean(stream), messages }
    : { model: effectiveModel, prompt: prompt || '', stream: Boolean(stream) };

  trace('Dispatcher', 'model.invoke', { model: body.model, api: useChat ? 'chat' : 'generate' });

  try {
    const data = await callOllamaJson(useChat ? CHAT_PATH : GEN_PATH, body, useChat);
    const text = useChat
      ? data?.message?.content ?? data?.message ?? ''
      : data?.response ?? data?.message ?? '';

    trace('Dispatcher', 'model.ok', { model: body.model, bytes: (text || '').length });
    return { text, raw: data, model: body.model };
  } catch (err) {
    logError(err, { where: 'callModel', model: body.model });
    trace('Dispatcher', 'model.error', { model: body.model, err: err?.message || String(err) });

    if (safeMode && body.model !== 'llama3.2:3b') {
      trace('Dispatcher', 'model.fallback', { to: 'llama3.2:3b' });
      return callModel({ model: 'llama3.2:3b', messages, prompt, stream });
    }

    throw err;
  }
}

export async function listOllamaModels() {
  try {
    const response = await fetchWithTimeout(`${OLLAMA}${TAGS_PATH}`, { method: 'GET' }, 15000);
    if (!response.ok) {
      throw new Error(`Status ${response.status}`);
    }
    const json = await response.json();
    return Array.isArray(json?.models) ? json.models.map((item) => item.name) : [];
  } catch (err) {
    logError(err, { where: 'listOllamaModels' });
    trace('Dispatcher', 'pool.error', { err: err?.message || String(err) });
    return [];
  }
}

export const logDispatcherError = logError;
