import fs from 'fs-extra';
import path from 'path';
import { ramPath } from '../core/ramdisk.js';

const MAX_SEAT_BYTES = 10 * 1024 * 1024; // 10 MB per seat cache
const FLOWFIELD_SEAT_DIR = path.join(process.cwd(), 'flowfield_docs', 'seats');

function ensureSeatFiles(role) {
  const ramFile = path.join(ramPath, `${role}.mem`);
  const flowfieldFile = path.join(FLOWFIELD_SEAT_DIR, `${role}.txt`);
  fs.ensureFileSync(ramFile);
  fs.ensureDirSync(FLOWFIELD_SEAT_DIR);
  fs.ensureFileSync(flowfieldFile);
  return { ramFile, flowfieldFile };
}

function enforceSeatLimit(file) {
  try {
    const stats = fs.statSync(file);
    if (stats.size <= MAX_SEAT_BYTES) return;
  } catch {
    return;
  }

  try {
    const data = fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean);
    if (!data.length) return;
    const trimmed = [];
    let total = 0;
    for (let i = data.length - 1; i >= 0; i -= 1) {
      const entry = data[i];
      total += Buffer.byteLength(entry + '\n');
      if (total > MAX_SEAT_BYTES) break;
      trimmed.unshift(entry);
    }
    fs.writeFileSync(file, trimmed.join('\n') + '\n');
  } catch (err) {
    console.warn(`[Bubbles] Failed to enforce limit for ${file}:`, err?.message || err);
  }
}

export function loadBubble(role) {
  const file = path.join(ramPath, `${role}.mem`);
  if (!fs.existsSync(file)) return [];
  const txt = fs.readFileSync(file, 'utf-8');
  return txt.split('\n').filter(Boolean);
}

export function saveBubble(role, text) {
  if (typeof text !== 'string' || !text.trim()) return;
  const { ramFile, flowfieldFile } = ensureSeatFiles(role);
  fs.appendFileSync(ramFile, text.trim() + '\n');
  enforceSeatLimit(ramFile);
  fs.appendFileSync(flowfieldFile, text.trim() + '\n');
}

export function mergeBubble(role, entries, limit) {
  if (!Array.isArray(entries) || !entries.length) return;
  const normalized = entries.filter((entry) => typeof entry === 'string' && entry.trim());
  if (!normalized.length) return;

  const { ramFile, flowfieldFile } = ensureSeatFiles(role);
  const existing = loadBubble(role);
  const merged = existing.concat(normalized);
  const trimmed = typeof limit === 'number' && limit > 0 ? merged.slice(-limit) : merged;

  fs.writeFileSync(ramFile, trimmed.join('\n') + '\n');
  enforceSeatLimit(ramFile);
  fs.appendFileSync(flowfieldFile, normalized.join('\n') + '\n');
}
