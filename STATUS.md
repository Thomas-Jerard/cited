# Cited status

Overnight build, Monday 17 Aug 2026 (ET). Local only.

## What exists

- Landing and report at http://localhost:3456
- Public directory at `/directory.html` (41 live reports)
- `server.mjs`: static files, waitlist, scan lookup, queue, `GET /api/health`
- 41 reports from the Perplexity pass (39 named, 2 not named) in `data/reports.json`
- Raw scan in `data/scans/perplexity-2026-08-17.json`
- Third-party notes in `data/scans/web-2026-08-17.json` (not mixed into reports)
- Scan loop in `agents/`
- Waitlist kit in `launch/`
- `DEPLOY.md` and this file

## What is real

One Perplexity pass, four patient questions, 17 Aug 2026:

- best dentist in Austin Texas
- best cosmetic dentist Austin TX
- emergency dentist Austin TX
- family dentist South Lamar Austin

39 practices were named. 2 were checked against that same pass and not named: Westlake Hills Dentistry, Walden Dental.

Widest hit: Toothbar (generic, cosmetic, emergency).

ChatGPT was behind a login. Gemini / Google AI Overview pages were captcha-blocked. Reports are Perplexity only.

The form writes email and practice name to `data/waitlist.json`. Unknown names go to `data/queue.json`.

The landing line "First reports are live for Austin" is true.

## What is blocked

- **ChatGPT login.** Browser sign-in failed (phone-account conflict). An OpenAI API key is stored and works. It answers from model memory, not live ChatGPT search. Those names were not mixed into the live reports.
- **Gemini.** Google pages captcha-blocked. Not in the reports.
- **No public URL.** GitHub is not connected. `gh auth` is logged out.
- **No email send.** We store the address. Queued copy says to check back with the same practice name.
- **No API keys.** `PERPLEXITY_API_KEY` and `OPENAI_API_KEY` are unset.

## Do not

- Do not invent dentist names.
- Do not empty `data/reports.json`.
- Do not claim the site is public.
- Do not treat localpicks.ai names as our scan. Their writeup is in `data/scans/web-2026-08-17.json` only.

## Morning

1. Read `DEPLOY.md`. `gh auth login`, then push and host `server.mjs`.
2. Find-replace `YOUR_URL` in `launch/`.
3. Send the Westlake Hills note first (`launch/email-dentists.md`).
4. Post one LinkedIn note, not all six.

## What changed overnight

- 41 reports from the raw Perplexity scan. Westlake Hills and Walden Dental were not named.
- Public directory of live reports.
- Queued path no longer promises email.
- `GET /api/health`.
- Landing no longer claims ChatGPT and Gemini results we do not have.
- Waitlist kit written.
