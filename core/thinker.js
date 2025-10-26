import fs from 'fs-extra';
import path from 'path';
import { embedText, recallSimilar } from './vectorOps.js';
import { callOllamaJson, getActiveBackend } from './dispatcher.js';
import { saveBubble } from '../memory/bubbles.js';

const THINKER_STORE = path.join(process.cwd(), 'memory', 'thinker_state.json');
const SUMMARY_MODEL = 'tinydolphin:1.1b';
const MAX_MEMORY_ENTRIES = 100;

await fs.ensureDir(path.dirname(THINKER_STORE));
await fs.ensureFile(THINKER_STORE);

async function safeWrite(file, data) {
  const temp = `${file}.tmp`;
  await fs.writeJson(temp, data, { spaces: 2 });
  await fs.move(temp, file, { overwrite: true });
}

async function readState() {
  try {
    return await fs.readJson(THINKER_STORE);
  } catch {
    return { memory: [], lastSummary: '', tokens: 0 };
  }
}

function appendMemoryEntry(state, entry) {
  if (!Array.isArray(state.memory)) {
    state.memory = [];
  }
  state.memory.push(entry);
  while (state.memory.length > MAX_MEMORY_ENTRIES) {
    state.memory.shift();
  }
}

export async function embedAndRecall(inputText) {
  const text = String(inputText ?? '').trim();
  if (!text) {
    return '';
  }

  const backend = await getActiveBackend().catch(() => ({ name: 'Ollama' }));
  console.log(`[Thinker] Using backend → ${backend.name}`);

  const vector = await embedText(text);
  if (!Array.isArray(vector) || !vector.length) {
    console.warn('[Thinker] Embedding failed → empty vector');
    return '';
  }

  const state = await readState();
  appendMemoryEntry(state, { text, vector, ts: Date.now() });
  await safeWrite(THINKER_STORE, state);

  const similar = await recallSimilar(vector, 5);
  const contextBlock = [
    '--- [Context Recall] ---',
    ...similar.map((entry) => entry.text || entry),
    '--- [User Input] ---',
    text
  ].join('\n\n');

  console.log(`[Thinker] Context block ready (${similar.length} recalls).`);
  return contextBlock;
}

export async function storeRoundSummary(roundLog) {
  const transcript = String(roundLog ?? '').trim();
  if (!transcript) {
    return '(nothing to summarize)';
  }

  const backend = await getActiveBackend().catch(() => ({ name: 'Ollama' }));
  console.log(`[Thinker] Summarizing round via ${backend.name}`);

  let summaryText = '';
  try {
    const result = await callOllamaJson(SUMMARY_MODEL, transcript);
    summaryText =
      result?.response || result?.choices?.[0]?.message?.content || '';
  } catch (err) {
    console.error('[Thinker] Round summary error:', err);
    summaryText = '(summary failed)';
  }

  if (summaryText) {
    try {
      const vector = await embedText(summaryText);
      const state = await readState();
      state.lastSummary = summaryText;
      appendMemoryEntry(state, {
        text: summaryText,
        vector,
        ts: Date.now(),
        type: 'summary'
      });
      await safeWrite(THINKER_STORE, state);
    } catch (err) {
      console.warn('[Thinker] Unable to embed summary:', err?.message || err);
    }
  }

  return summaryText || '(summary failed)';
}

export async function summarize(role, log) {
  const transcript = Array.isArray(log) ? log.filter(Boolean) : [];
  if (!transcript.length) {
    return '(nothing to summarize)';
  }

  const summary = await storeRoundSummary(transcript.join('\n'));
  const text = summary || '(no summary)';
  saveBubble(`${role}_summary`, text);
  return text;
}

export async function reconcile(conflictSummary) {
  const summaryText = Array.isArray(conflictSummary)
    ? conflictSummary.filter(Boolean).join('\n')
    : String(conflictSummary ?? '');

  if (!summaryText.trim()) {
    return '(no reconciliation)';
  }

  try {
    const result = await callOllamaJson(SUMMARY_MODEL, summaryText);
    return result?.response || result?.choices?.[0]?.message?.content || '(reconciliation failed)';
  } catch (err) {
    console.error('Reconcile error:', err);
    return '(no reconciliation)';
  }
}

export default {
  embedAndRecall,
  storeRoundSummary
};
