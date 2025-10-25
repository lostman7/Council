import fs from 'fs-extra';
import path from 'path';
import { getConfig, saveConfig } from './config.js';
import { traceLog } from './trace.js';

const MEMORY_DIR = path.join(process.cwd(), 'memory');
export const VECTOR_CACHE_PATH = path.join(MEMORY_DIR, 'vectorCache.json');
export const DEFAULT_EMBED_MODEL = 'qwen3-embedding:0.6b';
export const FALLBACK_EMBED_MODEL = 'mxbai-embed-large';

const DEFAULT_CACHE = {
  version: 'v0.4.4',
  created: new Date().toISOString(),
  entries: [],
  seeded: ['resonance', 'toroidal', 'memory cage', 'flowfield', 'collapse engine']
};

const DEFAULT_VECTOR_CONFIG = {
  cooldownDelay: 10,
  thinkerLockModel: DEFAULT_EMBED_MODEL,
  thinkerActive: true,
  cachePath: VECTOR_CACHE_PATH
};

let cacheData = null;
let cacheLoaded = false;

async function ensureVectorCacheFile() {
  await fs.ensureDir(MEMORY_DIR);
  const exists = await fs.pathExists(VECTOR_CACHE_PATH);
  if (!exists) {
    await fs.writeJson(VECTOR_CACHE_PATH, DEFAULT_CACHE, { spaces: 2 });
    traceLog(`[VectorCache] Initialized → ${VECTOR_CACHE_PATH}`);
  }
}

async function readVectorCache() {
  if (cacheLoaded) {
    return cacheData;
  }
  await ensureVectorCacheFile();
  try {
    cacheData = await fs.readJson(VECTOR_CACHE_PATH);
  } catch (err) {
    traceLog(`[VectorCache] Failed to read cache, rebuilding: ${err.message}`);
    cacheData = { ...DEFAULT_CACHE, created: new Date().toISOString() };
    await fs.writeJson(VECTOR_CACHE_PATH, cacheData, { spaces: 2 });
  }
  cacheLoaded = true;
  return cacheData;
}

async function writeVectorCache() {
  if (!cacheLoaded || !cacheData) {
    return;
  }
  await fs.writeJson(VECTOR_CACHE_PATH, cacheData, { spaces: 2 });
}

function normalizeEmbeddingPayload(payload) {
  if (!payload) return [];
  if (Array.isArray(payload.embedding)) return payload.embedding;
  if (Array.isArray(payload.data) && payload.data[0]?.embedding) {
    return payload.data[0].embedding;
  }
  if (Array.isArray(payload.vector)) return payload.vector;
  return [];
}

async function requestEmbedding(model, text) {
  const res = await fetch('http://localhost:11434/api/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: text })
  });
  if (!res.ok) {
    throw new Error(`Embedding failed: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  return normalizeEmbeddingPayload(json);
}

function findCachedEmbedding(text) {
  if (!cacheData || !Array.isArray(cacheData.entries)) return null;
  return cacheData.entries.find((entry) => entry.text === text) || null;
}

export async function embedText(text, model = DEFAULT_EMBED_MODEL) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) {
    return [];
  }
  const cache = await readVectorCache();
  const existing = findCachedEmbedding(trimmed);
  if (existing && Array.isArray(existing.embedding) && existing.embedding.length) {
    return existing.embedding;
  }
  try {
    const embedding = await requestEmbedding(model, trimmed);
    if (!Array.isArray(embedding) || !embedding.length) {
      throw new Error('Empty embedding returned');
    }
    cache.entries.push({
      text: trimmed,
      embedding,
      model,
      date: new Date().toISOString()
    });
    await writeVectorCache();
    traceLog(`[VectorCache] Embedded "${trimmed.slice(0, 24)}..." → ${model}`);
    return embedding;
  } catch (err) {
    traceLog(`[VectorCache] Primary embed failed → ${err.message}`);
    if (model !== FALLBACK_EMBED_MODEL) {
      return embedText(trimmed, FALLBACK_EMBED_MODEL);
    }
    throw err;
  }
}

function cosineSimilarity(a, b) {
  const dot = a.reduce((sum, value, index) => sum + value * (b[index] || 0), 0);
  const mag = (vec) => Math.sqrt(vec.reduce((sum, value) => sum + value * value, 0));
  const denom = mag(a) * mag(b);
  return denom ? dot / denom : 0;
}

export async function searchEmbeddings(query, limit = 5) {
  const trimmed = String(query ?? '').trim();
  if (!trimmed) {
    return [];
  }
  const cache = await readVectorCache();
  if (!cache.entries.length) {
    return [];
  }
  const queryVector = await embedText(trimmed);
  const scored = cache.entries
    .map((entry) => ({
      ...entry,
      score: cosineSimilarity(queryVector, entry.embedding)
    }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, limit));
  return scored;
}

export const thinkerSeat = {
  name: 'Thinker',
  role: 'embedding',
  model: DEFAULT_EMBED_MODEL,
  active: true,
  async process(input) {
    const text = String(input ?? '');
    traceLog(`[Thinker] Processing embedding for "${text.slice(0, 48)}..."`);
    return embedText(text);
  },
  async recall(query) {
    const matches = await searchEmbeddings(query);
    traceLog(`[Thinker] Found ${matches.length} entries for "${String(query).slice(0, 48)}..."`);
    return matches.map((match) => match.text).join('\n');
  }
};

export async function cooldown(ms = 10_000) {
  const delay = Math.max(0, Number(ms) || 0);
  if (!delay) {
    return;
  }
  const seconds = Math.ceil(delay / 1000);
  traceLog(`[Cooldown] Waiting ${seconds}s before next model load`);
  for (let remaining = seconds; remaining > 0; remaining -= 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

export async function loadVectorConfig() {
  const config = await getConfig();
  return { ...DEFAULT_VECTOR_CONFIG, ...(config.vectorOps || {}) };
}

export async function saveVectorConfig(partial) {
  const current = await loadVectorConfig();
  const next = { ...current, ...(partial || {}) };
  await saveConfig({ vectorOps: next });
  traceLog('[Config] Saved vectorOps configuration.');
  return next;
}

export function displayStatus(message, color = 'cyan') {
  const palette = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
  };
  const prefix = palette[color] || '';
  const suffix = prefix ? '\x1b[0m' : '';
  console.log(`${prefix}[HUD] ${message}${suffix}`);
}

export async function ensureVectorOpsReady() {
  await readVectorCache();
  await loadVectorConfig();
}
