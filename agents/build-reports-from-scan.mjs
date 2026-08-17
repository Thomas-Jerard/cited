#!/usr/bin/env node
/**
 * Build data/reports.json from a canonical raw scan file.
 * One report per unique practice. Never invent names.
 *
 * Usage: node agents/build-reports-from-scan.mjs [data/scans/perplexity-2026-08-17.json]
 */
import path from "node:path";
import {
  ROOT,
  DATA_DIR,
  normalizeBusiness,
  readJson,
  readJsonArray,
  writeJson,
} from "./lib.mjs";

const DEFAULT_SCAN = path.join(DATA_DIR, "scans", "perplexity-2026-08-17.json");
const REPORTS_FILE = path.join(DATA_DIR, "reports.json");
const SCANNED_AT = "2026-08-17T05:38:00Z";
const MENTIONED_INSTEAD_CAP = 8;

/** Only these raw strings collapse to a shorter business name. */
const CANONICAL_BY_NORMALIZED = new Map([
  [
    normalizeBusiness("Enamel Dentistry Saltillo (East Austin)"),
    {
      business: "Enamel Dentistry",
      note: "Appeared as Enamel Dentistry Saltillo (East Austin)",
    },
  ],
  [
    normalizeBusiness("Breeze Dental – South Lamar"),
    {
      business: "Breeze Dental",
      note: "Appeared as Breeze Dental – South Lamar",
    },
  ],
  [
    normalizeBusiness("North Austin Dentist (Dr. Logan Miller)"),
    {
      business: "North Austin Dentist",
      note: "Appeared as North Austin Dentist (Dr. Logan Miller)",
    },
  ],
]);

const QUERY_SHORT = new Map([
  ["best dentist in Austin Texas", "generic best-dentist"],
  ["best cosmetic dentist Austin TX", "cosmetic"],
  ["emergency dentist Austin TX", "emergency"],
  ["family dentist South Lamar Austin", "South Lamar family"],
]);

function canonicalize(rawName) {
  const raw = String(rawName || "").trim();
  if (!raw) return null;
  const alias = CANONICAL_BY_NORMALIZED.get(normalizeBusiness(raw));
  if (alias) {
    return {
      business: alias.business,
      key: normalizeBusiness(alias.business),
      raw,
      note: alias.note,
    };
  }
  return {
    business: raw,
    key: normalizeBusiness(raw),
    raw,
    note: null,
  };
}

