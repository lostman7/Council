import fs from 'fs-extra';
import path from 'path';
import { getConfig, saveConfig } from './config.js';
import { traceLog } from './trace.js';
import { callEmbeddingJson, getActiveBackend } from './dispatcher.js';

const EMBEDDING_ALLOWLIST = [
  'qwen3-embedding:0.6b',
  'mxbai-embed-large:latest'
];

const MEMORY_DIR = path.join(process.cwd(), 'memory');
const CHUNK_DIR = path.join(MEMORY_DIR, 'chunked');
export const VECTOR_CACHE_PATH = path.join(MEMORY_DIR, 'vectorCache.json');
export const DEFAULT_EMBED_MODEL = 'qwen3-embedding:0.6b';
export const FALLBACK_EMBED_MODEL = 'mxbai-embed-large:latest';
const VECTOR_CACHE_VERSION = 'v0.4.7';

let availableEmbeddings = [];
let activeEmbeddingModel = DEFAULT_EMBED_MODEL;
let embeddingsInitialised = false;

const DEFAULT_CACHE = () => ({
  version: VECTOR_CACHE_VERSION,
  created: new Date().toISOString(),
  model: DEFAULT_EMBED_MODEL,
  vectors: [],
  seeded: ['resonance', 'toroidal', 'memory cage', 'flowfield', 'collapse engine']
});

const DEFAULT_VECTOR_CONFIG = {
  cooldownDelay: 10,
  thinkerLockModel: DEFAULT_EMBED_MODEL,
  thinkerActive: true,
  cachePath: VECTOR_CACHE_PATH
};

function sanitiseEmbeddingModel(model) {
  const trimmed = typeof model === 'string' ? model.trim() : '';
  if (trimmed && EMBEDDING_ALLOWLIST.includes(trimmed)) {
    return trimmed;
  }
  if (availableEmbeddings.includes(trimmed)) {
    return trimmed;
  }
  if (availableEmbeddings.length) {
    return availableEmbeddings[0];
  }
  return EMBEDDING_ALLOWLIST[0] || DEFAULT_EMBED_MODEL;
}

export async function initVectorOps() {
  if (embeddingsInitialised) {
    return { models: [...availableEmbeddings], active: activeEmbeddingModel };
  }

  try {
    const response = await fetch('http://localhost:11434/api/tags');
    const payload = await response.json();
    const discovered = Array.isArray(payload?.models)
      ? payload.models.map((model) => model?.name).filter(Boolean)
      : [];
    availableEmbeddings = EMBEDDING_ALLOWLIST.filter((name) =>
      discovered.includes(name)
    );
  } catch (err) {
    console.warn('[VectorOps] Unable to query Ollama for embeddings:', err?.message || err);
    availableEmbeddings = [];
  }

  if (!availableEmbeddings.length) {
    availableEmbeddings = [...EMBEDDING_ALLOWLIST];
    console.warn('[Thinker] No embedding models detected; defaulting to allowlist.');
  }

  const config = await getConfig();
  activeEmbeddingModel = sanitiseEmbeddingModel(config.thinkerEmbedModel);
  await saveConfig({ thinkerEmbedModel: activeEmbeddingModel });
  embeddingsInitialised = true;
  return { models: [...availableEmbeddings], active: activeEmbeddingModel };
}

export function getEmbeddingModels() {
  return [...availableEmbeddings];
}

export function getThinkerEmbedding() {
  return activeEmbeddingModel;
}

export async function setThinkerEmbedding(model) {
  await initVectorOps();
  const next = sanitiseEmbeddingModel(model);
  if (next !== activeEmbeddingModel) {
    activeEmbeddingModel = next;
    await saveConfig({ thinkerEmbedModel: activeEmbeddingModel });
  }
  return activeEmbeddingModel;
}

let cacheData = null;
let cacheLoaded = false;
let cacheDirty = false;

function normaliseCacheShape(raw) {
  if (!raw || typeof raw !== 'object') {
    return { value: DEFAULT_CACHE(), rewritten: true };
  }

  const next = { ...raw };
  let rewritten = false;

  if (!Array.isArray(next.vectors)) {
    if (Array.isArray(next.entries)) {
      next.vectors = next.entries.map((entry) => ({
        id: entry.id || Date.now(),
        text: entry.text,
        model: entry.model || DEFAULT_EMBED_MODEL,
        t: entry.date || new Date().toISOString(),
        vector: entry.embedding
      }));
      delete next.entries;
      rewritten = true;
    } else {
      next.vectors = [];
      rewritten = true;
    }
  } else {
    next.vectors = next.vectors.filter((entry) =>
      entry && Array.isArray(entry.vector)
    );
  }

  if (!next.version || next.version !== VECTOR_CACHE_VERSION) {
    next.version = VECTOR_CACHE_VERSION;
    rewritten = true;
  }

  if (!next.model) {
    next.model = DEFAULT_EMBED_MODEL;
    rewritten = true;
  }

  if (!Array.isArray(next.seeded)) {
    next.seeded = DEFAULT_CACHE().seeded;
    rewritten = true;
  }

  return { value: next, rewritten };
}

