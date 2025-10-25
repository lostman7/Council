import os from 'os';
import si from 'systeminformation';

export async function getStats() {
  const total = os.totalmem();
  const free = os.freemem();
  const ramUsage = total ? ((1 - free / total) * 100).toFixed(1) : '0.0';

  let gpuUsage = 'n/a';
  try {
    const gpus = await si.graphics();
    if (gpus.controllers.length) {
      const controller = gpus.controllers[0];
      if (controller.memoryTotal && controller.memoryUsed) {
        gpuUsage = ((controller.memoryUsed / controller.memoryTotal) * 100).toFixed(1);
      }
    }
  } catch (err) {
    console.error('GPU telemetry error:', err);
  }

  return {
    ramUsage,
    gpuUsage,
    timestamp: new Date().toISOString()
  };
}
