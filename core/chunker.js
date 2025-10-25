import fs from 'fs-extra';
import path from 'path';

const CHUNK_DIR = path.join(process.cwd(), 'memory', 'chunked');
const CHUNK_SIZE = 1000; // characters ~500 tokens
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
    start = end - overlap;
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

export async function chunkAllDocs(inputDir = path.join(process.cwd(), 'memory')) {
  const files = (await fs.readdir(inputDir)).filter((f) => f.endsWith('.txt') || f.endsWith('.md'));
  console.log(`[Chunker] Found ${files.length} text/markdown files`);
  const allChunks = [];
  for (const f of files) {
    const filePath = path.join(inputDir, f);
    const chunks = await chunkFile(filePath);
    allChunks.push(...chunks);
  }
  console.log(`[Chunker] Completed. Total chunk files: ${allChunks.length}`);
  return allChunks;
}
