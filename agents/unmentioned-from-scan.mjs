import path from "node:path";
import {
  DATA_DIR,
  normalizeBusiness,
  fuzzyMatch,
  isPlaceholderName,
  isPracticeLikeName,
  readJson,
} from "./lib.mjs";

const SCAN_FILE = path.join(DATA_DIR, "scans", "perplexity-2026-08-17.json");
const INSTEAD_CAP = 8;

function uniqueNames(result) {
  const out = [];
  const seen = new Set();
  for (const list of [result.answerBody, result.sponsoredSnippet, result.placesPanel]) {
    for (const name of list || []) {
      const trimmed = String(name || "").trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      out.push(trimmed);
    }
  }
  return out;
}

export async function unmentionedFromScan(business) {
  const name = String(business || "").trim();
  if (!name || name.length > 160) return null;
  if (isPlaceholderName(name)) return null;
  if (!isPracticeLikeName(name) && normalizeBusiness(name).split(" ").length < 2) return null;

  const scan = await readJson(SCAN_FILE, null);
  if (!scan || !Array.isArray(scan.results) || !scan.results.length) return null;

  const results = scan.results;
  const queries = results.map((r) => r.query).filter(Boolean);
  const namesByQuery = results.map((r) => ({
    query: r.query,
    engine: r.engine || scan.engine || "Perplexity",
    names: uniqueNames(r),
  }));

  const allNames = namesByQuery.flatMap((row) => row.names);
  if (allNames.some((n) => fuzzyMatch(n, name))) {
    return null;
  }

  const instead = [];
  const seen = new Set();
  for (const row of namesByQuery) {
    for (const n of row.names) {
      const key = normalizeBusiness(n);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      instead.push(n);
      if (instead.length >= INSTEAD_CAP) break;
    }
    if (instead.length >= INSTEAD_CAP) break;
  }

  return {
    business: name,
    normalized: normalizeBusiness(name),
    city: "Austin",
    mentioned: false,
    queries,
    mentionedInstead: instead,
    sources: namesByQuery,
    scannedAt: scan.scannedAt || "2026-08-17T05:38:00Z",
    whatThisMeans: `We ran the four patient questions on Perplexity and ${name} was not named in the answers, places panels, or sponsored snippet; ChatGPT was not run, so this report is Perplexity only.`,
    derived: "unmentioned-from-existing-scan",
  };
}
