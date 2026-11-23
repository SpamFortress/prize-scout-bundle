# Search parameters

This is how a search works today, after the fix that followed the `7a09dd3` retest. Each section says what is steady, and what flipped between `5208636` and `7a09dd3`.

No search in the offline suite calls Brave. Live search still uses the Brave API only when a key is set.

## Natural-language query

The typed words are trimmed and cut at 180 characters. A blank search is not sent.

The open queries are the words plus `giveaway`, `sweepstakes`, and `contest`, skipping a word the user already typed. That is at most three calls. A vehicle query such as dirt bike replaces the last of those with one synonym query (`motorcycle`, `motocross`, `off-road`, `CRF`, `KTM`, `ride red`, and the same idea for ATV, UTV, snowmobile, and jet ski). Synonyms do not add a call.

A gun query also adds the known giveaway URLs for Guns.com, Gun Talk, and the NRA Whittington Center when those hosts block a fetch. A vehicle, gun, or retail query can add one `site:` query for the watched domains in that category, including `powersports.honda.com` for vehicles. Two platform queries (Gleam, SweepWidget, KingSumo, ViralSweep, Easypromos, Woobox) follow. The cap is 6 Brave calls. Load more uses the same open queries at a higher offset and does not repeat the synonym or site queries.

Prize relevance sorts inside a rank group. It counts how many of the query's ideas (truck, Honda, cruise, dirt bike, and so on) appear in the title or prize. A prize mismatch also keeps the page out of Verified: the brand has to appear in the title, sponsor, or prize, and an extra product word such as "generator" has to appear there too.

What flipped: `c88c2ca` made a prize-word mismatch throw a page out of Verified. `5208636` put that back to a sort only. `7a09dd3` left the sort alone and instead required the rules text to say "Sponsored by", "enter to win a …", and a date the parser could read. Real sponsor pages do not use those exact phrases, so they fell to Check. This build keeps the `5208636` rule for what counts as a giveaway, and a prize mismatch still keeps the page out of Verified. It also keeps the page-type bans below.

## Source selection and region

A result is `web`, `x`, `facebook`, or `instagram` from its host. The practice source chips filter that label. They do not add a search.

The practice region control is United States only, and the control is hidden until another region is ready. "All" is the entry-method filter (free and paid together), not a region. The saved region is stored with the search and does not change which Brave results come back.

What flipped: nothing in this area. Region has stayed a stored label, not a live search filter.

## Eligibility

Age, state, and country come only from sentences on the fetched page. A minimum age is read from "must be 18", "at least 21", and the same kind of phrase. A bare "15+" is not an age. Included and excluded state codes are read from the rules text. "Not open in your state" is that list, or a watched source's state note, compared with the profile state. The app does not invent a state or a country when the page is silent.

What flipped: nothing here. Missed eligibility has been a read problem (the page was not fetched, or the sentence was not in the HTML), not a changing rule.

## Fetch limits

Brave: up to 6 calls, 8 seconds each. Direct page reads: 48, six at a time, and the read phase stops after 22 seconds. A page that was not read names the unconfirmed facts (end date, free entry, eligibility, and entry method) and why the check stopped. A search-preview date is quoted only when the snippet stated one, and it does not set the end date or mark the row Ended. Ended requires a date read from the page or its rules page. Redirects are not followed. robots.txt is still checked first.

Read order: a sponsor's own contest path (the path contains sweepstakes, giveaway, contest, sweeps, or /win, and the host is not an index, aggregator, or news site) first; then a snippet that already says no purchase necessary, official rules, enter to win, or an end date; then other pages; aggregators, republishers, and news last. One host can take 3 of the first slots, then more only if room remains, so one domain cannot use the whole budget. After a host's first 403, 429, or robots refusal, later URLs on that host are not fetched. They keep the blocked-sponsor note, and the freed attempts go to other hosts.

On an instant fixture set larger than the cap, 48 rows are read and the rest are not attempted. Live pages are slower, so a search can stop earlier than 48 when the 22 seconds run out. That is still far more than the old 20 sequential reads, which left about 23 rows per search unread across the 15-search retest (346 unread rows).

A different Official Rules, Terms, or same-site rules link is a separate fetch. At most 10 of those per search. Each one has its own 4 second limit. If it fails or times out, the listing keeps the main page, including its prize and end date. The note says the rules link failed. It does not say the page was not read. The rules page can fill a blank end date. It cannot erase one. A shop page is disqualified for an entry widget (Gleam, SweepWidget, ViralSweep, and the other entry embeds) plus Add to cart only when that page does not state a free entry and an end date. HubSpot, a newsletter form, and a theme Add to cart button are not that widget. When that shop-widget rule is the only disqualifier, a qualifying rules page clears it. A post whose body names a winner stays Check even when it links to the current rules. Footer text stays out of the rules text.

Directories are not expanded (`expandAllowed` is false).

What flipped: `e2a45f3` still stopped at 20 sequential reads, so BlueRibbon, Steezy, Freego, and the 2011 WinPrizesOnline copy were often never opened. `7a09dd3` also mixed a failed rules fetch into the "page was not read" note and could drop an end date.

## Verified, Check, Directory, Store, Ended

One list. Rank is:

1. Verified or Store
2. Check
3. Directory, or a page that was not read
4. Ended

Inside a group, prize relevance, then the original Brave order.

