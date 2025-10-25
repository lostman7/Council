import os from 'os';
import fs from 'fs-extra';
import path from 'path';

const ramPath = path.join(os.tmpdir(), 'council_ram');
const syncTarget = path.join(process.cwd(), 'memory');

export async function initRamdisk() {
  await fs.ensureDir(ramPath);
  await fs.ensureDir(syncTarget);
  console.log('Council RAM-disk ready:', ramPath);

  setInterval(() => {
    syncRamToDisk().catch((err) => {
      console.error('RAM sync error:', err);
    });
  }, 20 * 60 * 1000);
}

async function syncRamToDisk() {
  await fs.copy(ramPath, syncTarget, { overwrite: true });
  console.log('Council RAM synced → memory/');
}

export { ramPath };