async function loadCacheInternal(forceReload = false) {
  if (cacheLoaded && !forceReload) {
    return { data: cacheData, rewritten: false };
  }

  await fs.ensureDir(MEMORY_DIR);

  let raw;
  let rewritten = false;
  try {
    raw = await fs.readJson(VECTOR_CACHE_PATH);
  } catch (err) {
    raw = DEFAULT_CACHE();
    rewritten = true;
  }

  const { value, rewritten: normalised } = normaliseCacheShape(raw);
  cacheData = value;
  cacheLoaded = true;
  cacheDirty = false;
  rewritten = rewritten || normalised;

  if (rewritten) {
    await fs.writeJson(VECTOR_CACHE_PATH, cacheData, { spaces: 2 });
  }

  return { data: cacheData, rewritten };
}

async function writeVectorCache() {
  if (!cacheLoaded || !cacheDirty) {
    return;
  }
  await fs.writeJson(VECTOR_CACHE_PATH, cacheData, { spaces: 2 });
  cacheDirty = false;
}

export async function repairVectorCache() {
  const { rewritten } = await loadCacheInternal(true);
  traceLog(
    rewritten
      ? `[Repair] VectorCache rebuilt with ${DEFAULT_EMBED_MODEL}`
      : '[Repair] VectorCache verified OK'
  );
  return rewritten;
}

function normaliseEmbeddingPayload(payload) {
  if (!payload) return [];
  if (Array.isArray(payload.embeddings) && Array.isArray(payload.embeddings[0])) {
    return payload.embeddings[0];
  }
  if (Array.isArray(payload.embedding)) return payload.embedding;
  if (Array.isArray(payload.data) && payload.data[0]?.embedding) {
    return payload.data[0].embedding;
  }
  if (Array.isArray(payload.vector)) return payload.vector;
  return [];
}

async function requestEmbedding(model, text) {
  try {
    const payload = await callEmbeddingJson(model, text);
    const vector = normaliseEmbeddingPayload(payload);
    if (!Array.isArray(vector) || !vector.length) {
      throw new Error('Empty embedding returned from backend');
    }
    return vector;
  } catch (err) {
    const backend = await getActiveBackend().catch(() => ({ name: 'Ollama' }));
    const message = err instanceof Error ? err.message : String(err);
    traceLog(`[VectorOps] ${backend.name} embedding error: ${message}`);
    throw err instanceof Error ? err : new Error(message);
  }
}

function findCachedVector(text) {
  if (!cacheData || !Array.isArray(cacheData.vectors)) return null;
  const trimmed = text.trim();
  return (
    cacheData.vectors.find((entry) => entry.text === trimmed) || null
  );
}

export async function embedText(text, model = DEFAULT_EMBED_MODEL) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) {
    return [];
  }

  await initVectorOps();
  const safeModel = sanitiseEmbeddingModel(model || activeEmbeddingModel);

  const { data } = await loadCacheInternal();
  const existing = findCachedVector(trimmed);
  if (existing && Array.isArray(existing.vector) && existing.vector.length) {
    return existing.vector;
  }

  try {
    const vector = await requestEmbedding(safeModel, trimmed);
    cacheData.vectors.push({
      id: Date.now(),
      text: trimmed,
      model: safeModel,
      t: new Date().toISOString(),
      hash: Buffer.from(trimmed).toString('base64').slice(0, 24),
      vector
    });
    cacheDirty = true;
    await writeVectorCache();
    traceLog(`[VectorOps] Embedded "${trimmed.slice(0, 24)}..." → ${safeModel}`);
    return vector;
  } catch (err) {
    traceLog(`[VectorOps] Primary embed failed → ${err.message}`);
    if (safeModel !== FALLBACK_EMBED_MODEL) {
      return embedText(trimmed, FALLBACK_EMBED_MODEL);
    }
    throw err;
  }
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || !b.length) {
    return 0;
  }
  const dot = a.reduce((sum, value, index) => sum + value * (b[index] || 0), 0);
  const magnitude = (vec) =>
    Math.sqrt(vec.reduce((sum, value) => sum + value * value, 0));
  const denom = magnitude(a) * magnitude(b);
  return denom ? dot / denom : 0;
}