The trial view (`RESULTS_VIEW = "verified-only"` in `src/config/results-view.ts`) shows Verified rows only. Needs checking, Paid entries, and Related pages are collapsed underneath. Set that constant to `"ranked"` to put leads and store rows back on the main list. News stories, press copies, lists, directories, and store or review pages stay in Related pages. Verified means the fetched page is one consumer giveaway, the official rules were read, and the page states an end date that has not passed. A missing end date stays Check, with the note "End date needs checking." Rules that were not read stay Check with the rules note. A missing date is not Ended. A trade or professional design contest, including a `/trade/` path, stays Check. "No purchase necessary" still counts when a few words sit between "no purchase" and "necessary" or "needed", including the sentence Sandals and Dream Giveaway use. That sentence has to be in the rules body or in the page's own script or JSON, not only in the site footer. The page also needs its own entry method: an email form, entry steps, a mail-in address, a same-site Enter now / Enter to win link, or an embed from Gleam, ViralSweep, Woobox, ShortStack, SweepWidget, KingSumo, Easypromos, RafflePress, Rafflecopter, Wishpond, Typeform, Google Forms, HubSpot, or Jotform. A header that says "shop now" does not cancel a separate entry form. A past end date is not Verified.

These stay Check even when they quote rules: a press copy (a wire host, a `press-release` or `ein-presswire` path, a wire dateline, or the same long release id on two hosts; the bare word "press" is not enough); two sponsors, or two or more different end dates in the main prize block (a start date, a related-sweepstakes sidebar, and a runner-up prize inside the same rules block do not count as a second contest); a catalog page with several Enter Now links or several named contests; four or more "promo code" mentions; plural index paths such as /giveaways and /contests; how-to, guide, and roundup titles; an article with a byline and "min read" or "according to"; a comment-to-enter or tag-a-friend post with no mail-in; a store page with Add to cart and no free-entry sentence; a store page whose only entry method is a widget until that page states a free entry and one end date; a rewards or points catalog with no end date and no free entry. Fetch's Roblox page is that last kind. A sponsor's own rules posted on their blog, such as Murphy's Diesel, stay Verified. A single PrizeGrab contest page stays Verified. A blocked official page stays Check and sorts above press copies of the same contest. The wire's date and prize are not copied onto it.

An end date can be "Ends: October 22, 2026", "Close Date: Oct 4, 2026", "ends 11:59 p.m. Eastern Time on November 18, 2026", or "Ends 1/17/26". The later date in a stated range is the end. A date with no year, such as "ends July 1", is not given a year. JSON `endDate` or `validThrough` on the page counts. The date nearest "ends", a close date, or the promotion period is the one that is kept.

These are never Verified, even when they quote a full set of rules: how-to, guide, ways, tips, or plan in the title or path; a winner announcement; a press release, investor page, or earnings page; a listicle; a homepage; a page with six or more links to other sites' contests; Fox 8, MoneyPantry, TheFreebieGuy, GiveawayDrop, InstaGC, UltraContest, WinPrizesOnline, Sweepskings, and Slickdeals. A sports-team rules page whose prize is not the searched brand stays in the list as Check.

Store is a Verified page that sells entries ("1 entry per $1") or a watched store brand. Paid entries are never filled. If the page is only Check, it is not moved into Store. That is why the Store group vanished on `7a09dd3`: the sponsor pages stopped being Verified, and Store is not a separate guess.

Directory is a known directory host, or an unread directory. Ended is a parsed end date before today. An ended copy is hidden when an open official page of the same contest is in the list. "Ended in 2011" is December 31 of that year. A clock between "ends" and the date ("ends 11:59 p.m. Eastern Time on November 18, 2026") now counts.

What flipped: `5208636` verified any page with no-purchase-or-three-details and an entry method, so guides and indexes that quoted those words were Verified. `7a09dd3` required the magic phrases, so AmericanTrucks (the sponsor is named as `("Sponsor")`, the prize is the title, the date has a clock in it) became Check, and Visit Orlando stayed Verified because that page really says "Sponsor: Visit Orlando", "Win an Orlando Family Vacation", and "ends on 01/18/2027". UltraContest's vacation index was Verified because it repeats other contests' "sponsored by", "win a vacation", "through April 4, 2027", and "enter contest" on one page. A Columbia release and a WinPrizesOnline Ride Red copy were Verified when they quoted a real rules page and the title did not contain the words the ban was looking for.

## Saved searches

Search updates the open saved request. It stores the query, the source chips, and the region. Adding a search parks that request and leaves its results attached. A contest checked during a request stays on that request. Saving does not run another Brave search by itself.

What flipped: nothing.

## Re-entry check

The clock is read only from the rules text. "Once per day" or "daily" is the next midnight in the zone the rules name. "Once per week" is seven midnights later. "Once per 24 hours" is 24 hours after the confirmed entry, not a midnight. "One entry per person" does not reset. If the rules name no zone, the zone is unknown. The app does not fill that in as Eastern Time, and it does not invent a daily or weekly reset time. The next time is shown in the viewer's zone only when the rules named one. The app does not submit the entry. Age, state, country, prize, and end date shown on a row still come only from words or structured data on the page. The domain name is not turned into a sponsor.

What flipped: nothing in this round. The zone math has been stable since the entry-clock change.

## Offline suite

`tests/live-retest.test.ts` is the gate for the 15-search labels. It uses saved excerpts of pages that were fetched without Brave (AmericanTrucks, Visit Orlando Win a Trip, the UltraContest vacation index, the Columbia press-release index, the WinPrizesOnline homepage, and TheFreebieGuy's current list) and short pages in the same shape for the sponsor sites that did not return a contest document on one fetch. Change the labels only when a real page shows the rule is wrong. Run this file before any live retest.
