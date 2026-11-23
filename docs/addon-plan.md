# Prize Scout browser add-on

Phase 1 is in `extension/` and `src/app/api/addon/`. The add-on does not search the web and does not call Brave.

Prize Scout today fetches a page from the practice app and classifies the HTML that came back. A script-built form never appears in that HTML, so JetBlue, Carnival, Ramsey, the current Visit Orlando page, and the current John Malecki / Giveaway Gator page stay Needs checking with "Entry form is not in the page HTML." The add-on reads the tab the user already opened, after the page has rendered, and hands that DOM back to the same classifier.

The filler that already exists is `fillPrizeScoutForm` in `src/domain/prefill.ts`. It types into fields and returns `clickedSubmit: false`. The contest email tag is `sponsorTag()` in `src/domain/entry-email.ts`. Hosts whose terms forbid a filler (Woobox, ShortStack, campaign pages, Rafflecopter) already return `open-only` from `entryHostPolicy()`. The add-on reuses those functions. It does not grow a second set of rules.

## What it will not do

- No crawling, no background fetch of other URLs, no reading of tabs the user did not open.
- No way around a block, a captcha, or bot detection. If the rendered page is a challenge, the add-on stops and says so.
- No clicking Submit, no keystroke into a payment field, no prefill of a paid entry.
- No `<all_urls>`, no host permission broader than the one tab and loopback.

If the official rules are on a different page, the add-on asks the user to open that page. It does not fetch it.

## Browsers

The owner enters contests in Chrome. Phase 1 is built and tested in Chrome first. That order is confirmed.

Before any outside user gets the add-on, it ships for Chrome, Edge, Firefox, and Safari from one shared codebase. There is not a second copy of the classifier or the filler.

The shared code calls the WebExtension API through one shim: `globalThis.browser ?? globalThis.chrome`. Chrome and Edge use `chrome`. Firefox uses `browser`. The same Manifest V3 package is what Chrome, Edge, and Firefox load. Edge can install the Chrome package. Firefox differences (background event page, host-permission prompts) stay inside the shim, not in a fork.

Safari uses that same package inside an Xcode Safari Web Extension wrapper (`xcrun safari-web-extension-converter`, then the Xcode project). Shipping Safari to anyone other than the owner requires the Apple Developer Program, which is $99 USD per year. A local unsigned build on the owner's Mac can be used for testing. The App Store pass and the paid membership come before an outside user installs it. Do not start from a Safari-only project.

## Permissions

| Permission | Why | What we refuse |
| --- | --- | --- |
| `activeTab` | After the user clicks the toolbar button, read the DOM of that one tab. | No access to other tabs. The grant ends when the tab closes or navigates, per Chrome. |
| `scripting` | Run the shared reader and `fillPrizeScoutForm` in that tab, only from the button click. | No injection on page load. No content script registered for every site. |
| `storage` | Keep the pairing token, the chosen email, and the profile copy on this machine. | No `sync` storage. Nothing leaves the browser except the loopback call the user paired. |
| Host `http://127.0.0.1/*` and `http://localhost/*` | Talk to the practice app the user is running. The dev server in this repo listens on port 4342. The allowlist is loopback, not the public internet. | No sponsor-site host permission. A tab is read only through `activeTab` after a click. |

Optional later, not in the first build: `contextMenus` so "Check this page" can sit in the right-click menu. That is still a user gesture on the active tab.

## How a check works

1. The user opens the sponsor page themselves and clicks the Prize Scout button.
2. The extension reads the rendered DOM of that tab: forms, buttons, visible text, and same-origin shadow roots `fillPrizeScoutForm` can already see. Closed shadow roots and cross-origin iframes are reported as limits, the same way the bookmarklet does. They are not bypassed.
3. The extension sends a small snapshot to the practice app on loopback: page URL, title, visible text, and whether an entry control was present. It does not send cookies, storage, or the whole HTML file if a text-and-structure summary is enough for the classifier.
4. The practice app runs the existing gates: a real entry control, rules text that passes `rulesContentIsReal`, a stated end date, scam and lookalike and casino checks, and the Idaho exclusion. The row is marked **Checked by you**.
5. If those gates pass, the row is promoted with the same rules as a fetched Verified row. The source stays "Checked by you", so it is not presented as a Prize Scout fetch.
6. If the rules link points somewhere else, the add-on names that URL and waits. The user opens it and clicks the button again. Two snapshots, one row.

Pages this is meant to repair: JetBlue, Carnival, Ramsey, Visit Orlando, and Milwaukee / Giveaway Gator, when the rendered tab actually shows a form or an entry button. A newsletter Subscribe box still does not count. `realEntryForm` already ignores a Subscribe button that is not an entry label.

