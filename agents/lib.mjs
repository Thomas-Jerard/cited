import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(__dirname, "..");
export const DATA_DIR = path.join(ROOT, "data");
export const AGENTS_DIR = __dirname;
export const JOBS_DIR = path.join(AGENTS_DIR, "jobs");
export const QUEUE_FILE = path.join(DATA_DIR, "queue.json");
export const REPORTS_FILE = path.join(DATA_DIR, "reports.json");
export const QUERIES_FILE = path.join(AGENTS_DIR, "queries.json");

const PLACEHOLDER_RE =
  /\b(lorem|ipsum|example|placeholder|tbd|todo|fake|dummy|sample|asdf|xxx|n\/a|unknown|foobar|foo bar|your practice|practice name|dentist name|test dentist|test practice|acme dental|jane doe|john doe)\b/i;

const GENERIC_NAME_RE =
  /^(best|top|emergency|cheap|affordable|local|nearby|recommended)?\s*(austin\s+)?(dentists?|dental\s+(clinics?|offices?|practices?)|cosmetic dentists?)$/i;

const PROSE_RE =
  /\b(is|are|was|were|the best|i recommend|you should|located|offers|provides|known for)\b/i;

export function normalizeBusiness(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(dds|dmd|pc|pa|llc|inc|llp|pllc)\b/g, " ")
    .replace(/^the\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function jobSlug(business) {
  const n = normalizeBusiness(business);
  return n.replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || "unknown";
}

export function jobPathFor(business) {
  return path.join(JOBS_DIR, `${jobSlug(business)}.json`);
}

export function cleanName(name) {
  return String(name || "")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—•\d.)]+/, "")
    .replace(/[.,;:]+$/, "")
    .trim();
}

export function isPlaceholderName(name) {
  const s = cleanName(name);
  if (!s) return true;
  if (s.length < 3) return true;
  if (PLACEHOLDER_RE.test(s)) return true;
  if (/^\W+$/.test(s)) return true;
  return false;
}

export function isPracticeLikeName(name) {
  const s = cleanName(name);
  if (!s || s.length > 80) return false;
  if (isPlaceholderName(s)) return false;
  if (/https?:\/\//i.test(s)) return false;
  if (GENERIC_NAME_RE.test(s)) return false;
  if (PROSE_RE.test(s)) return false;
  const words = s.split(/\s+/);
  if (words.length > 8) return false;
  const dental =
    /\b(dental|dentist|dentistry|dds|dmd|orthodont|oral|smile|braces|periodont|endodont|prosthodont|implants?)\b/i;
  const titleish = words
    .filter((w) => /[A-Za-z]/.test(w))
    .every((w) => {
      if (/^(and|of|the|at|in|for|&)$/i.test(w)) return true;
      return /^[A-Z]/.test(w) || /^(DDS|DMD|PC|PA|LLC|LLP|PLLC)$/i.test(w);
    });
  if (dental.test(s)) return true;
  if (titleish && words.length >= 2) return true;
  return false;
}

function canonTokens(name) {
  return normalizeBusiness(name)
    .replace(/\b(dentistry|dentists|dentist|dental)\b/g, "dental")
    .replace(/\b(clinic|office|group|care|center|centre)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

export function fuzzyMatch(a, b) {
  const na = normalizeBusiness(a);
  const nb = normalizeBusiness(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 6 && nb.length >= 6 && (na.includes(nb) || nb.includes(na))) {
    return true;
  }
  const ta = canonTokens(a);
  const tb = canonTokens(b);
  if (ta.length === 0 || tb.length === 0) return false;
  const setB = new Set(tb);
  const overlap = ta.filter((t) => setB.has(t));
  const union = new Set([...ta, ...tb]);
  if (overlap.length >= 2 && overlap.length / union.size >= 0.5) return true;
  return false;
}

export async function readJson(filePath, fallback = null) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err && err.code === "ENOENT") return fallback;
    throw err;
  }
}

export async function readJsonArray(filePath) {
  const parsed = await readJson(filePath, []);
  return Array.isArray(parsed) ? parsed : [];
}

export async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
  await fs.rename(tmp, filePath);
}

export async function loadQueries() {
  const data = await readJson(QUERIES_FILE, null);
  const queries = Array.isArray(data?.queries)
    ? data.queries.filter((q) => typeof q === "string" && q.trim()).map((q) => q.trim())
    : [];
  if (queries.length === 0) {
    throw new Error(`No queries in ${QUERIES_FILE}`);
  }
  const variants = Array.isArray(data?.variants)
    ? data.variants.filter((q) => typeof q === "string" && q.trim()).map((q) => q.trim())
    : [];
  return { city: data?.city || "Austin", queries, variants };
}

export function extractJsonObject(text) {
  const raw = String(text || "");
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

export function extractNamesFromText(text) {
  const names = [];
  const add = (value) => {
    const t = cleanName(value);
    if (!t || !isPracticeLikeName(t)) return;
    const key = normalizeBusiness(t);
    if (names.some((n) => normalizeBusiness(n) === key)) return;
    names.push(t);
  };

  const parsed = extractJsonObject(text);
  if (parsed && Array.isArray(parsed.names)) {
    for (const n of parsed.names) add(String(n));
    return names;
  }

  for (const line of String(text || "").split(/\n/)) {
    const m = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(?:\*\*)?([A-Z][^:\n*]{2,80})/);
    if (m) add(m[1]);
  }
  return names;
}

