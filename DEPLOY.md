# Deploy Cited

Cited is not on the public internet. There is no live URL. GitHub is not connected.

## Run locally

From this folder:

```bash
node server.mjs
```

Open http://localhost:3456

- Node 20 or newer
- Port `3456` unless you set `PORT`
- No extra packages. `package.json` has no dependencies.
- Data lives in `data/reports.json`, `data/waitlist.json`, and `data/queue.json`
- Do not empty `data/reports.json`. It has real Perplexity reports.

Health check:

```bash
curl http://localhost:3456/api/health
```

Expect `{ "ok": true, "reports": <n>, "waitlist": <n>, "queue": <n> }`.

## GitHub is not connected

This folder is not a git repo. `gh` is not logged in. There is no remote and no GitHub URL.

Do not assume the site is public.

## What you need in the morning to put it on the public internet

1. Log into GitHub: `gh auth login`
2. Create a repo and push this folder. Keep waitlist emails off the remote if you do not want them in git. The real rows in `data/reports.json` should go up with the site.
3. Point a host at `server.mjs`. Vercel (Node server), Fly, Render, or a cheap VPS all work. There is no Vercel project yet.
4. Set `PORT` if the host requires it.
5. Hit `GET /api/health` on the public host before you send anyone a link.

Until those steps are done, the only URL is localhost.

## What a host will not do for you

- It will not send email. Waitlist rows are files on disk.
- It will not scan ChatGPT, Gemini, or Perplexity by itself unless `PERPLEXITY_API_KEY` or `OPENAI_API_KEY` is set, or a person fills a job in `agents/jobs/`.
- It will not invent dentist names.

## Files a host must keep

```
server.mjs
package.json
public/
data/reports.json
data/waitlist.json
data/queue.json
```

`agents/` is the scan loop. It is not required to serve the site.
