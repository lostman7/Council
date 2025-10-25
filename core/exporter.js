import fs from 'fs-extra';
import path from 'path';
import { ramPath } from './ramdisk.js';
import { getThroneLog, getThroneMetrics } from './throne.js';
import { getHarmonicState } from './harmony.js';

const EXPORT_DIR = path.join(process.cwd(), 'archive', 'exports');

export async function exportCouncilLog() {
  await fs.ensureDir(EXPORT_DIR);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(EXPORT_DIR, `council_log_${stamp}.txt`);

  const metrics = getThroneMetrics();
  const harmony = getHarmonicState();
  const header = [
    `Council Export — ${new Date().toLocaleString()}`,
    `Topic: ${metrics.sessionTopic || '—'}`,
    `Entropy: ${typeof harmony.entropy === 'number' ? harmony.entropy.toFixed(2) : '0.00'}`,
    `Lead Seat: ${Object.entries(harmony.weights || {})
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name)[0] || '—'}`,
    `Active Seats: ${metrics.activeSeat || '—'}`,
    ''
  ];

  const logLines = getThroneLog(9999);
  const ramNotes = await gatherRamNotes();

  const output = header
    .concat(['--- Council Log ---'])
    .concat(logLines)
    .concat(['', '--- Seat Memory ---'])
    .concat(ramNotes.length ? ramNotes : ['(no RAM transcripts found)'])
    .join('\n');

  await fs.outputFile(filePath, output, 'utf8');
  return filePath;
}

async function gatherRamNotes() {
  const entries = [];
  try {
    const exists = await fs.pathExists(ramPath);
    if (!exists) {
      return entries;
    }
    const files = (await fs.readdir(ramPath)).filter((file) => file.endsWith('.mem'));
    for (const file of files) {
      try {
        const data = await fs.readFile(path.join(ramPath, file), 'utf8');
        entries.push(`# ${file}`);
        entries.push(data.trim());
        entries.push('');
      } catch (err) {
        entries.push(`# ${file} — error reading: ${err.message}`);
      }
    }
  } catch (err) {
    entries.push(`(failed to read RAM-disk: ${err.message})`);
  }
  return entries;
}
