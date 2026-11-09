# Minute Club

Ten small web projects with Russian interfaces, a shared lightweight visual language, and no runtime dependencies. Seven use Node.js 24 + SQLite for real community data; three run entirely in the browser. No remote fonts, trackers, CDN assets, build framework, or paid API.

| Repository | Route | Features | Runtime |
| --- | --- | --- | --- |
| caption-club | /caption/ | Daily original illustration, captions, voting, yesterday's winner, share links, PNG cards | Node + SQLite |
| majority-vote | /majority/ | 12 unusual questions, majority prediction, real answer counts, direct question links | Node + SQLite |
| meme-arena | /arena/ | Seed memes, unique pair battles, win counts, moderated image submissions | Node + SQLite |
| memory-sketch | /memory/ | 30-second canvas drawing, undo, eraser, four references, PNG export, friend challenges | Static |
| excuse-bureau | /papers/ | Three document templates, live canvas preview, local drafts, PNG export | Static |
| crowd-decides | /decide/ | Shareable polls with 2–6 options, results, browser-local recent polls | Node + SQLite |
| pixel-rooms | /house/ | Shared room gallery, 16×16 editor, 16 colors, keyboard controls, undo, conflict detection | Node + SQLite |
| daily-minute | /minute/ | Shared daily odd-word puzzle, server-validated attempts, elapsed time, local history | Node + SQLite |
| odd-finds | /finds/ | Moderated photo collection, categories, voting, sorting, pagination, direct item links | Node + SQLite |
| motion-playground | /mischief/ | Escaping button, draggable spring cards, playful progress, 3D flip, calm mode | Static |

## Run the combined development project

Requires Node.js 24 or newer. No installation step:

```sh
npm start
```

Open http://localhost:3000. The tenth experiment is at `/mischief/`. To enable image submissions, first set `ADMIN_TOKEN` to a long random value; uploads remain private until approved at `/admin/`.

```sh
ADMIN_TOKEN='replace-with-a-long-random-value' npm start
npm test
npm run check
```

## Create standalone packages

```sh
node ops/export.mjs /absolute/path/to/output
```

Each folder is an independent project. Server packages expose only their own API group and route. Static packages contain a `public/` directory that any static web server can serve at a domain root; they do not call an API.

## Deploy on your server

Node packages require one process each. They bind to loopback by default; put Caddy or another HTTPS reverse proxy in front. Each project must use its own port, `DATA_DIR`, and origin. Set environment variables through your service manager or `node --env-file=.env server/index.mjs`; `.env` is not loaded automatically. Examples are in `ops/`.

```sh
PORT=3001 PUBLIC_ORIGIN=https://caption.example.com DATA_DIR=/srv/caption-data npm start
```

Alternatively build the included Dockerfile, bind port 3000 to loopback, and mount a persistent volume at `/app/data`. Do not expose a development server to the internet.

Static packages can be served with Caddy's `file_server` or any static host. Their absolute asset paths assume a domain root, not a GitHub Pages project subdirectory. No hosting or domain changes are performed by this repository.

## Disk budget and media

The combined project limits accepted images to 80 GB total. Standalone Meme Arena and Odd Finds default to **40 GB each**, leaving 20 GB of your 100 GB allocation for databases, WAL, and operational headroom. Set `UPLOAD_BUDGET_BYTES` to change the per-project limit. This limits image payload bytes, not total filesystem use; monitor actual disk space. Keep backups on a different disk or reserve more headroom for them.

Only JPEG, PNG, and non-animated WebP are accepted. The browser re-encodes to at most 1200 pixels and 500,000 bytes, stripping original metadata. The server independently checks signature, size, and dimensions (max 2048×2048), then stores the bytes in SQLite. GIF/APNG/animated WebP are deliberately excluded from v1. Failed submissions never become public. Without `ADMIN_TOKEN`, uploads are disabled.

No public object-store keys, paid services, or original large uploads are needed. There is no image-generation AI dependency: starter illustrations are original lightweight vectors.

## Operations and moderation

