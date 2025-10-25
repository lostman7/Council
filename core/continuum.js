import fs from 'fs-extra';
import path from 'path';

const archiveDir = path.join(process.cwd(), 'archive');

export async function initArchive() {
  await fs.ensureDir(archiveDir);
  return archiveDir;
}

export async function saveSession(topic, allBubbles) {
  const safeTopic = typeof topic === 'string' && topic.trim() ? topic.trim().replace(/\s+/g, '_') : 'untitled';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(archiveDir, `${stamp}_${safeTopic}.council`);
  const header = `# Session: ${topic}\n# Timestamp: ${new Date().toLocaleString()}\n\n`;
  const body = Array.isArray(allBubbles) ? allBubbles.join('\n') : '';
  await fs.writeFile(file, header + body);
  console.log('Archived:', file);
  return file;
}

export function listSessions() {
  if (!fs.existsSync(archiveDir)) return [];
  return fs
    .readdirSync(archiveDir)
    .filter((f) => f.endsWith('.council'))
    .sort()
    .reverse();
}

export function loadSession(name) {
  if (!name) return '(missing)';
  const file = path.join(archiveDir, name);
  if (!fs.existsSync(file)) return '(missing)';
  return fs.readFileSync(file, 'utf-8');
}

export function latestSummary() {
  const list = listSessions();
  if (!list.length) return '';
  const last = loadSession(list[0]);
  const lines = last.split('\n').slice(-50);
  return lines.join('\n');
}