export async function searchEmbeddings(query, limit = 5) {
  const trimmed = String(query ?? '').trim();
  if (!trimmed) {
    return [];
  }

  const queryVector = await embedText(trimmed);
  return recallSimilar(queryVector, limit);
}

export async function recallSimilar(input, limit = 5) {
  const { data } = await loadCacheInternal();
  if (!Array.isArray(data.vectors) || !data.vectors.length) {
    return [];
  }

  let basisVector = Array.isArray(input) ? input : [];
  if (!basisVector.length) {
    const query = String(input ?? '').trim();
    if (!query) {
      return [];
    }
    basisVector = await embedText(query);
  }

  if (!Array.isArray(basisVector) || !basisVector.length) {
    return [];
  }

  return data.vectors
    .map((entry) => ({
      ...entry,
      score: cosineSimilarity(basisVector, entry.vector)
    }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, limit));
}

export const Thinker = {
  active: true,
  async run(input) {
    const model = await setThinkerEmbedding(activeEmbeddingModel);
    traceLog(`[Thinker] Lock active → ${model}`);
    return embedText(input, model);
  },
  async recall(query) {
    const matches = await recallSimilar(query);
    traceLog(
      `[Thinker] Found ${matches.length} entries for "${String(query).slice(0, 48)}..."`
    );
    return matches.map((match) => match.text).join('\n');
  }
};

export const thinkerSeat = Thinker;

export async function cooldown(ms = 10_000) {
  const delay = Math.max(0, Number(ms) || 0);
  if (!delay) {
    return;
  }
  const seconds = Math.ceil(delay / 1000);
  traceLog(`[Cooldown] Cooling for ${seconds}s before next model load`);
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
  await repairVectorCache();
  await loadVectorConfig();
  await initVectorOps();
}

function buildChunkFileKey(fileName) {
  return `chunk:${fileName}`;
}

async function listChunkFiles() {
  try {
    await fs.ensureDir(CHUNK_DIR);
    return (await fs.readdir(CHUNK_DIR)).filter((file) => file.endsWith('.txt'));
  } catch (err) {
    traceLog(`[VectorOps] Unable to read chunk directory: ${err.message}`);
    return [];
  }
}

export async function rebuildVectorCache() {
  await ensureVectorOpsReady();

  const chunkFiles = await listChunkFiles();
  if (!chunkFiles.length) {
    traceLog('[VectorOps] No chunk files detected; skipping cache rebuild');
    return { processed: 0, skipped: 0 };
  }

  const { data } = await loadCacheInternal();
  const existingChunkFiles = new Set(
    Array.isArray(data?.vectors)
      ? data.vectors
          .filter((entry) => entry?.source?.type === 'chunk' && entry.source?.file)
          .map((entry) => entry.source.file)
      : []
  );

  let processed = 0;
  let skipped = 0;
  let index = 0;

  for (const file of chunkFiles) {
    if (existingChunkFiles.has(file)) {
      skipped += 1;
      continue;
    }

    const fullPath = path.join(CHUNK_DIR, file);
    let contents;
    try {
      contents = await fs.readFile(fullPath, 'utf8');
    } catch (err) {
      traceLog(`[VectorOps][Fail] Unable to read chunk ${file}: ${err.message}`);
      skipped += 1;
      continue;
    }

    const trimmed = contents.trim();
    if (!trimmed) {
      skipped += 1;
      continue;
    }

    const modelIndex = index % EMBEDDING_ALLOWLIST.length;
    const targetModel = EMBEDDING_ALLOWLIST[modelIndex] || activeEmbeddingModel;

    try {
      const vector = await embedText(trimmed, targetModel);
      data.vectors.push({
        id: Date.now() + processed,
        text: trimmed,
        model: targetModel,
        t: new Date().toISOString(),
        hash: Buffer.from(buildChunkFileKey(file)).toString('base64').slice(0, 24),
        vector,
        source: { type: 'chunk', file }
      });
      cacheDirty = true;
      processed += 1;
      index += 1;

      if (processed % 100 === 0) {
        await writeVectorCache();
        traceLog(`[VectorOps] Embedded ${processed} chunk files so far`);
      }
    } catch (err) {
      traceLog(`[VectorOps][Fail] ${file}: ${err.message}`);
      skipped += 1;
    }
  }

  await writeVectorCache();
  traceLog(
    `[VectorOps] Rebuild complete — processed ${processed}, skipped ${skipped}, total ${chunkFiles.length}`
  );
  return { processed, skipped, total: chunkFiles.length };
}