## Prefill

Prefill is a second click, or the second half of the same click after the user confirms the form is free.

- Email is the contest address: the user's base address plus `sponsorTag(sponsor)`, the same tag the app already builds. The sample shape is `entrant+sponsorTag@example.com` when that base address supports plus addressing. If the form rejects a plus address, the untagged address is used, matching `taggedEmail()`.
- The user can pick a different address in the extension. Personal mail is not the default. The app already warns that sweepstakes lists are often sold.
- Name, phone, address, city, state, ZIP, and date of birth come from the profile the user typed into Prize Scout. They are stored in extension local storage and in the practice app's own profile store. They are not sent to a sponsor until the user presses Submit on the sponsor page.
- Never fill SSN, bank, card number, CVV, government ID, or any `autocomplete` of `cc-number`, `cc-csc`, or `bday` paired with a payment form. If the only empty fields are payment fields, prefill stops and says so.
- Paid rows and `entryHostPolicy() === "open-only"` hosts get no filler. The button opens the tab and stops.
- `fillPrizeScoutForm` does not click Submit. The add-on must not add a submit click.

## Loopback, and why another site cannot call it

The practice app is the only server. The extension talks to `http://127.0.0.1:<port>` (4342 in this repo's dev script). A later hosted app is a different phase.

A random website can try `fetch("http://127.0.0.1:4342/...")` from the user's browser. Chrome treats that as a private-network request and sends a preflight. The practice app answers that preflight only when three things are true:

1. The `Origin` is `chrome-extension://<this extension id>` (and the Edge equivalent). Any https site origin is refused. There is no `Access-Control-Allow-Origin: *`.
2. The request carries the pairing token in a header, `Authorization: Bearer <token>`. The token is 32 bytes from the browser's crypto generator, shown once in the practice app, and pasted into the extension by the user. It lives in `chrome.storage.local` and in the app's local store. It is never written into a page, a bookmarklet, or a query string.
3. The route ignores a token that arrives from a non-extension origin even if someone copied it.

The extension id is fixed once the package is packed (the `key` in the manifest). Until then, unpacked installs get a new id whenever the folder changes; the practice app shows "paired extension id" so the owner can see a mismatch.

Loopback is not a secret. The token and the origin check are the secret. Binding the server to `127.0.0.1` rather than `0.0.0.0` keeps other machines off the port. This repo's dev script currently uses `0.0.0.0` so a remote agent can open it. A pairing build should bind `127.0.0.1` on the owner's machine.

## Where data sits

| Data | Extension | Practice app on this machine | Sponsor site | Later host |
| --- | --- | --- | --- | --- |
| Pairing token | `chrome.storage.local` | local store, shown once | never | never |
| Profile fields the user typed | local copy for prefill | the existing profile | only if the user presses Submit | not in phase 1 |
| Contest email tag | computed, not a separate secret | same `sponsorTag()` | the email field, after Submit | no |
| DOM snapshot of the open tab | memory for that click | the row, labeled Checked by you | never | not in phase 1 |
| Crowd fact (later) | not stored | pending queue | never | one fact, not a screenshot |

SSN, bank, card, and government ID are not fields in the profile and are not accepted if a page asks for them.

## Threats

**A page plants fake official rules in its own DOM.** The user is looking at that DOM, so the add-on will see the fake text. The classifier still has to pass the same gates (free entry, eligibility, a real end date, scam phrases, lookalike sponsor, sweeps-casino note). The row is labeled Checked by you, not "Prize Scout fetched this." A pay-to-claim sentence still blocks Verified. The user sees the facts on the row before they are saved.

**A lookalike host pretends to be the sponsor.** The open tab's URL must match the row the user is checking. `lookalikeSponsorNote` still refuses a page that claims to be Walmart, Costco, Amazon, or Target on someone else's host. A gift-card prize from a named other sponsor stays allowed, as it does today.

**Pay-to-claim or a payment form.** `scanScamWarning` runs on the snapshot. Payment fields are not filled. A row that asks for a card, a fee, or a deposit to receive the prize stays Needs checking.

**A malicious page calls loopback.** Refused without the extension origin and the pairing token. The token is not in the page.

**A malicious page reads the profile out of the extension.** Page scripts cannot read `chrome.storage`. The content script does not write the profile into the DOM except into the form fields the user asked to fill, and only the non-payment fields.

**Closed shadow or cross-origin widget.** Reported as a limit. The add-on does not pierce it. Gun Talk's widget-without-rules case stays Needs checking with the widget note unless the rendered tab actually shows rules text.

## Chrome Web Store

Single purpose: check the sweepstakes page the user opened, and prefill a free entry form. The listing should say that and nothing broader.

Limited use: `activeTab` plus loopback. No remote code. The classifier runs in the practice app the user installed, or later in the extension package itself. No downloaded scripts.

Privacy policy, required before a public listing: what the button reads, that profile data stays on the device, that a snapshot is sent only to the paired loopback app, retention, and how to delete it (remove the extension and clear the practice profile).

The listing must not say the extension enters sweepstakes for the user. It prefills. The user submits.

A local unpacked install does not need the store. The policy notes apply when the owner publishes.

## Phases

### Phase 1. Check the open tab

Build and test this in Chrome first. The owner enters contests there, and that order is confirmed. Ship an unpacked MV3 extension and a loopback route on the practice app. Chrome is the only browser this phase has to pass before the owner uses it. Outside users wait until Chrome, Edge, Firefox, and Safari all ship from the shared codebase.

Acceptance:

- Clicking the button on a tab whose rendered DOM has an entry form, no-purchase language, eligibility, and a stated end date marks that row Checked by you and Verified under the current gates.
- The same button on a page with only a Subscribe box stays Needs checking.
- JetBlue, Carnival, and Ramsey still do not verify from a static HTML fetch. They verify only when the user's rendered tab shows the form.
- Visit Orlando and Milwaukee / Giveaway Gator follow the same rule: rendered form or entry button, or they stay Needs checking.
- A rules link on another URL does not get fetched. The add-on asks the user to open it.
- Gun Talk with a widget and no rules text stays Needs checking with the widget note.
- A captcha or a block page is reported and not worked around.
- A request to loopback without the pairing token, or from a normal website origin, is rejected.

### Phase 2. Prefill

Acceptance:

- A free form is filled with the plus-tagged contest email and the profile fields. Submit is not clicked.
- A paid row and a Woobox or ShortStack host are not filled.
- Card, CVV, SSN, and bank fields are left empty.
- The email matches `taggedEmail()` for the same sponsor string.

### Phase 3. Edge, Firefox, and Safari from the same code

Required before any outside user. Not a rewrite.

Acceptance:

- The shimmed package passes the phase 1 checks in Chrome, Edge, and Firefox.
- The Xcode Safari Web Extension wrapper, holding that same package, passes the phase 1 checks on the owner's Mac.
- The Apple Developer Program membership ($99 USD per year) is in place before a Safari build is offered to anyone else.

### Phase 4. Crowd checks (design only in this plan)

For a row that already names the missing fact ("End date needs checking", and the same shape for the other missing facts), the user opts in. The add-on opens the guidance on that row, the user goes to the spot on the page, and the add-on stores that one fact. Not a screenshot. Not the full rules.

The fact stays pending. It does not verify the row. A second person, or a later Prize Scout fetch of the same page, has to agree. If they disagree, the fact stays pending and the row stays Needs checking. This needs a host. Phase 1's loopback app is not that host.

Privacy: the stored fact is a date, a yes/no, or a short quote the user confirmed. No name, no email, no profile. Abuse: one pending fact per row per user, a cap per day, no account required beyond a local id until the host exists, and a report control that drops a fact back to pending. The owner turns this phase on only after the host and the privacy policy exist.

## Accepted decisions

These were open questions. The recommended answer is accepted for each.

**Checked by you is visually distinct from a fetched Verified row.** Accepted. Same promotion rules, different source label, so a DOM-only check is not mistaken for a Prize Scout fetch.

**The profile lives in the practice app.** Accepted. The extension keeps a copy for prefill while the host is offline. The extension is never the only copy. Clearing the app profile clears the extension copy on the next pairing.

**The default email is the dedicated contest address the user sets, plus `sponsorTag()`.** Accepted. `entrant@example.com` is the documented example, not a baked-in default. The owner types the base address once.

**Mail-in text on a rules page does not count as the entry control for Checked by you.** Accepted for phase 1. The add-on is for a rendered form or entry button. Mail-in stays a rules fact, not a substitute for the missing form.

**The add-on does not read a closed shadow root inside Giveaway Gator or Gleam.** Accepted. If the form is not visible to the page script, the add-on reports the limit and leaves the row unchecked. No debugger permission.

**A crowd fact becomes Verified for everyone only after a second distinct user submits the same fact, or a Prize Scout fetch of that URL agrees.** Accepted. One user is never enough. Disagreement does not verify.

**Phase 1 does not publish to the Chrome Web Store.** Accepted. Unpacked on the owner's machines first. The store listing, the privacy policy, and the fixed extension id come after phase 2 works locally. Outside users still wait until Edge, Firefox, and Safari ship from the same codebase.
