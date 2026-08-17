#!/usr/bin/node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportsPath = path.join(root, "data", "reports.json");
const outPath = path.join(root, "public", "data", "directory.json");

const raw = JSON.parse(await fs.readFile(reportsPath, "utf8"));
const rows = (Array.isArray(raw) ? raw : [])
  .filter((row) => row && typeof row.business === "string" && row.business.trim())
  .map((row) => ({
    business: row.business.trim(),
    city: "Austin",
    mentioned: Boolean(row.mentioned),
    scannedAt: typeof row.scannedAt === "string" ? row.scannedAt : null,
  }))
  .sort((a, b) => a.business.localeCompare(b.business));

const payload = {
  city: "Austin",
  engineNote: "Perplexity only. ChatGPT was behind a login.",
  generatedAt: new Date().toISOString(),
  count: rows.length,
  reports: rows,
};

await fs.mkdir(path.dirname(outPath), { recursive: true });
await fs.writeFile(outPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
console.log(`Wrote ${rows.length} directory rows to ${outPath}`);
