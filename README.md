# Prize Scout

Prize Scout is a local app for keeping track of official contest pages you choose to check. The search box does not search the public web.

## Run

```bash
npm install
npm test
npm run typecheck
npm run lint
npm run build
npm run dev
```

Open [http://127.0.0.1:4342](http://127.0.0.1:4342) for the checker. For the practice copy, open [http://127.0.0.1:4342/practice](http://127.0.0.1:4342/practice).

## Practice copy

Use Node.js 20 or newer and npm. From this folder:

```bash
npm install
npm run dev
```

Then open only `http://127.0.0.1:4342/practice` on this computer. The dev server listens on port 4342. Do not put that port on the public internet. `npm start` after `npm run build` uses the same port.

Practice Home opens as a centered sample search. A blank search stays on that screen. After a word is submitted, the search shrinks above the sample rows and Add search can keep another sample request. The Home tab returns those sample results. The Prize Scout name on any practice tab returns to the centered search and leaves the requests and bookmarks in place. Saved and Entries search only the samples already on that tab. Those requests filter the synthetic list. They do not search the web. Home, Saved, Entries, and Profile in that practice stay on synthetic samples. About is the existing About page. Choosing About and then Home returns to the practice list for the rest of that browser session. A full reload clears the practice: checks, pins, filters, receipt edits, and preference switches. Nothing is written to disk or to the production Saved, Entries, or Profile screens. Those production screens remain at `/`, `/saved`, `/entries`, and `/profile` if you open the addresses directly.

`/design-preview` is still the older single-page sample. The practice tabs are the ones to use.

## Before a public release

State tax figures in the practice panel are sample illustrations. `src/domain/us-states.ts` lists all 50 states and the District of Columbia with `officialRate` left empty. Do not publish until each slot has a rate taken from an official source. Do not fill those slots with an estimated or invented rate. The practice region list is the United States only until another region is ready to add.

## What works in this build

- Search form with the placeholder `I want to win…`.
- Source checkboxes: All, Web, X, Facebook, Instagram, in any combination.
- Region bias, default United States. Optional “only pages that state this country.”
- When you search, the page says **Start in Prize Scout chat** next to the full request, for example: `Open Prize Scout and ask: Search furniture on Web and X in the US.`
- The chat link is `grokbot://app/v1/agent?id=local-practice`.
- Sort for pages checked in this tab: Relevance, New, Ending soon.
- Checkboxes, select-all, and a detail view. Prize value appears only when the page states one. Photos appear only when the page has an https image. There is no stand-in photo.
- Official-page check: `POST /api/evidence/check` with `{ "url": "https://…" }`. The server fetches that one https page if robots.txt allows it and the host is public. It records a form and a rules link only when they are in the HTML. It does not follow redirects. It does not submit the form.
- A directory or social page cannot be selected for entry.
- Rule check and automation check are separate. Automatic fill is recorded as `not_submitted`. No sponsor is contacted. No CAPTCHA is solved.
- A checked official page can store a prize description taken only from a prize or product section, up to 12,000 characters. Longer text is cut at that bound and labeled as the remainder still being on the official page. Headings about entry, rules, deadlines, winners, claims, sponsor contact, or eligibility are not that description. A page with no such section says the prize description was not captured. Older short paragraphs are not treated as the full prize text.
- Enlarge uses https images from that same page only when there is related evidence: the summary `og:image` when it is not a logo, tracker, or ad host (shown as page photos, not as proof it is the prize), images in a prize or product gallery, a carousel or swiper that sits in that prize section, and a figure tied to the prize section. A general carousel, including one on the whole page, is not included. At most 24 images are kept. One image has no previous or next control. This is observed evidence, not a guarantee that every prize photo was found. If none qualify, the dialog says prize photos were not captured.
- Searches last until reload, as do checked rows.
- Entries show days left from an explicit end date, or “End date not stated.”
- A saved search can still be built in code from the query, sources, and region only. The Search screen does not offer “Save this search,” and the Saved tab lists contests only. Rerun links of the form `/?q=&sources=&run=1` still open that search. Nothing is written to `localStorage`.
- Profile country, state, age, and a dedicated email stay in tab memory. They are not saved. Personal email is a box you can type into while filling a sponsor form; it is not stored. Prize Scout keeps contest details and does not keep a second identity record. Email Fortress and Phone Fortress keep verified identity they already have. Profile can prepare an unpaired Fortress draft only. A redacted handoff is created after a form preparation only when a lane is paired, handoff is enabled, and the recipient has acknowledged it. This app has no transport, so that handoff is not delivered. Filling is not an entry. Post-contest cleanup is Fortress’s job. Nothing is paired or submitted from the page.

## What is not connected

- **Web search.** Set `PRIZE_SCOUT_SEARCH_API_KEY` to a Brave Search API subscription token. The server sends it only as the `X-Subscription-Token` header to `https://api.search.brave.com/res/v1/web/search`, then fetches each https result. A page is listed only after that fetch shows a form and a rules link. If the key is missing, practice keeps labeled samples and does not invent a listing. `PRIZE_SCOUT_WEB_TOOL_MODULE` is not read.
- **Entry submitter.** Not connected. `PRIZE_SCOUT_SUBMITTER_MODULE` is not loaded, and this app does not import a package from that variable. Automatic means a free contest whose rules allow automation and whose form was verified: the click would fill Profile (country, state, age, dedicated email) and submit without opening the contest page. If rules prohibit automation, the page needs a captcha or login, or the form was not verified, the caption is Manual · Rules or Needs you and the official page opens instead. Paid never autofills or submits. Entered is recorded only when a submitter confirms the sponsor response. Practice samples simulate that click and never confirm.
- **X, Facebook, Instagram.** This server has no account and no authenticated browser. Those checkboxes only change the chat request. Facebook and Instagram need a signed-in browser that this app does not have.
- **Public directories.** Not loaded. A directory page is not an official entry.
- **Mail.** A provider inbox needs custom app credentials. There is no OAuth and no invented inbox route.
- **Email Fortress.** There is no transport. Profile’s button prepares an unpaired draft only: email `prize-scout-email-cleanup/v1` / `link_proposal`, and phone `prize-fortress-v1` / `PRIZE_FORTRESS_PAIR_REQUEST` with status `pending`, `ownerConfirmed: false`, `accepted: false`, `connected: false`. Pending is not acceptance and is not a connection. Pairing consent is explicit only when you send it in Prize Scout chat. The draft may include only a redacted sponsor, a public URL, a coarse date, the entry method, the channel, and an opaque reference. The app does not read mail, send email, or opt you out.
- **Win classifier.** Not included.
- **Celebration.** Not embedded and not opened automatically. It is not in the main navigation. The About page still links the existing page: https://example.com/prize-scout-preview
- **Deployment.** This build is local. It has no login. Do not put it on the public internet as-is: the page checker will fetch a public https URL you name. No hosted URL is published from this repo.

## Adapter contract

Live search is the Brave Search API, behind `PRIZE_SCOUT_SEARCH_API_KEY`. This app still fetches each URL and reads the HTML. A search hit is not an official entry until the page itself shows a form and a rules link.

A future submitter package would export `createSubmitter()` and be named by `PRIZE_SCOUT_SUBMITTER_MODULE`. It is not installed. It would have to refuse payment, captcha solving, and any Entered result that the sponsor did not confirm.

```json
{ "verified": true, "urls": ["https://sponsor.example/enter"] }
```

`GET /api/health` reports `webSearchConnected` from whether `PRIZE_SCOUT_SEARCH_API_KEY` is set, and `submitterConnected: false`.

## Tests

`npm test` covers dates, ids, eligibility, explicit prize values, directory rejection, checkpoints, the not-submitted autofill result, profile refusal of card numbers and Fortress mode, profile-free saved searches, the chat sentence, robots rules, and the page checker with a fixture HTML page. The browser check starts its own server. Fixtures live in the test file only. The UI does not ship sample contests.

Screenshots are not written unless you set `SCOUT_ARTIFACT_DIR`. The interaction checks still run. To save the Saved shots on this cloud machine:

```bash
SCOUT_ARTIFACT_DIR=/opt/cursor/artifacts npm test
```

That writes `prize-scout-enter-default.png`, `prize-scout-title-details.png`, `prize-scout-image-enlarged.png`, and `prize-scout-saved-list.png` into the directory you named.