function uniqueInOrder(names) {
  const out = [];
  const seen = new Set();
  for (const name of names || []) {
    const trimmed = String(name || "").trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function sectionsOf(result) {
  const sections = [];
  if (Array.isArray(result.answerBody) && result.answerBody.length) {
    sections.push({ label: "answer body", names: result.answerBody });
  }
  if (Array.isArray(result.sponsoredSnippet) && result.sponsoredSnippet.length) {
    sections.push({ label: "sponsored snippet", names: result.sponsoredSnippet });
  }
  if (Array.isArray(result.placesPanel) && result.placesPanel.length) {
    sections.push({ label: "places panel", names: result.placesPanel });
  }
  return sections;
}

function rawNamesOf(result) {
  return uniqueInOrder([
    ...(result.answerBody || []),
    ...(result.sponsoredSnippet || []),
    ...(result.placesPanel || []),
  ]);
}

function joinList(items) {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function whatThisMeans(business, appearances) {
  if (!appearances.length) {
    return `We ran the four patient questions on Perplexity and ${business} was not named in the answers, places panels, or sponsored snippet; ChatGPT was not run, so this report is Perplexity only.`;
  }

  const bits = appearances.map((hit) => {
    const short = QUERY_SHORT.get(hit.query) || hit.query;
    const where = joinList(hit.sections);
    const note = hit.note ? ` as ${hit.note.replace(/^Appeared as /, "")}` : "";
    return `the ${where} on the ${short} question${note}`;
  });

  return `Perplexity named ${business} in ${joinList(bits)}; ChatGPT was not run, so this report is Perplexity only.`;
}

function mentionedInsteadFor(selfKey, queryKeys, namesByQuery, allQueryOrder) {
  const out = [];
  const seen = new Set();
  const addFrom = (query) => {
    for (const raw of namesByQuery.get(query) || []) {
      const canon = canonicalize(raw);
      if (!canon || canon.key === selfKey) continue;
      if (seen.has(canon.key)) continue;
      seen.add(canon.key);
      out.push(canon.business);
      if (out.length >= MENTIONED_INSTEAD_CAP) return true;
    }
    return false;
  };

  for (const query of queryKeys) {
    if (addFrom(query)) return out;
  }
  for (const query of allQueryOrder) {
    if (queryKeys.includes(query)) continue;
    if (addFrom(query)) return out;
  }
  return out;
}

function buildScanReports(scan) {
  const results = Array.isArray(scan.results) ? scan.results : [];
  const scannedAt = scan.scannedAt || SCANNED_AT;
  const queries = results.map((r) => r.query).filter(Boolean);

  const namesByQuery = new Map();
  const engineByQuery = new Map();
  for (const result of results) {
    namesByQuery.set(result.query, rawNamesOf(result));
    engineByQuery.set(result.query, result.engine || scan.engine || "Perplexity");
  }

  const practices = new Map();

  for (const result of results) {
    const sections = sectionsOf(result);
    for (const section of sections) {
      for (const raw of section.names) {
        const canon = canonicalize(raw);
        if (!canon) continue;
        let row = practices.get(canon.key);
        if (!row) {
          row = {
            business: canon.business,
            key: canon.key,
            hits: [],
          };
          practices.set(canon.key, row);
        }
        let hit = row.hits.find((h) => h.query === result.query);
        if (!hit) {
          hit = { query: result.query, sections: [], note: null };
          row.hits.push(hit);
        }
        if (!hit.sections.includes(section.label)) hit.sections.push(section.label);
        if (canon.note) hit.note = canon.note;
      }
    }
  }

  const reports = [];
  for (const row of practices.values()) {
    const hitQueries = row.hits.map((h) => h.query);
    const sources = row.hits.map((h) => {
      const src = {
        query: h.query,
        engine: engineByQuery.get(h.query) || "Perplexity",
        names: namesByQuery.get(h.query) || [],
      };
      if (h.note) src.note = h.note;
      return src;
    });

    reports.push({
      business: row.business,
      normalized: row.key,
      city: "Austin",
      mentioned: true,
      queries: [...queries],
      mentionedInstead: mentionedInsteadFor(row.key, hitQueries, namesByQuery, queries),
      sources,
      scannedAt,
      whatThisMeans: whatThisMeans(row.business, row.hits),
    });
  }

  return { reports, queries, namesByQuery, engineByQuery, scannedAt };
}

function refreshUnmentioned(existing, ctx) {
  const { queries, namesByQuery, engineByQuery, scannedAt } = ctx;
  const sources = queries.map((query) => ({
    query,
    engine: engineByQuery.get(query) || "Perplexity",
    names: namesByQuery.get(query) || [],
  }));

  return {
    business: existing.business,
    normalized: existing.normalized || normalizeBusiness(existing.business),
    city: "Austin",
    mentioned: false,
    queries: [...queries],
    mentionedInstead: mentionedInsteadFor(
      normalizeBusiness(existing.business),
      queries,
      namesByQuery,
      queries
    ),
    sources,
    scannedAt,
    whatThisMeans: whatThisMeans(existing.business, []),
  };
}

async function main() {
  const arg = process.argv[2];
  const scanPath = arg
    ? path.isAbsolute(arg)
      ? arg
      : path.resolve(process.cwd(), arg)
    : DEFAULT_SCAN;

  const scan = await readJson(scanPath, null);
  if (!scan || typeof scan !== "object" || !Array.isArray(scan.results)) {
    console.error(`Cannot read scan results: ${scanPath}`);
    process.exit(1);
  }

  const existing = await readJsonArray(REPORTS_FILE);
  const { reports, queries, namesByQuery, engineByQuery, scannedAt } = buildScanReports(scan);
  const seen = new Set(reports.map((r) => r.normalized));

  for (const row of existing) {
    if (!row || typeof row !== "object" || !row.business) continue;
    if (row.mentioned !== false) continue;
    const key = normalizeBusiness(row.business);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    reports.push(
      refreshUnmentioned(row, { queries, namesByQuery, engineByQuery, scannedAt })
    );
  }

  await writeJson(REPORTS_FILE, reports);

  const mentioned = reports.filter((r) => r.mentioned).length;
  const unmentioned = reports.filter((r) => !r.mentioned).length;
  console.log(`Read ${path.relative(ROOT, scanPath) || scanPath}`);
  console.log(`Wrote ${reports.length} reports → ${path.relative(ROOT, REPORTS_FILE)}`);
  console.log(`  mentioned:true  ${mentioned}`);
  console.log(`  mentioned:false ${unmentioned}`);
  for (const row of reports) {
    console.log(`  ${row.mentioned ? "yes" : "no "}  ${row.business}`);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
