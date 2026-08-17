#!/usr/bin/node
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { unmentionedFromScan } from "./agents/unmentioned-from-scan.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const PORT = Number(process.env.PORT) || 3456;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};

const MAX_BODY = 32 * 1024;

function normalizeBusiness(name) {
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

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function text(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

async function readJsonArray(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err && err.code === "ENOENT") return [];
    return [];
  }
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
  await fs.rename(tmp, filePath);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error("Payload too large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error("Invalid JSON"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

function findReport(reports, business) {
  const key = normalizeBusiness(business);
  if (!key) return null;
  return (
    reports.find((row) => {
      if (!row || typeof row !== "object") return false;
      const byField = row.normalized && normalizeBusiness(row.normalized) === key;
      const byName = normalizeBusiness(row.business) === key;
      return byField || byName;
    }) || null
  );
}

function publicReport(row) {
  const queries = Array.isArray(row.queries)
    ? row.queries.filter((q) => typeof q === "string" && q.trim()).map((q) => q.trim())
    : [];
  const mentionedInstead = Array.isArray(row.mentionedInstead)
    ? row.mentionedInstead.filter((n) => typeof n === "string" && n.trim()).map((n) => n.trim())
    : [];

  const payload = {
    status: "ready",
    business: String(row.business || "").trim(),
    city: "Austin",
    mentioned: Boolean(row.mentioned),
    queries,
    mentionedInstead,
  };

  if (typeof row.whatThisMeans === "string" && row.whatThisMeans.trim()) {
    payload.whatThisMeans = row.whatThisMeans.trim();
  }

  return payload;
}

function queuedReport(business) {
  return {
    status: "queued",
    business: String(business || "").trim(),
    city: "Austin",
    mentioned: null,
    queries: [],
    mentionedInstead: [],
    message: "Your scan is queued. Check back on this page with the same practice name.",
  };
}

async function handleHealth(res) {
  const reports = await readJsonArray(path.join(DATA_DIR, "reports.json"));
  const waitlist = await readJsonArray(path.join(DATA_DIR, "waitlist.json"));
  const queue = await readJsonArray(path.join(DATA_DIR, "queue.json"));
  json(res, 200, {
    ok: true,
    reports: reports.length,
    waitlist: waitlist.length,
    queue: queue.length,
  });
}

async function handleWaitlist(req, res) {
  const body = await readBody(req);
  const email = String(body.email || "").trim().toLowerCase();
  const business = String(body.business || "").trim();
  const city = "Austin";

  if (!business || business.length > 160) {
    json(res, 400, { error: "Practice name is required." });
    return;
  }
  if (!isValidEmail(email)) {
    json(res, 400, { error: "A real email is required." });
    return;
  }

  const file = path.join(DATA_DIR, "waitlist.json");
  const list = await readJsonArray(file);
  const entry = {
    email,
    business,
    city,
    createdAt: new Date().toISOString(),
  };
  const dup = list.some(
    (row) =>
      row &&
      String(row.email || "").toLowerCase() === email &&
      normalizeBusiness(row.business) === normalizeBusiness(business)
  );
  if (!dup) list.push(entry);
  await writeJson(file, list);
  json(res, 200, { ok: true, city });
}

async function handleScan(req, res) {
  const body = await readBody(req);
  const business = String(body.business || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const city = "Austin";

  if (!business || business.length > 160) {
    json(res, 400, { error: "Practice name is required." });
    return;
  }

  const reportsFile = path.join(DATA_DIR, "reports.json");
  const reports = await readJsonArray(reportsFile);
  const match = findReport(reports, business);
  if (match) {
    json(res, 200, publicReport(match));
    return;
  }

  const derived = await unmentionedFromScan(business);
  if (derived) {
    reports.push(derived);
    await writeJson(reportsFile, reports);
    json(res, 200, publicReport(derived));
    return;
  }

  const queueFile = path.join(DATA_DIR, "queue.json");
  const queue = await readJsonArray(queueFile);
  const key = normalizeBusiness(business);
  const existing = queue.find((row) => row && normalizeBusiness(row.business) === key);
  if (existing) {
    if (email && isValidEmail(email) && !existing.email) {
      existing.email = email;
      existing.updatedAt = new Date().toISOString();
      await writeJson(queueFile, queue);
    }
  } else {
    queue.push({
      business,
      city,
      normalized: key,
      email: email && isValidEmail(email) ? email : undefined,
      requestedAt: new Date().toISOString(),
    });
    await writeJson(queueFile, queue);
  }

  json(res, 200, queuedReport(business));
}

function safeJoinPublic(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const clean = path.posix.normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, "");
  const rel = clean === "/" ? "/index.html" : clean;
  const abs = path.join(PUBLIC_DIR, rel);
  const root = path.resolve(PUBLIC_DIR) + path.sep;
  if (!abs.startsWith(root) && abs !== path.resolve(PUBLIC_DIR)) return null;
  return abs;
}

async function serveStatic(res, urlPath) {
  const filePath = safeJoinPublic(urlPath);
  if (!filePath) {
    text(res, 403, "Forbidden");
    return;
  }
  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=3600",
    });
    res.end(data);
  } catch {
    text(res, 404, "Not found");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const method = req.method || "GET";

    if (method === "GET" && url.pathname === "/api/health") {
      await handleHealth(res);
      return;
    }
    if (method === "POST" && url.pathname === "/api/waitlist") {
      await handleWaitlist(req, res);
      return;
    }
    if (method === "POST" && url.pathname === "/api/scan") {
      await handleScan(req, res);
      return;
    }
    if (method === "GET" && (url.pathname === "/report" || url.pathname === "/report.html")) {
      await serveStatic(res, "/report.html");
      return;
    }
    if (method === "GET") {
      await serveStatic(res, url.pathname);
      return;
    }

    json(res, 405, { error: "Method not allowed." });
  } catch (err) {
    const status = err && err.status ? err.status : 500;
    json(res, status, { error: err.message || "Server error." });
  }
});

await fs.mkdir(DATA_DIR, { recursive: true });
for (const name of ["reports.json", "waitlist.json", "queue.json"]) {
  const file = path.join(DATA_DIR, name);
  try {
    await fs.access(file);
  } catch {
    await writeJson(file, []);
  }
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Cited running at http://localhost:${PORT}`);
});
