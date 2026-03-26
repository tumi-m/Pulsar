#!/usr/bin/env tsx
/**
 * Pulsar — Daily Music Discovery Scheduler
 * Runs the agent every day at 08:00 UTC (customize with AGENT_CRON env var)
 */

import cron from "node-cron";
import { runMusicDiscoveryAgent } from "./index";
import { config } from "./env";

config();

const CRON_SCHEDULE = process.env.AGENT_CRON ?? "0 8 * * *"; // 08:00 UTC daily
const TIMEZONE = process.env.AGENT_TIMEZONE ?? "UTC";

console.log(`\n🎵 Pulsar Scheduler starting...`);
console.log(`   Schedule: ${CRON_SCHEDULE} (${TIMEZONE})`);
console.log(`   Press Ctrl+C to stop.\n`);

if (!cron.validate(CRON_SCHEDULE)) {
  console.error(`Invalid cron expression: ${CRON_SCHEDULE}`);
  process.exit(1);
}

// Run immediately on start if env flag is set
if (process.env.RUN_ON_START === "true") {
  console.log("RUN_ON_START=true — running immediately...\n");
  runMusicDiscoveryAgent().catch(console.error);
}

// Schedule daily run
cron.schedule(
  CRON_SCHEDULE,
  async () => {
    console.log(`\n⏰ Scheduled trigger at ${new Date().toISOString()}`);
    try {
      const result = await runMusicDiscoveryAgent();
      console.log(
        `✅ Scheduled run complete: ${result.releases_saved} releases saved`
      );
    } catch (err) {
      console.error("❌ Scheduled run failed:", err);
    }
  },
  { timezone: TIMEZONE }
);

console.log("Scheduler is running. Waiting for next trigger...");
