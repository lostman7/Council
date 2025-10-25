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
  const file = path.join(ramPath, `${role}.mem`);
  fs.ensureFileSync(file);
  fs.appendFileSync(file, text + '\n');
}
