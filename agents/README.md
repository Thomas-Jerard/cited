# Cited scan agent

This folder is the scan loop. The public site and `server.mjs` already exist. Do not rewrite them.

A queued practice becomes a job file. A finished job becomes a row in `data/reports.json`. Never invent dentist names.

## Files

- `queries.json` — Austin patient questions, plus optional city variants
- `schema.json` — shape of a finished report row
- `scan-queue.mjs` — turn `data/queue.json` into job files; call an API only if a key is set
- `apply-scan.mjs` — merge a completed job into `data/reports.json`
- `lib.mjs` — shared normalize / match / I/O helpers
- `jobs/` — one JSON file per practice

## Run the queue

From the Cited root:

```bash
node agents/scan-queue.mjs
```

Safe to re-run. Exits 0 if the queue is empty.

If `PERPLEXITY_API_KEY` or `OPENAI_API_KEY` is set, the script asks that API each query, extracts only practice-like names it can actually see, writes a completed job, and merges `data/reports.json`.

If no key is set, jobs stay `pending`. A Grok Bot or browser agent must fill them. Do not fake results.

## How a Grok Bot or browser agent fills a job

1. Open [Perplexity](https://www.perplexity.ai) or [ChatGPT](https://chatgpt.com). Gemini is fine if that is what you have.
2. For each query in the pending job (see `queries.json`), paste the query as a new search. Do not add extra framing that would change the results.
3. Read the answer. Record only dental practice or dentist names that are actually shown. If a name is not on screen, it does not go in the file.
4. If the answer names no practices, record an empty `names` array for that query. That is a real result.
5. Write the completed job JSON over the pending file in `agents/jobs/`.
6. Apply it:

```bash
node agents/apply-scan.mjs agents/jobs/<file>.json
```

`apply-scan.mjs` rejects the file if `sources` is missing or if any name looks invented (`lorem`, `example`, `TBD`, `TODO`, `placeholder`, and similar).

## Never invent dentists

- Do not guess who "should" appear.
- Do not fill names from memory, ads, Maps, or a directory unless that exact name was in the answer you just ran.
- Do not use placeholders to "complete" a file.
- City is always Austin.

## Job JSON

Pending (written by `scan-queue.mjs`):

```json
{
  "status": "pending",
  "business": "Practice Name",
  "city": "Austin",
  "queries": [
    "best dentist in Austin Texas",
    "best cosmetic dentist Austin TX",
    "emergency dentist Austin TX",
    "family dentist South Lamar Austin"
  ],
  "email": "optional@practice.com"
}
```

Completed (what you write):

```json
{
  "status": "completed",
  "business": "Practice Name",
  "city": "Austin",
  "queries": [
    "best dentist in Austin Texas",
    "best cosmetic dentist Austin TX",
    "emergency dentist Austin TX",
    "family dentist South Lamar Austin"
  ],
  "email": "optional@practice.com",
  "scannedAt": "2026-08-17T12:00:00.000Z",
  "sources": [
    {
      "query": "best dentist in Austin Texas",
      "engine": "perplexity",
      "names": ["Only A Name That Appeared"]
    }
  ]
}
```

`engine` is `perplexity`, `chatgpt`, or `gemini` — whichever you actually used.

`apply-scan.mjs` sets `mentioned` if any source name fuzzy-matches `business`, and sets `mentionedInstead` to the unique other names that appeared.

## Queries

See `queries.json`. Always run the four patient questions. City variants are optional extras, not replacements.
