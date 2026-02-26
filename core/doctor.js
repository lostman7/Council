import { getConfig } from './config.js';
import { initializeSeatRegistry, getSeatExecutionPlan, getAllSeatConfigs } from './seats.js';
import { refreshPool } from './pool.js';

async function runDoctor() {
  const report = {
    config: null,
    seats: [],
    disabledSeats: [],
    thinker: null,
    poolCount: 0
  };

  const config = await getConfig();
  report.config = {
    thinkerEmbedModel: config.thinkerEmbedModel,
    embedMaxRetries: config.embedMaxRetries,
    embedRetryDelayMs: config.embedRetryDelayMs
  };

  await initializeSeatRegistry();
  const all = getAllSeatConfigs();
  const plan = getSeatExecutionPlan();
  report.seats = plan.map((entry) => `${entry.order}. ${entry.seat} (${entry.model || 'auto'})`);
  report.disabledSeats = Object.entries(all)
    .filter(([, cfg]) => cfg.enabled === false)
    .map(([name]) => name);

  report.thinker = all.Thinker || null;

  const pool = await refreshPool(true);
  report.poolCount = pool.length;

  console.log(JSON.stringify(report, null, 2));
}

runDoctor().catch((err) => {
  console.error('[doctor] failed:', err?.message || err);
  process.exit(1);
});
