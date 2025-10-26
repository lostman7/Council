import fs from 'fs-extra';
import path from 'path';

const PROJECT_ROOT = process.cwd();
const FLOWFIELD_DIR = path.join(PROJECT_ROOT, 'flowfield_docs');
const CHUNK_DIR = path.join(PROJECT_ROOT, 'memory', 'chunked');
const CHUNK_SIZE = 1000; // characters ≈ 500 tokens
const CHUNK_OVERLAP = 200; // overlap for continuity

async function ensureChunkDir() {
  await fs.ensureDir(CHUNK_DIR);
  return CHUNK_DIR;
}

function chunkText(text, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 0) chunks.push(chunk);
    if (end === text.length) break;
    const nextStart = end - overlap;
    start = nextStart > start ? nextStart : end;
  }
  return chunks;
}

export async function chunkFile(filePath) {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    const base = path.basename(filePath, path.extname(filePath));
    const dir = await ensureChunkDir();
    const chunks = chunkText(text);
    const outFiles = [];
    for (let i = 0; i < chunks.length; i++) {
      const outPath = path.join(dir, `${base}_chunk_${i + 1}.txt`);
      await fs.writeFile(outPath, chunks[i], 'utf8');
      outFiles.push(outPath);
    }
    console.log(`[Chunker] Split ${base} → ${outFiles.length} chunks`);
    return outFiles;
  } catch (err) {
    console.error(`[Chunker][Error] ${filePath}`, err);
    return [];
  }
}

export async function chunkAllDocs(inputDir = FLOWFIELD_DIR) {
  const resolvedDir = path.isAbsolute(inputDir) ? inputDir : path.join(PROJECT_ROOT, inputDir);
  const exists = await fs.pathExists(resolvedDir);
  if (!exists) {
    console.warn(`[Chunker] Directory not found: ${resolvedDir}`);
    return [];
  }

  const rootFiles = (await fs.readdir(resolvedDir)).filter((f) => f.endsWith('.txt') || f.endsWith('.md'));
  const seatsDir = path.join(resolvedDir, 'seats');
  let seatFiles = [];
  if (await fs.pathExists(seatsDir)) {
    seatFiles = (await fs.readdir(seatsDir)).filter((f) => f.endsWith('.txt') || f.endsWith('.md'));
  }

  console.log(
    `[Chunker] Found ${rootFiles.length} root docs and ${seatFiles.length} seat logs in ${resolvedDir}`
  );

  const allChunks = [];
  for (const f of rootFiles) {
    const filePath = path.join(resolvedDir, f);
    const chunks = await chunkFile(filePath);
    allChunks.push(...chunks);
  }

  for (const f of seatFiles) {
    const filePath = path.join(seatsDir, f);
    const chunks = await chunkFile(filePath);
    allChunks.push(...chunks);
  }
  console.log(`[Chunker] Completed. Total chunk files: ${allChunks.length}`);
  return allChunks;
}
