import fs from 'fs-extra';
import path from 'path';
import fetch from 'node-fetch';
import pdfParse from 'pdf-parse';
import { ramPath } from '../core/ramdisk.js';

const storeFile = path.join(ramPath, 'vector_store.json');
let vectorStore = [];
let docsRoot = path.resolve('./flowfield_docs');
const SUPPORTED_EXTENSIONS = new Set(['.txt', '.md', '.pdf']);

export async function initVectorCache(docsPath = './flowfield_docs') {
  docsRoot = path.resolve(docsPath);
  await fs.ensureDir(docsRoot);

  const entries = await fs.readdir(docsRoot);
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(docsRoot, entry);
    try {
      const stats = await fs.stat(fullPath);
      if (!stats.isFile()) continue;
    } catch (err) {
      console.warn(`Skipping unreadable entry: ${entry}`, err);
      continue;
    }

    if (!SUPPORTED_EXTENSIONS.has(path.extname(entry).toLowerCase())) continue;
    files.push(entry);
  }

  vectorStore = [];
  for (const file of files) {
    const text = await readDocumentText(file);
    if (!text.trim()) continue;
    await addDocument(file, text);
  }

  await fs.outputJson(storeFile, vectorStore, { spaces: 2 });
  console.log(`VectorCache initialized with ${vectorStore.length} docs`);
}

export async function addDocument(name, text) {
  const embedding = await embedText(text);
  vectorStore.push({ name, embedding });
}

async function readDocumentText(file) {
  const ext = path.extname(file).toLowerCase();
  const absolute = path.join(docsRoot, file);

  if (ext === '.pdf') {
    try {
      const buffer = await fs.readFile(absolute);
      const data = await pdfParse(buffer);
      return data.text || '';
    } catch (err) {
      console.error(`Failed to parse PDF ${file}:`, err);
      return '';
    }
  }

  return fs.readFile(absolute, 'utf-8');
}

async function embedText(text) {
  try {
    const res = await fetch('http://localhost:11434/api/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'qwen3-embedding:0.6b', input: text })
    });

    if (!res.ok) {
      throw new Error(`Embedding request failed with status ${res.status}`);
    }

    const data = await res.json();
    return data.embedding || [];
  } catch (err) {
    console.error('Embedding error:', err);
    return [];
  }
}

export async function searchDocs(query, topK = 3) {
  if (!vectorStore.length) return [];
  const qVec = await embedText(query);
  if (!qVec.length) return [];

  const scored = vectorStore
    .map((doc) => ({
      name: doc.name,
      score: cosine(qVec, doc.embedding)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .filter((item) => Number.isFinite(item.score));

  const snippets = [];
  for (const item of scored) {
    const filePath = path.join(docsRoot, item.name);
    if (await fs.pathExists(filePath)) {
      const contents = await readDocumentText(item.name);
      snippets.push(contents.trim());
    }
  }
  return snippets;
}

function cosine(a, b) {
  if (!a.length || !b.length) return 0;
  const dot = a.reduce((sum, v, i) => sum + v * (b[i] || 0), 0);
  const magA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
  const magB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
  if (!magA || !magB) return 0;
  return dot / (magA * magB);
}
