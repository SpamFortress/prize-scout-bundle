Paused by owner 2026-11-16; app stays local.

# Hosting Prize Scout

Plan only. Nothing here is deployed, no accounts are created, and no dependency is upgraded. `npm audit fix` is not part of this plan. Live search still does not run from this document.

Numbers below are what `npm audit` reported from `package-lock.json` on 16 November 2026: 16 vulnerable packages, 2 critical, 1 high, 11 moderate, 2 low. Re-run the audit before acting. Prices are public list prices to check on the day you buy. They are not quotes.

## 1. Pre-launch blockers

### Dependency advisories

Do not run `npm audit fix`. Several "fixes" are major upgrades (Next 16, Vitest 5, shadcn 1.0) and would land together. Upgrade one group, run the existing test, typecheck, lint, and build, then stop.

Production installs must use `npm ci --omit=dev`. Vitest, Tinypool, ESLint, and their trees are not part of the running site. That does not remove them from the repo, and it does not fix Next or the shadcn CLI tree, which are in `dependencies`.

| Package | Severity | Where it sits | Scoped fix |
| --- | --- | --- | --- |
| `tinypool` | critical | Vitest's worker pool. Dev only. [GHSA-5gmw-xhrv-c9v3](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3) (Tinypool `<=2.1.0`) and [GHSA-85c8-ppgw-ccpr](https://github.com/advisories/GHSA-85c8-ppgw-ccpr) (Tinypool `<2.1.2`): prototype pollution in worker options can become code execution. The lockfile's offered fix is Vitest 5.1.0. | Do not ship it. Omit devDependencies in production. Do not jump to Vitest 5 in the same change as Next. |
| `vitest` | critical | Direct devDependency `^3.2.7`. The package row is critical because it pulls Tinypool. Its own advisory is moderate path traversal, [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9), for Vitest `>=2.1.0 <4.1.11`. The only fix the audit offers is 5.1.0, a major. | Same change as Tinypool, and only if you choose to upgrade tests. Re-run the full suite. Not on the server if devDependencies are omitted. |
| `@vitest/mocker` | moderate | Dev only, via Vitest. Path traversal ([GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9)) and mock-registration injection ([GHSA-qxg6-89mg-rqv8](https://github.com/advisories/GHSA-qxg6-89mg-rqv8)). | Upgrades with Vitest. Not on the server. |
| `postcss` | high | Nested under Next at `node_modules/next/node_modules/postcss`, range `<=8.5.22`. Four advisories: XSS in CSS stringify ([GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93)), and source-map file reads ([GHSA-6g55-p6wh-862q](https://github.com/advisories/GHSA-6g55-p6wh-862q), [GHSA-fxqj-rqcc-2cmp](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp), [GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849)). The audit's suggested fix is Next 16.4.6. | First try an `overrides` pin of `postcss` to a patched 8.5 release newer than 8.5.22, and confirm the override replaces that nested copy, still on Next 15.5.29. Run build and tests. Do not treat a Next 16 upgrade as the first move. |
| `next` | moderate | Direct dependency `15.5.29`. The audit row is PostCSS, not a separate Next bug in this report. | Resolves when PostCSS is patched. Re-audit after the override. A Next 16 upgrade is a later, separate change. |
| `minimatch` | moderate | Dev (ESLint, typescript-eslint) and the shadcn CLI tree. ReDoS via glob parts ([GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)), versions 7 through 11.0.0. | Override `minimatch` to `>=11.0.1` in one change, then re-run lint and the shadcn tooling you actually use. |
| `@typescript-eslint/typescript-estree` | moderate | Dev, via ESLint. Pulls minimatch. | Goes quiet when minimatch is overridden or when `eslint-config-next` moves. No app-runtime change. |
| `@typescript-eslint/utils` | moderate | Dev. Depends on typescript-estree. | Same ESLint change. |
| `@typescript-eslint/type-utils` | moderate | Dev. Depends on typescript-estree and utils. | Same ESLint change. |
| `@typescript-eslint/parser` | moderate | Dev. Depends on typescript-estree. | Same ESLint change. |
| `@typescript-eslint/eslint-plugin` | moderate | Dev. Depends on type-utils and utils. | Same ESLint change. |
| `deepmerge` | low | shadcn CLI. Prototype poisoning of the object `mergeObject` returns ([GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4)), 4.2.0 through 4.3.1. | Move `shadcn` to devDependencies if the running server does not import it. If a lockfile still needs it at build time, override `deepmerge` off that range after checking the CLI still runs. Do not take shadcn 1.0.0 just because the audit offers it. |
| `shadcn` | moderate | Direct dependency. The audit path is registry, deepmerge, and ts-morph. | Same move as deepmerge. It is a code generator, not a request handler. |
| `@shadcn/registry` | low | Via shadcn. Pulls deepmerge. | Same move as shadcn. |
| `ts-morph` | moderate | Via shadcn. Pulls `@ts-morph/common` and then minimatch. | Same move as shadcn. Not a request handler. |
| `@ts-morph/common` | moderate | Via ts-morph. Pulls minimatch. | Same move as shadcn and the minimatch override. |

Order to do the work, each as its own change:

1. Production image omits devDependencies. Confirm the server starts.
2. `overrides` for `postcss` on a patched 8.5, still on Next 15. Build and test.
3. `overrides` for `minimatch` at `>=11.0.1`. Lint.
4. Move `shadcn` to devDependencies if imports allow, and override `deepmerge` if it remains.
5. Vitest and Tinypool on their own change. Tests only.

### Secrets

`PRIZE_SCOUT_SEARCH_API_KEY` is the Brave Search API subscription token. It is read on the server in `src/app/api/search/route.ts` and sent only as the Brave request header. It must stay in the host's secret store. It must not be prefixed `NEXT_PUBLIC_`, committed, logged, or returned by `/api/health`.

The add-on pairing token is a different secret (`data/addon-pairing.json` today, generated on first use). It is not the Brave key. On a host, set it once from the secret store instead of letting a fresh disk mint a new one, and show it only on the owner's Profile. Do not bake it into the extension package.

`/api/owner` already checks `PRIZE_SCOUT_OWNER_TOKEN` and answers 404 when the token is missing or wrong. Set that variable in the secret store. It is not the Brave key and not the pairing token. Rotate each secret on its own.

### Loopback assumptions to remove

These are true on this machine and false on a public host.

- The extension's only host permission is `http://127.0.0.1/*`, and the popup defaults to `http://127.0.0.1:4342`. A public app is `https://prizescout.app`. The extension will need that https origin as a host permission, still not a sponsor-site permission. Pairing stays a bearer token plus an extension `Origin`. Websites still get no CORS allow.
- `npm run dev` and `npm run start` bind `0.0.0.0` so a remote agent can open the app. A public process should listen on the platform's interface, with TLS ended by the host. Page fetches must keep blocking loopback and private IPs (`src/server/ssrf.ts` already does).
- Usage, the pairing token, and add-on checks are JSON files under `data/`. More than one machine, or a restart that drops the disk, loses them. They have to move to the shared database before a second instance or before crowd checks.
- Profile country, state, age, and email exist only in the browser tab. A hosted account, if you add one, is a new store with its own privacy notice. Do not silently start writing the tab profile to disk.

### Rate limits and abuse

Today one anonymous cookie can run `PRIZE_SCOUT_SEARCH_DAILY_CAP` searches a UTC day, default 25, counted in `data/usage.json`. There is no global cap, no per-IP cap, and no cache. A new cookie resets the daily count.

Before public launch:

- Keep the per-visitor daily cap. Hash the anonymous id with the server salt, as `dailyVisitorHash` already does. Do not store raw IPs.
- Add a global daily cap on Brave requests, `PRIZE_SCOUT_BRAVE_GLOBAL_DAILY_CAP`. When it is hit, every search returns the existing pause line.
- Add a per-IP ceiling that is higher than the per-visitor cap and lower than the global cap, so one network cannot mint cookies all day. Store only a daily hash of the IP plus the salt, not the IP.
- Cap add-on checks the same way: per pairing token, and a small global cap. A check must not trigger a Brave call or a fetch of some other URL.
- Keep rejecting page fetches that fail SSRF checks. Keep stopping on 403, 429, and captcha pages. Do not add a retry that pretends to be a browser.

### Brave budget

Each Brave call asks for 20 results. The handler defaults to 3 calls and will not make more than 6 (`maxBraveCalls` is clamped to 1–6). At the default `PRIZE_SCOUT_BRAVE_COST_USD` of $0.005, one search is about $0.015 at the default of 3 calls, or about $0.03 if it hits the ceiling of 6. A visitor at the default cap of 25 searches is about $0.38 a day at 3 calls, or about $0.75 if every search uses 6.

Set, in the host's secret store, before the key is turned on:

- `PRIZE_SCOUT_BRAVE_CREDIT_USD`, the balance you are willing to spend.
- `PRIZE_SCOUT_BRAVE_COST_USD`, the real price from your Brave invoice, not the default, if it differs.
- `PRIZE_SCOUT_LOW_CREDIT_USD` (default $2) so you get the low-credit notice.
- `PRIZE_SCOUT_SEARCH_DAILY_CAP` per visitor.
- `PRIZE_SCOUT_BRAVE_GLOBAL_DAILY_CAP` for the whole site.

Recommend starting the global cap at 100 Brave requests a day (about $0.50 at $0.005) until private testers are boring. Raise it on purpose.

### Search-result cache

There is no cache now. Every search pays Brave again.

Cache the Brave response, not the page-fetch verdict. Key it by the normalized query, the region, and the offset. Same query inside 6 hours reuses that response. Do not cache across different regions. Do not cache "Checked by you" snapshots. Do not cache a response that was an error, a 429, or an empty failure.

Store the cache in the same database as usage. A single-machine SQLite file is enough until you run two machines. Delete entries older than 24 hours even if the reuse window is 6.

Six hours is the recommendation. It cuts repeat searches from testers without serving a long-dead contest list. You can set `PRIZE_SCOUT_SEARCH_CACHE_HOURS`.

### Brave attribution

Brave's Search API terms require credit when you show their results to someone else. The results list needs a visible line that the search came from Brave, using the wording in the agreement you accept, with a link if they require one. Put it on every view that shows live results, including "no results". Do not hide it in a footer that only appears after scroll on mobile. Copy the required sentence from the current Brave API agreement. Do not invent a shorter one.

The Brave key stays server-side. Attribution is not a substitute for that.

### Privacy policy and terms

You need both before a public site, and before the Chrome Web Store listing. They have to match the software.

Say, in plain language:

- Contest email: the address the user types, plus the per-sponsor tag from `sponsorTag()`. It is sent to a sponsor only when the user presses Submit on the sponsor's site. The add-on does not press Submit. Personal mail is not the default.
- Profile: country, state, and age are used for eligibility. The default exclusion check is Idaho when no state is chosen. Say that. US-only is the current region. No SSN, bank, card, or government ID is collected. The profile today is tab memory. If hosting adds an account, say it is stored and how to delete it.
- Page fetches: the server requests the https page the search result named, to read rules and forms. It does not log the user's identity into that request.
- Add-on: a check sends the open tab's URL, title, and a DOM snapshot to the paired app. Cookies and payment fields are not the payload.
- Crowd checks, when they exist: one fact, not a screenshot, pending until a second person or a fetch agrees.
- Retention and delete: how long usage hashes, search cache, and checks are kept, and how the owner deletes a user's row.

Have a person read it. This plan is not legal advice.

### Robots and site terms

The fetcher already skips a host that returns 403 or 429, does not follow a redirect it was not prepared for, and blocks private IPs. Keep that. Before launch, confirm a fetch still reads `robots.txt` and does not request a disallowed path. A site that forbids automated reading stays unread. Do not add a headless browser to get past a block. The add-on is the user's own tab, not a bypass.

## 2. Where to run it

Low traffic means you and a handful of testers: tens of searches a day, not thousands. The search handler can run for tens of seconds (Brave, then page fetches, with a 22 second read budget). A host that kills a function at 10 seconds will cut searches in half.

Crowd-checked facts need a shared database before phase 4 of the add-on. Until then, SQLite on one disk is enough for usage, the search cache, and add-on checks. Postgres is the right target once two people can write a fact about the same row.

### Vercel

The Next app is what Vercel runs. Pro is about $20 per seat a month for a commercial site. Hobby is not the right plan if this is a product. A function timeout on Pro can be raised high enough for a search. The filesystem is not durable, so `data/*.json` dies. You add Neon or another Postgres on day one (free tier, then about $19 a month if you outgrow it).

Pros: deploys from git, TLS and preview URLs, little machine work. Cons: you pay the seat price before you have users, the long search has to be configured or it will time out, and a local JSON file cannot hold usage or crowd facts.

Rough low-traffic total: about $20 a month, plus $0 to $19 for Postgres.

### Fly.io

One small always-on machine (shared CPU, 256 MB or 512 MB) runs `next start`. A volume holds SQLite until you add Fly Postgres or Neon. The machine can stay inside the 22 second read budget because it is not a short function. List price for a single small machine plus a gigabyte volume is on the order of $5 to $10 a month. A small Postgres is extra if you start it immediately. Often another $0 to $15 while it is tiny.

Pros: one process matches the app you have, durable disk, a real Postgres later without changing hosts. Cons: you own the machine size, deploys, and logs. Less automatic than Vercel.

### A small VPS

Hetzner or DigitalOcean, the smallest general VM, about $5 to $7 a month. Caddy or the host's firewall terminates TLS. SQLite on the VM disk, Postgres on the same VM when crowd checks start.

Pros: cheapest steady bill, no surprise function limits, the whole app fits. Cons: you patch the OS, renew TLS, and restore backups yourself. A dead disk takes the crowd facts with it unless you copy them off.

### Recommendation

Use Fly.io. One small machine, SQLite on a volume for usage, the search cache, and add-on checks. Add Postgres (Fly or Neon) before any crowd fact is stored for more than one user. Vercel is the better choice only if you would rather pay the $20 seat and you set the function timeout on purpose. A VPS is the better choice only if you want the lowest bill and you will do the OS updates.

Do not start with two app machines. The JSON files and a single SQLite file assume one writer.

## 3. prizescout.app

You do this yourself. No account is created from this repo.

1. At a registrar you already trust, register `prizescout.app`. Turn on the registrar's lock and two-factor authentication. Renewal is yearly. Confirm the price before you pay.
2. Put DNS at the same place you will read mail, or at Cloudflare if you want their proxy. Create the zone for `prizescout.app`.
3. Add the records the host shows you. For Fly, that is the A and AAAA records Fly gives the app, plus `www` as a CNAME to the apex or to the Fly hostname. Do not leave the domain on the parking page.
4. In the host, add the certificate for `prizescout.app` and `www.prizescout.app`. Redirect `www` to the apex, or the reverse, and pick one canonical URL.
5. Set `PRIZE_SCOUT_SEARCH_API_KEY` and the other secrets in the host. Open `https://prizescout.app/api/health`. It should say search is connected without printing the key.
6. Point the extension's app address at `https://prizescout.app` only after the host permission and CORS allow that origin. Until then, testers keep using loopback.

## 4. Staged rollout

**Private.** The host is up, the Brave key is set, the global daily cap is small, and search results show Brave attribution. Only people you send the URL to. The site can require the add-on pairing token, or a separate tester password, on `/api/search`. You and those people try the real searches you care about: Honda, a cruise, a gun, Visit Orlando, Malecki. Watch Brave spend for a week.

**Public.** Remove the tester gate. Publish the privacy policy and terms at stable URLs. Raise the global cap only after the week of receipts matches the cap. The add-on stays unpacked for you until Chrome, Edge, Firefox, and Safari are all built, which the add-on plan already requires before outside users.

Crowd checks stay off until Postgres is the store and the privacy policy describes them.

## 5. What you do by hand, and what you decide

You do:

- Re-run `npm audit` and apply the scoped upgrades above, one group at a time. No `npm audit fix`.
- Create the host account, the domain registrar account, and the Brave API account. Put the Brave key only in the host's secret store.
- Register `prizescout.app`, set DNS, and confirm TLS.
- Choose the canonical host name and the global Brave cap.
- Write, or have written, the privacy policy and terms. Publish them before the public step.
- Copy Brave's required attribution line from their current API terms into the results page.
- Read a week of private-tester logs and the Brave invoice before opening the site.

You decide:

- Fly.io (recommended), Vercel, or a VPS.
- SQLite on one volume until crowd checks, then Postgres. Recommended: yes.
- Search cache window. Recommended: 6 hours.
- Per-visitor cap (default 25) and global cap. Recommended global start: 100 Brave requests a day.
- Whether `www.prizescout.app` redirects to the apex. Recommended: yes.
- Whether private testers need a password in addition to an unlisted URL. Recommended: yes, a single tester password, not accounts yet.
