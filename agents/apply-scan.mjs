#!/usr/bin/env node
import path from "node:path";
import {
  ROOT,
  readJson,
  removeFromQueue,
  reportFromJob,
  upsertReport,
  validateSources,
  writeJson,
} from "./lib.mjs";

function usage() {
  console.error("Usage: node agents/apply-scan.mjs agents/jobs/<file>.json");
}

async function main() {
  const arg = process.argv[2];
  if (!arg || arg === "-h" || arg === "--help") {
    usage();
    process.exit(arg ? 0 : 1);
  }

  const file = path.isAbsolute(arg) ? arg : path.resolve(process.cwd(), arg);
  const job = await readJson(file, null);
  if (!job || typeof job !== "object") {
    console.error(`Cannot read job: ${file}`);
    process.exit(1);
  }

  const problem = validateSources(job.sources);
  if (problem) {
    console.error(`Rejected ${path.relative(ROOT, file) || file}: ${problem}`);
    process.exit(1);
  }

  const row = reportFromJob({
    ...job,
    scannedAt: job.scannedAt || new Date().toISOString(),
  });

  const completed = {
    ...job,
    status: "completed",
    city: "Austin",
    queries: row.queries,
    sources: row.sources,
    scannedAt: row.scannedAt,
    mentioned: row.mentioned,
    mentionedInstead: row.mentionedInstead,
  };
  if (row.whatThisMeans) completed.whatThisMeans = row.whatThisMeans;

  await writeJson(file, completed);
  await upsertReport(row);
  await removeFromQueue(row.business);

  console.log(`Applied ${row.business}`);
  console.log(`  mentioned: ${row.mentioned}`);
  console.log(`  mentionedInstead: ${row.mentionedInstead.length ? row.mentionedInstead.join("; ") : "(none)"}`);
  console.log(`  sources: ${row.sources.length}`);
  console.log(`  scannedAt: ${row.scannedAt}`);
  console.log("  updated data/reports.json and removed matching queue row");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