export function uniqueOtherNames(business, sources) {
  const out = [];
  const seen = new Set();
  for (const src of sources || []) {
    for (const name of src.names || []) {
      const trimmed = cleanName(name);
      if (!trimmed) continue;
      if (fuzzyMatch(business, trimmed)) continue;
      const key = normalizeBusiness(trimmed);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(trimmed);
    }
  }
  return out;
}

export function anyMention(business, sources) {
  for (const src of sources || []) {
    for (const name of src.names || []) {
      if (fuzzyMatch(business, name)) return true;
    }
  }
  return false;
}

export function inventedNamesIn(sources) {
  const bad = [];
  for (const src of sources || []) {
    for (const name of src.names || []) {
      const trimmed = String(name || "").trim();
      if (!trimmed) continue;
      if (isPlaceholderName(trimmed)) bad.push(trimmed);
    }
  }
  return bad;
}

export function validateSources(sources) {
  if (!Array.isArray(sources) || sources.length === 0) {
    return "sources is missing or empty. A completed job must include sources from a real scan.";
  }
  for (const [i, src] of sources.entries()) {
    if (!src || typeof src !== "object") {
      return `sources[${i}] is not an object.`;
    }
    if (typeof src.query !== "string" || !src.query.trim()) {
      return `sources[${i}].query is required.`;
    }
    if (typeof src.engine !== "string" || !src.engine.trim()) {
      return `sources[${i}].engine is required.`;
    }
    if (!Array.isArray(src.names)) {
      return `sources[${i}].names must be an array (empty is ok if nothing was shown).`;
    }
    for (const name of src.names) {
      if (typeof name !== "string") {
        return `sources[${i}].names must be strings.`;
      }
    }
  }
  const invented = inventedNamesIn(sources);
  if (invented.length) {
    return `Names look invented or placeholder: ${invented.join(", ")}`;
  }
  return null;
}

export function reportFromJob(job) {
  const business = String(job.business || "").trim();
  const sources = Array.isArray(job.sources) ? job.sources : [];
  const queries = Array.isArray(job.queries)
    ? job.queries.filter((q) => typeof q === "string" && q.trim()).map((q) => q.trim())
    : [...new Set(sources.map((s) => s.query).filter(Boolean))];

  const row = {
    business,
    city: "Austin",
    mentioned: anyMention(business, sources),
    queries,
    mentionedInstead: uniqueOtherNames(business, sources),
    sources: sources.map((s) => ({
      query: String(s.query || "").trim(),
      engine: String(s.engine || "").trim(),
      names: (s.names || []).map((n) => cleanName(n)).filter(Boolean),
    })),
    scannedAt: job.scannedAt || new Date().toISOString(),
  };

  if (typeof job.whatThisMeans === "string" && job.whatThisMeans.trim()) {
    row.whatThisMeans = job.whatThisMeans.trim();
  }
  return row;
}

export async function upsertReport(row) {
  const reports = await readJsonArray(REPORTS_FILE);
  const key = normalizeBusiness(row.business);
  const idx = reports.findIndex((r) => r && normalizeBusiness(r.business) === key);
  if (idx >= 0) reports[idx] = row;
  else reports.push(row);
  await writeJson(REPORTS_FILE, reports);
  return reports;
}

export async function removeFromQueue(business) {
  const queue = await readJsonArray(QUEUE_FILE);
  const key = normalizeBusiness(business);
  const next = queue.filter((row) => row && normalizeBusiness(row.business) !== key);
  if (next.length !== queue.length) {
    await writeJson(QUEUE_FILE, next);
  }
  return next;
}

export function detectEngine() {
  if (process.env.PERPLEXITY_API_KEY) return "perplexity";
  if (process.env.OPENAI_API_KEY) return "openai";
  return null;
}

export async function callSearchApi(engine, query) {
  const system =
    "You list dental practice names that actually appear for a patient search in Austin, Texas. Never invent or guess names. If you would not name a specific practice, return an empty list.";
  const user = [
    `Patient search: ${query}`,
    "",
    `Return only JSON: {"names":["Exact Practice Name"]}`,
    "Include only names you would actually mention in an answer to that search.",
    "No commentary, no placeholders.",
  ].join("\n");

  const timeout = AbortSignal.timeout(60_000);

  if (engine === "perplexity") {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        temperature: 0,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: timeout,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Perplexity ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || "";
    return { names: extractNamesFromText(text), engineLabel: "perplexity" };
  }

  if (engine === "openai") {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: timeout,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenAI ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || "";
    return { names: extractNamesFromText(text), engineLabel: "chatgpt" };
  }

  throw new Error(`Unknown engine: ${engine}`);
}

export async function listJobFiles() {
  try {
    const names = await fs.readdir(JOBS_DIR);
    return names.filter((n) => n.endsWith(".json")).map((n) => path.join(JOBS_DIR, n));
  } catch (err) {
    if (err && err.code === "ENOENT") return [];
    throw err;
  }
}
