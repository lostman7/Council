import fs from 'fs-extra';
import path from 'path';
import { ramPath } from '../core/ramdisk.js';

export function loadBubble(role) {
  const file = path.join(ramPath, `${role}.mem`);
  if (!fs.existsSync(file)) return [];
  const txt = fs.readFileSync(file, 'utf-8');
  return txt.split('\n').filter(Boolean);
}

export function saveBubble(role, text) {
  if (typeof text !== 'string' || !text.trim()) return;
  const file = path.join(ramPath, `${role}.mem`);
  fs.ensureFileSync(file);
  fs.appendFileSync(file, text + '\n');
}

export function mergeBubble(role, entries, limit) {
  if (!Array.isArray(entries) || !entries.length) return;
  const normalized = entries.filter((entry) => typeof entry === 'string' && entry.trim());
  if (!normalized.length) return;

  const existing = loadBubble(role);
  const merged = existing.concat(normalized);
  const trimmed = typeof limit === 'number' && limit > 0 ? merged.slice(-limit) : merged;

  const file = path.join(ramPath, `${role}.mem`);
  fs.ensureFileSync(file);
  fs.writeFileSync(file, trimmed.join('\n') + '\n');
}
