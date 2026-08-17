#!/usr/bin/env node
import path from "node:path";
import {
  JOBS_DIR,
  QUEUE_FILE,
  anyMention,
  callSearchApi,
  detectEngine,
  jobPathFor,
  listJobFiles,
  loadQueries,
  normalizeBusiness,
  readJson,
  readJsonArray,
  removeFromQueue,
  reportFromJob,
  uniqueOtherNames,
  upsertReport,
  writeJson,
} from "./lib.mjs";

function pendingJob(practice, queries) {
  const business = String(practice.business || "").trim();
  const job = {
    status: "pending",
    business,
    city: "Austin",
    queries: [...queries],
    normalized: normalizeBusiness(business),
    createdAt: practice.requestedAt || new Date().toISOString(),
  };
  const email = String(practice.email || "").trim();
  if (email) job.email = email;
  return job;
}

async function ensurePendingJob(practice, queries) {
  const file = jobPathFor(practice.business);
  const existing = await readJson(file, null);
  if (existing && typeof existing === "object") {
    if (!Array.isArray(existing.queries) || existing.queries.length === 0) {
      existing.queries = [...queries];
    }
    if (practice.email && !existing.email) existing.email = practice.email;
    if (!existing.city) existing.city = "Austin";
    if (!existing.business) existing.business = String(practice.business || "").trim();
    await writeJson(file, existing);
    return { file, job: existing, created: false };
  }
  const job = pendingJob(practice, queries);
  await writeJson(file, job);
  return { file, job, created: true };
}

async function applyCompleted(file, job) {
  const row = reportFromJob(job);
  await upsertReport(row);
  await removeFromQueue(job.business);
  if (job.status !== "completed") {
    job.status = "completed";
    job.scannedAt = row.scannedAt;
    job.mentioned = row.mentioned;
    job.mentionedInstead = row.mentionedInstead;
    await writeJson(file, job);
  }
  return row;
}

async function completeWithApi(file, job, engine) {
  const sources = [];
  let ok = 0;
  for (const query of job.queries) {
    process.stdout.write(`  ${engine} ← ${query}\n`);
    try {
      const result = await callSearchApi(engine, query);
      sources.push({
        query,
        engine: result.engineLabel,
        names: result.names,
      });
      ok += 1;
      console.log(`    names: ${result.names.length ? result.names.join("; ") : "(none shown)"}`);
    } catch (err) {
      console.error(`    API error: ${err.message}`);
    }
  }
  if (ok === 0) {
    console.error(`  All API calls failed for ${job.business}. Leaving job pending. Not faking results.`);
    return null;
  }

  const scannedAt = new Date().toISOString();
  const completed = {
    ...job,
    status: "completed",
    city: "Austin",
    sources,
    scannedAt,
    mentioned: anyMention(job.business, sources),
    mentionedInstead: uniqueOtherNames(job.business, sources),
  };
  await writeJson(file, completed);
  const row = await applyCompleted(file, completed);
  console.log(
    `  wrote report mentioned=${row.mentioned} instead=${row.mentionedInstead.length} → ${path.basename(file)}`
  );
  return row;
}

async function main() {
  const { queries } = await loadQueries();
  const engine = detectEngine();
  const queue = await readJsonArray(QUEUE_FILE);

  console.log("Cited scan-queue");
  console.log(`Queue: ${queue.length}  jobs dir: ${JOBS_DIR}`);
  console.log(`API: ${engine || "none (PERPLEXITY_API_KEY or OPENAI_API_KEY)"}`);

  const seen = new Set();
  for (const practice of queue) {
    if (!practice || !String(practice.business || "").trim()) continue;
    const key = normalizeBusiness(practice.business);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const { file, job, created } = await ensurePendingJob(practice, queries);
    console.log(`${created ? "enqueued" : "exists"}  ${job.business}  [${job.status}]  ${path.basename(file)}`);
  }

  const jobFiles = await listJobFiles();
  const pending = [];
  const completed = [];
  for (const file of jobFiles) {
    const job = await readJson(file, null);
    if (!job || typeof job !== "object") continue;
    if (job.status === "completed" && Array.isArray(job.sources)) completed.push({ file, job });
    else if (job.status !== "completed") pending.push({ file, job });
  }

  for (const { file, job } of completed) {
    await applyCompleted(file, job);
  }

  if (!engine) {
    if (pending.length === 0 && queue.length === 0) {
      console.log("Queue empty. No pending jobs. Nothing to do.");
    } else {
      console.log(
        `${pending.length} pending job(s). No API key is set. A Grok or browser agent must fill them.`
      );
      console.log("See agents/README.md. Do not fake results.");
      for (const { file, job } of pending) {
        console.log(`  pending  ${job.business}  ${path.basename(file)}`);
      }
    }
    process.exit(0);
    return;
  }

  if (pending.length === 0) {
    console.log(queue.length === 0 ? "Queue empty. Nothing to scan." : "No pending jobs left to scan.");
    process.exit(0);
    return;
  }

  for (const { file, job } of pending) {
    console.log(`scanning  ${job.business}`);
    await completeWithApi(file, job, engine);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(0);
});