- `/healthz`: process health endpoint.
- `/admin/`: pending images and reported posts. The key stays in tab memory; it is never put in a URL or localStorage.
- Approve to publish, or delete to remove a post, image, and attached reports. SQLite reuses freed pages; file size will not immediately shrink. Run SQLite `VACUUM` only during a planned offline maintenance window with enough free disk space.
- Back up with `node ops/backup.mjs /other-disk/backup.sqlite`. It uses SQLite's online backup API, including committed WAL content. Also protect a copy of `data/session-key` if preserving browser room access after a restore matters. Test restores periodically.
- Use one Node process per database. Do not cluster multiple writers or put a live SQLite database on a network filesystem.
- Rate limits are per TCP peer, with write and publication limits. Behind the supplied reverse proxy, all traffic shares the proxy's bucket. For a larger audience, enforce visitor-specific limits at the proxy and adjust the application limiter deliberately; arbitrary forwarded headers are not trusted.
- Pending queues return the latest 100 items per request. Review them regularly before accepting a large volume of submissions.
- Reports are a manual moderation workflow, not automatic content detection. Configure a real contact channel and any jurisdiction-specific notices before a public launch.

## Identity and limitations

A random HMAC-signed HttpOnly SameSite cookie identifies a browser. Secure cookies are enabled when `PUBLIC_ORIGIN` is HTTPS. This prevents tampering with an existing session ID but does not make a browser a verified person: clearing cookies can create another identity. The polls are for entertainment, not elections. There is no login, account recovery, or cross-device room ownership in v1.

Submitted text is escaped before DOM insertion. The server uses parameterized SQL, bounded JSON, same-origin checks, restrictive CSP, and MIME sniffing restrictions. Anonymous public content still requires ongoing moderation. Daily tasks use Europe/Moscow by default; configure `APP_TIMEZONE` before launch, not mid-contest.

The daily word puzzle rotates seven word pairs; the caption contest rotates five original scenes. Expand those content pools in `server/content.mjs` as the audience grows. Drawing comparisons are visual; no automatic recognition or score is claimed. Poll results and meme ranks are real visitor counts, with no invented engagement data.

## Validation

`npm test` exercises actual HTTP requests and temporary SQLite databases: publication, repeated votes, pair validation, poll option validation, room ownership and version conflicts, daily answers, pending media privacy, moderation, reports, quotas, origins, rollback, and restart persistence. `npm run check` validates JavaScript syntax, local asset references, and an 18 KB gzip ceiling for common assets.

The shared server test can be run with Node's coverage support:

```sh
node --test --experimental-test-coverage tests/server.test.mjs
```

UI interactions must also be checked in a real browser. Automated server coverage does not measure browser canvas behavior, mobile layout, or abuse resistance under a production workload.

## Stable question identities

`server/majority-questions.json` is the active bilingual catalog (1–200 entries). IDs are permanent slugs, with two immutable options per language. Reorder freely. For a wording clarification, increment `revision`; previous answers display their stored wording snapshot. For a changed meaning, translation meaning, or options/order, create a new ID. A revision cannot be reused with different wording or downgraded. Removing an active question hides it without deleting its answers or revisions; its link shows an explicit unavailable state.

`server/majority-legacy-v1.json` and its SHA-256 fingerprint are frozen migration evidence, not editable content. The initial 12 questions in commit `6382cf15bac35525e308db22f61208d0ff1d644a` match the first 12 in the 30-question expansion `0a8cd025cbdac674ee9ca9dced271af505460494`. This verified map imports exact numeric targets `0`–`29` once, in one transaction, preserving original `votes` rows. Unknown targets, invalid choices and conflicting rows remain untouched and surface an unassigned-data notice for the affected visitor. Existing stable answers win conflicts. Do not guess mappings for independently modified historical deployments; audit their catalog before upgrading.

Stop the old process, make and verify a backup of SQLite and `session-key`, then start this version. Do not run old/new server binaries against one database: the old binary writes only legacy rows. A failed migration stops startup and rolls back its writes; fix the cause and retry, without deleting the database or migration marker. Rollback of the application version requires restoring the pre-upgrade backup: the old version cannot see new stable-table answers. Restore drills and power-loss durability are not claimed by this change.

POST `/api/majority` accepts `{id: string, revision: number, choice: 0 | 1}`, at most 1024 request bytes. Numeric IDs fail with 400. Missing active IDs fail with 404; a stale revision or different second answer fails with 409. Retrying the same saved choice returns 200 with `duplicate: true` and does not add a vote. Browser results are confirmed by GET, never optimistic. A lost response triggers a read, not an automatic second write; if both reads fail, the user sees an unconfirmed-answer message.

Forecasts are browser-local, separate from votes. New records use permanent IDs and a revision, with at most 200 records. Old numeric forecast keys do not record their source catalog version, so they are preserved but ignored with a dismissible notice. Unknown/retired numeric links do not resolve through current array order. Public counters include only saved answers. Cookie loss still means a new browser identity; this does not add account recovery or cross-device voting protection.
