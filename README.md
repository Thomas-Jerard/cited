# Cited

One-page site plus a report for Austin dentists. Type a practice name. See whether AI search mentions it. First live reports are Perplexity only. ChatGPT was behind a login.

This is the one feature. Not a suite.

## Run

```bash
node server.mjs
```

Then open [http://localhost:3456](http://localhost:3456).

The server listens on port `3456` unless you set `PORT`.

This is local only until you deploy. See [DEPLOY.md](DEPLOY.md). Morning status is in [STATUS.md](STATUS.md).

## What it does

- Serves the landing page, report page, and `/directory.html`
- `GET /api/health` returns `{ ok, reports, waitlist, queue }` counts from the JSON files
- `POST /api/waitlist` `{ email, business, city }` appends to `data/waitlist.json`
- `POST /api/scan` `{ business, city }` looks up `data/reports.json` by normalized practice name
- If there is no match, it returns a queued report and stores the request in `data/queue.json`
- Queued copy is honest: we cannot send email yet. Check back on the report page with the same practice name.
- `GET /report?biz=Practice+Name` serves the report page

City is always Austin.

Emails are stored. They are not sent.

## Add a live report

`data/reports.json` holds real scan results. Do not empty it. Do not invent dentist names, mention counts, or quotes.

```json
[
  {
    "business": "Exact practice name from the scan",
    "city": "Austin",
    "mentioned": false,
    "queries": [
      "best dentist in Austin"
    ],
    "mentionedInstead": [
      "Only names that appeared in the scan"
    ],
    "whatThisMeans": "Optional. If you omit this, the page writes a short honest note."
  }
]
```

Lookup ignores case, extra punctuation, and suffixes like DDS or LLC.

## Scan agent

Queued practices are scanned by the loop in [`agents/`](agents/README.md). Run `node agents/scan-queue.mjs` (safe if the queue is empty). If no API key is set, a Grok or browser agent fills pending jobs. Never invent dentist names. See [agents/README.md](agents/README.md).

## Files

```
cited/
  server.mjs
  package.json
  README.md
  DEPLOY.md
  STATUS.md
  data/reports.json
  data/waitlist.json
  data/queue.json
  data/scans/
  launch/
  public/directory.html
  public/data/directory.json
  agents/README.md
  agents/queries.json
  agents/schema.json
  agents/scan-queue.mjs
  agents/apply-scan.mjs
  agents/lib.mjs
  agents/jobs/
  public/index.html
  public/report.html
  public/css/style.css
  public/js/main.js
  public/js/report.js
  public/favicon.svg
```
