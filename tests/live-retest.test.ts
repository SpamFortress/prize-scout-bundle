import { existsSync, readFileSync } from "node:fs";
const PRIVATE_FIXTURES = existsSync(new URL("./fixtures/retest/vance-ruger.html", import.meta.url));
import { describe, expect, it } from "vitest";
import { WIDGET_RULES_NOTE, bucketRows } from "@/config/results-view";
import { statedEndIso } from "@/domain/dates";
import { isExcludedDirectorySource } from "@/domain/verification-checks";
import { confidenceTier, searchVerifiedGiveaways } from "@/server/giveaway-search";

const NOW = new Date("2026-11-12T15:00:00.000Z");
const FORM = `<form action="/enter"><input type="email" name="email"><button type="submit">Enter</button></form>`;

function readFixture(name: string): string {
  return readFileSync(new URL(`./fixtures/retest/${name}.html`, import.meta.url), "utf8");
}

/** A complete rules page whose named sponsor is the brand in the title, so it can match the entry host. */
function sponsorPage(title: string, purchase = false): string {
  const sponsor = title.replace(/\b(?:sweepstakes|giveaway|giveaways|win|the|a|an|of|your|and)\b/gi, " ").replace(/\s+/g, " ").trim() || "Example Sponsor";
  return `<!doctype html><html><head><title>${title}</title></head><body>
<p><strong>${title}</strong></p>
<p><strong>Official Rules</strong></p>
<p>NO PURCHASE NECESSARY TO ENTER OR WIN. A purchase will not enhance the chance of winning.</p>
<p>Eligibility: This sweepstakes is open to legal residents of the United States who are age 18 or older.</p>
<p>The sweepstakes starts at 12:00 a.m. Eastern Time on January 1, 2026 and ends 11:59 p.m. Eastern Time on December 31, 2026.</p>
<p>${sponsor} ("Sponsor"), and any of Sponsor's agencies are not eligible.</p>
${purchase ? "<p>1 entry per $1 spent.</p>" : ""}
${FORM}
</body></html>`;
}

function quotedRules(title: string): string {
  return `<!doctype html><html><head><title>${title}</title></head><body>
<p>No purchase necessary. Sponsored by Example Co. Enter to win a Honda CRF450RX. Ends on December 31, 2026.
Must be 18 years or older. Winners will be selected in a random drawing. Odds of winning depend on entries.</p>
${FORM}
</body></html>`;
}

const REAL = {
  dream: `<!doctype html><html><head><title>Classic Truck Dream Giveaway</title></head><body>
<p>Enter now. Giveaway Dates Starts: August 26, 2026 Ends: October 22, 2026.</p>
<p>This Giveaway has ended.</p>
<p>NO PURCHASE, CONTRIBUTION, DONATION OR PAYMENT IS NECESSARY AND MAKING ONE WILL NOT INCREASE YOUR CHANCES OF WINNING. These giveaways are open to residents of the U.S. and Canada, age 18 and older. Odds of winning = One (1) divided by total number of valid tickets.</p>
</body></html>`,
  sandals: `<!doctype html><html><head><title>SANDALS Sweepstakes: Enter and Win 4 Days In Paradise</title></head><body>
<p>Enter to win 4 days in paradise.</p>
<form action="/enter"><input type="email" name="email"><button type="submit">Enter</button></form>
<script>{"rules":"\\u003cp\\u003eNO PURCHASE OR PAYMENT OF MONEY IS NECESSARY TO ENTER OR WIN THIS SWEEPSTAKES. A PURCHASE OR PAYMENT OF MONEY WILL NOT IMPROVE THE CHANCES OF WINNING.\\u003c/p\\u003e"}</script>
</body></html>`,
  wof: `<!doctype html><html><head><title>Holland America Cruise Week Giveaway</title></head><body>
<script>{"html":"NO PURCHASE NECESSARY. Void where prohibited. Ends 1/17/26 at 2:59:59 a.m. PT. Open to U.S. residents, age of majority or older."}</script>
</body></html>`,
  pots: `<!doctype html><html><head><title>Pick Your Prize Sweepstakes - PotsandPans.com</title></head><body>
<p>Our best giveaway ever! Pick your prize. Choose anything from more than 1,000 products from our trusted brands.</p>
<p><a href="/collections/all">Shop now</a></p>
</body></html>`,
  fetch: `<!doctype html><html><head><title>Roblox Gift Cards from Fetch | Roblox Rewards</title></head><body>
<p>Earn Roblox Gift Cards With Fetch. Get even more out of Roblox by redeeming points for a gift card.</p>
</body></html>`,
  sweepwidget: `<!doctype html><html><head><title>Enter Free Giveaways and Sweepstakes</title></head><body>
<p>Every giveaway below is free to enter with no purchase necessary.</p>
<iframe src="https://sweepwidget.com/w"></iframe>
</body></html>`,
  prizegrab: `<!doctype html><html><head><title>PrizeGrab</title></head><body>
<p>No purchase necessary. Sponsored by Audacy. Ends December 31, 2026. Enter the cash contest.</p>
<p>Sponsored by Waste Management. Ends April 4, 2027. Enter the gift card contest.</p>
<form><input type="email" name="email"><button type="submit">Submit Entry</button></form>
</body></html>`,
  hip: `<!doctype html><html><head><title>Our Place Giveaway</title></head><body>
<p>According to Our Place, a new giveaway was announced. No purchase necessary. Enter to win a pan.</p>
</body></html>`,
  idrop: `<!doctype html><html><head><title>$500 Amazon Gift Card Giveaway</title></head><body>
<p>By IDrop News Staff. 2 Min Read. Published: Oct 5th, 2026. No purchase necessary. Enter to win a $500 Amazon gift card. Ends December 31, 2027.</p>
<form><input type="email" name="email"><button type="submit">Enter</button></form>
</body></html>`,
  cdkeys: `<!doctype html><html><head><title>Weekly Giveaway - PremiumCDKeys.com</title></head><body>
<p>Weekly Giveaway. Add the game to your cart.</p>
<form action="/cart"><button type="submit">Add to cart</button></form>
</body></html>`,
  sxs: `<!doctype html><html><head><title>SxS Sweepstakes from BlueRibbon Coalition</title></head><body>
<p>No purchase necessary. Close Date: Oct 4, 2026. Close Time: 11:59 PM MDT.</p>
<form><input type="email" name="email"><button type="submit">Enter</button></form>
</body></html>`,
  dirt: `<!doctype html><html><head><title>Dirt Bike Sweepstakes - BlueRibbon Coalition</title></head><body>
<p>No purchase necessary. Close Date: Jan 31, 2026. Close Time: 11:59 PM MDT.</p>
<form><input type="email" name="email"><button type="submit">Enter</button></form>
</body></html>`,
  steezy: `<!doctype html><html><head><title>Honda CR125 Giveaway – STEEZY</title></head><body>
<p>To enter, simply shop www.steezy.com and every $5.00 you spend is an entry to win.</p>
<a href="/pages/official-rules">Giveaway Official Rules</a>
</body></html>`,
  freego: `<!doctype html><html><head><title>Giveaway Entry Submission | Freego Bikes</title></head><body>
<p>Free to Enter · No Purchase Needed. Giveaway ends July 1, 11:59 PM PST.</p>
<p>Follow us and like the giveaway post, then comment why you want the Nova 4 and tag 3 friends. Screenshot your Story.</p>
</body></html>`,
  wpo: `<!doctype html><html><head><title>Universal Tech Honda Dirt Bike Sweepstakes</title></head><body>
<p>No purchase necessary. The Honda Dirt Bike Sweepstakes ends on 05-21-2011.</p>
<form><input type="email" name="email"><button type="submit">Enter</button></form>
</body></html>`,
};

const ENR_RULES = `<!doctype html><html><head><title>Enrforce Official Rules</title></head><body><p>NO PURCHASE OR PAYMENT OF ANY KIND IS NECESSARY TO ENTER OR WIN. The Sponsor is ENRFORCE. Enter to win a 2026 Ford F-150. Open to legal residents of the United States who are 21 years of age or older. The sweepstakes begins on November 6, 2026 and ends at 11:59:59 p.m. MT on November 15, 2026. Winners will be selected in a random drawing. Odds of winning depend on the number of entries. 1 entry per $1 spent.</p>${FORM}</body></html>`;
const JETBLUE_RULES = `<!doctype html><html><head><title>JetBlue Vacations Cruise Sweepstakes Official Rules</title></head><body><p>No purchase necessary. NO PURCHASE OR PAYMENT NECESSARY TO ENTER OR WIN. SPONSOR: The Sponsor of the Virgin Voyages Cruise Giveaway is Paisly, LLC, d/b/a JetBlue Vacations. This Sweepstakes is open to legal U.S. residents who are 21 years of age or older. The sweepstakes starts at 12:00 AM ET on September 25, 2026 and ends 11:59 PM ET on December 31, 2026. Enter to win a cruise. Winners will be selected in a random drawing.</p>${FORM}</body></html>`;

const CASES: Array<{ url: string; title: string; html: string; query: string; expected: "verified" | "store" | "check"; endIso?: string | null; paid?: boolean; note?: string; ageTag?: string; placement?: "main" | "related"; needsChecking?: Array<"endDate" | "freeEntry" | "eligibility" | "entryMethod">; linked?: Array<{ url: string; html: string }> }> = [
  { url: "https://www.americantrucks.com/at-sweepstakes.html", title: "AmericanTrucks Sweepstakes", html: readFixture("americantrucks"), query: "truck", expected: "verified" },
  { url: "https://www.visitorlando.com/win-a-trip/", title: "Win a Trip | Visit Orlando", html: readFixture("visitorlando-win-a-trip"), query: "vacation", expected: "verified" },
  { url: "https://www.ramseysolutions.com/sweepstakes", title: "Ramsey Sweepstakes", html: sponsorPage("Ramsey Sweepstakes"), query: "cash", expected: "verified" },
  { url: "https://www.kitchenaid.com/sweepstakes", title: "KitchenAid Sweepstakes", html: sponsorPage("KitchenAid Sweepstakes"), query: "kitchen", expected: "verified" },
  { url: "https://www.realtruck.com/giveaway", title: "RealTruck Giveaway", html: sponsorPage("RealTruck Giveaway", true), query: "truck", expected: "store" },
  { url: "https://www.blueribboncoalition.org/giveaway", title: "BlueRibbon RZR Giveaway", html: sponsorPage("BlueRibbon RZR Giveaway"), query: "UTV", expected: "verified" },
  { url: "https://www.carnival.com/sweepstakes", title: "Carnival Sweepstakes", html: sponsorPage("Carnival Sweepstakes"), query: "cruise", expected: "verified" },
  { url: "https://food.example/year-supply", title: "Year Supply of Food Sweepstakes", html: sponsorPage("Year Supply of Food Sweepstakes"), query: "food", expected: "verified" },
  { url: "https://bisimoto.com/giveaway", title: "Bisimoto Giveaway", html: sponsorPage("Bisimoto Giveaway"), query: "car", expected: "verified" },
  { url: "https://www.steezy.co/giveaway", title: "Steezy Giveaway", html: sponsorPage("Steezy Giveaway"), query: "giveaway", expected: "verified" },
  { url: "https://www.dreamgiveaway.com/cadillac", title: "Dream Giveaway C30", html: sponsorPage("Dream Giveaway C30"), query: "cadillac", expected: "verified" },
  { url: "https://www.sandals.com/sweepstakes", title: "Sandals Vacation Sweepstakes", html: sponsorPage("Sandals Vacation Sweepstakes"), query: "vacation", expected: "verified" },
  { url: "https://www.margaritaville.com/cruise", title: "Margaritaville 4-Night Cruise", html: sponsorPage("Margaritaville 4-Night Cruise"), query: "cruise", expected: "verified" },
  { url: "https://www.hollandamerica.com/wof", title: "Holland America Wheel of Fortune", html: sponsorPage("Holland America Wheel of Fortune"), query: "cruise", expected: "verified" },
  { url: "https://www.potsandpans.com/pick", title: "PotsandPans Pick Your Prize", html: sponsorPage("PotsandPans Pick Your Prize"), query: "pots and pans", expected: "verified" },
  { url: "https://maxcash.example/win", title: "Max Cash Sweepstakes", html: sponsorPage("Max Cash Sweepstakes"), query: "cash", expected: "verified" },
  { url: "https://freegobikes.com/win", title: "Freego Bikes Sweepstakes", html: sponsorPage("Freego Bikes Sweepstakes"), query: "bike", expected: "verified" },
  { url: "https://expeditionranch.com/win", title: "Expedition Ranch Sweepstakes", html: sponsorPage("Expedition Ranch Sweepstakes"), query: "vacation", expected: "verified" },
  { url: "https://fetch.com/roblox", title: "Fetch Roblox Sweepstakes", html: sponsorPage("Fetch Roblox Sweepstakes"), query: "roblox", expected: "verified" },
  { url: "https://ultracontest.com/contests/win-a-vacation-sweepstakes", title: "Win a Vacation Sweepstakes and Giveaways", html: readFixture("ultracontest-vacation"), query: "vacation", expected: "check" },
  { url: "https://investor.columbia.com/news-events/press-releases", title: "Press Releases :: Columbia Sportswear Company (COLM)", html: readFixture("columbia-press"), query: "Columbia", expected: "check" },
  { url: "https://www.winprizesonline.com/", title: "Sweepstakes 2026", html: readFixture("winprizesonline-home"), query: "Honda", expected: "check" },
  { url: "https://thefreebieguy.com/current-sweepstakes-and-giveaways/", title: "Current Sweepstakes and Giveaways", html: readFixture("freebieguy-index"), query: "giveaway", expected: "check" },
  { url: "https://fox8.com/news/raffle", title: "Fox 8 Raffle News", html: `<!doctype html><html><head><title>Fox 8 Raffle News</title></head><body><p>A reporter covers a local raffle.</p>${FORM}</body></html>`, query: "truck", expected: "check" },
  { url: "https://www.moneypantry.com/giveaway/truck", title: "MoneyPantry Truck Giveaway", html: quotedRules("MoneyPantry Truck Giveaway"), query: "truck", expected: "check" },
  { url: "https://www.giveawaydrop.com/drops/truck", title: "GiveawayDrop Truck", html: quotedRules("GiveawayDrop Truck"), query: "truck", expected: "check" },
  { url: "https://instagc.com/sweepstakes/truck", title: "InstaGC Truck", html: quotedRules("InstaGC Truck"), query: "truck", expected: "check" },
  { url: "https://johnmalecki.com/truck-giveaway-free-plan", title: "Truck Giveaway Free Plan", html: quotedRules("Truck Giveaway Free Plan"), query: "truck", expected: "check" },
  { url: "https://rafflepress.com/how-to-run-a-giveaway", title: "How to Run a Giveaway", html: quotedRules("How to Run a Giveaway"), query: "gift card", expected: "check" },
  { url: "https://kickofflabs.com/giveaway-guide", title: "Giveaway Guide", html: quotedRules("Giveaway Guide"), query: "gift card", expected: "check" },
  { url: "https://slickdeals.net/winner", title: "Slickdeals Winner Announced", html: quotedRules("Slickdeals Winner Announced"), query: "gift card", expected: "check" },
  { url: "https://sweepskings.com/casinos", title: "10 Best Casino Sweepstakes", html: quotedRules("10 Best Casino Sweepstakes"), query: "casino", expected: "check" },
  { url: "https://www.nhl.com/ducks/rules", title: "Anaheim Ducks Official Rules", html: `<!doctype html><html><head><title>Anaheim Ducks Official Rules</title></head><body><p>No purchase necessary. Sponsored by the team. Enter to win a pair of hockey tickets. Ends on December 31, 2026. Must be 18 years or older. Winners will be selected in a random drawing.</p>${FORM}</body></html>`, query: "Honda", expected: "check" },
  { url: "https://investor.columbia.com/news/holiday-sweepstakes", title: "Columbia Sportswear Announces a Holiday Sweepstakes", html: quotedRules("Columbia Sportswear Announces a Holiday Sweepstakes"), query: "Columbia", expected: "check" },
  { url: "https://winprizesonline.com/honda-ride-red", title: "Ride Red and Win", html: quotedRules("Ride Red and Win"), query: "Honda", expected: "check" },
  { url: "https://blueribboncoalition.org/sxs-sweepstakes/", title: "SxS Sweepstakes", html: REAL.sxs, query: "side by side", expected: "check", endIso: "2026-10-04" },
  { url: "https://blueribboncoalition.org/dirt-bike/", title: "Dirt Bike Sweepstakes", html: REAL.dirt, query: "dirt bike", expected: "check", endIso: "2026-01-31" },
  { url: "https://steezy.com/blogs/steezy/95814918-honda-cr125-giveaway", title: "Honda CR125 Giveaway", html: REAL.steezy, query: "dirt bike", expected: "check" },
  { url: "https://freegobikes.com/pages/giveaway-submission", title: "Giveaway Entry Submission", html: REAL.freego, query: "dirt bike", expected: "check" },
  { url: "https://www.winprizesonline.com/Honda-Dirt-Bike-Sweepstakes/", title: "Universal Tech Honda Dirt Bike Sweepstakes", html: REAL.wpo, query: "Honda dirt bike", expected: "check", endIso: "2011-05-21" },
  { url: "https://www.dreamgiveaway.com/dg/draw/210", title: "Classic Truck Dream Giveaway", html: REAL.dream, query: "truck", expected: "check", endIso: "2026-10-22" },
  { url: "https://www.sandals.com/sweepstakes/", title: "SANDALS Sweepstakes", html: REAL.sandals, query: "vacation", expected: "check", needsChecking: ["endDate"], note: "End date needs checking. The page was fetched. Frequency, eligibility, end date, and automation were not all found, so rules are not verified." },
  { url: "https://www.wheeloffortune.com/win/cruise-week-giveaway", title: "Holland America Cruise Week Giveaway", html: REAL.wof, query: "cruise", expected: "check", endIso: "2026-01-17" },
  { url: "https://www.potsandpans.com/pages/pick-your-prize-sweepstakes", title: "Pick Your Prize Sweepstakes", html: REAL.pots, query: "pots and pans", expected: "check" },
  { url: "https://fetch.com/rewards/roblox", title: "Roblox Rewards", html: REAL.fetch, query: "roblox", expected: "check" },
  { url: "https://sweepwidget.com/giveaways/", title: "Enter Free Giveaways", html: REAL.sweepwidget, query: "giveaway", expected: "check" },
  { url: "https://prizegrab.com/", title: "PrizeGrab", html: REAL.prizegrab, query: "cash", expected: "check" },
  { url: "https://hip2save.com/news/our-place-giveaway/", title: "Our Place Giveaway", html: REAL.hip, query: "giveaway", expected: "check" },
  { url: "https://www.idropnews.com/giveaways/500-amazon-gift-card-giveaway-play-and-win-a-free-amazon-gift-card-in-2027/269281/", title: "$500 Amazon Gift Card Giveaway", html: REAL.idrop, query: "gift card", expected: "check" },
  { url: "https://www.premiumcdkeys.com/en-us/pages/weekly-giveaway", title: "Weekly Giveaway", html: REAL.cdkeys, query: "gift card", expected: "check" },
  { url: "https://culturezonecolorado.com/article/800241878-side-by-side-fury-launches-giveaway-for-custom-70-000-polaris-utv", title: "Side by Side Fury Launches Giveaway", html: `<!doctype html><html><head><title>Side by Side Fury Launches Giveaway</title><meta name="description" content="CASTLE ROCK, CO, April 4, 2025 / EIN Presswire /"></head><body><p>CASTLE ROCK, CO, UNITED STATES, April 4, 2025 / EIN Presswire / -- Side by Side Fury launched a giveaway.</p><p>No purchase necessary. Enter to win a custom Polaris UTV. Must be 18 years or older. The sweepstakes ends on December 31, 2026. Winners will be selected in a random drawing.</p>${FORM}</body></html>`, query: "UTV", expected: "check" },
  { url: "https://who13.com/business/press-releases/ein-presswire/800241878/side-by-side-fury-launches-giveaway-for-custom-70000-polaris-utv/", title: "Side by Side Fury Launches Giveaway", html: `<!doctype html><html><head><title>Side by Side Fury Launches Giveaway</title></head><body><p>No purchase necessary. Enter to win a custom Polaris UTV. Must be 18 years or older. The sweepstakes ends on December 31, 2026. Winners will be selected in a random drawing.</p>${FORM}</body></html>`, query: "UTV", expected: "check" },
  { url: "https://prizegrab.com/sweepstakes/cash-vault/", title: "Cash Vault Sweepstakes & Giveaways", html: `<!doctype html><html><head><title>Cash Vault Sweepstakes & Giveaways</title></head><body><p>No purchase necessary. Enter to win now. Daily winners. Ends December 31, 2026.</p>${FORM}<a href="https://prizegrab.com/sweepstakes/cash-elevator/">Cash Elevator Sweepstakes</a><a href="https://prizegrab.com/sweepstakes/cash-grab/">Cash Grab Sweepstakes</a><a href="https://prizegrab.com/sweepstakes/dream-car/">Dream Car Sweepstakes</a><a href="https://prizegrab.com/sweepstakes/dream-home/">Dream Home Sweepstakes</a></body></html>`, query: "cash", expected: "check" },
  { url: "https://prizegrab.com/sweepstakes/giftcards/", title: "Gift Card Sweepstakes & Giveaways", html: `<!doctype html><html><head><title>Gift Card Sweepstakes & Giveaways</title></head><body><p>No purchase necessary. Enter to win a gift card. Ends December 31, 2026.</p>${FORM}<a href="/sweepstakes/giftcards/750-aldi-gift-card/join/3/">Enter Now</a><a href="/sweepstakes/giftcards/1000-texas-roadhouse-gift-card/join/3/">Enter Now</a><a href="/sweepstakes/giftcards/100-dollar-tree-gift-card/join/3/">Enter Now</a></body></html>`, query: "gift card", expected: "check" },
  { url: "https://prizegrab.com/prize/3361/rules/", title: "Rules - $10,000.00 Cash Sweepstakes", html: `<!doctype html><html><head><title>Rules - $10,000.00 Cash Sweepstakes</title></head><body><p>NO PURCHASE OR PAYMENT NECESSARY. A PURCHASE OR PAYMENT OF ANY KIND WILL NOT INCREASE YOUR CHANCES OF WINNING. You are providing your information to PrizeGrab.com.</p><p>How to Enter. You will automatically be entered into the Sweepstakes once you complete the form. This sweepstakes ends on Dec 7, 2026 11:59 PM ET. Open to legal residents who are eighteen (18) years or older. Winners will be selected in a random drawing.</p>${FORM}</body></html>`, query: "cash", expected: "verified" },
  { url: "https://gleam.io/KnVog/weekly-giveaway-week163", title: "Weekly Giveaway Week 163", html: `<!doctype html><html><head><title>Weekly Giveaway Week 163</title></head><body><iframe src="https://gleam.io/KnVog/weekly-giveaway-week163"></iframe><p>No purchase necessary. Sponsored by PremiumCDKeys. Enter to win a video game. The sweepstakes ends on December 31, 2026. Must be 18 years or older. Winners will be selected in a random drawing.</p></body></html>`, query: "video game", expected: "verified" },
  { url: "https://murphysdiesel.com/blogs/news/will-it-start-reviving-ricks-15-year-dead-military-truck", title: "Will It Start? Reviving a Dead Military Truck", html: `<!doctype html><html><head><title>Will It Start? Reviving a Dead Military Truck</title></head><body><p>NO PURCHASE NECESSARY TO ENTER OR WIN. The Murphys Diesel Freedom Giveaway Sweepstakes is open only to legal residents of the United States who are at least eighteen (18) years of age. The Sweepstakes begins on November 1, 2026, at 12:00 AM PT and ends on December 31, 2026, at 11:59 PM PT. Winners will be selected in a random drawing.</p><a href="https://murphysdiesel.com/pages/official-rules">Official Rules</a>${FORM}<p>Add to cart</p></body></html>`, query: "truck", expected: "check", note: "Sponsor not confirmed" },
  { url: "https://thegameday.com/sweepstakes-casinos/gift-card-prizes/", title: "Play Slots for Gift Cards: Best Casinos With Gift Cards", html: `<!doctype html><html><head><title>Play Slots for Gift Cards: Best Casinos With Gift Cards</title></head><body><p>No purchase necessary. Enter to win a gift card. Ends December 31, 2026.</p><p>McLuck Promo Code. Stake.US Promo Code. Chumba Casino Promo Code. WOW Vegas Promo Code.</p></body></html>`, query: "gift card", expected: "check" },
  { url: "https://www.contestscoop.com/royal-caribbean-cruise-sweepstakes/", title: "Royal Caribbean Cruise Contest", html: `<!doctype html><html><head><title>Royal Caribbean Cruise Contest</title></head><body><p>Enter to win a 7-night cruise. Prize: $500 USD gift card. Ends: Nov 15, 2026. Who: Canada, 21 or older. How: Follow, comment game score, tag a friend. Odds of winning depend on entries.</p>${FORM}</body></html>`, query: "cruise", expected: "check" },
  { url: "https://www.jetbluevacations.com/sale/sweepstakes", title: "Vacation Packages & Deals | JetBlue Vacations", html: `<!doctype html><html><head><title>Vacation Packages & Deals | JetBlue Vacations</title></head><body><p>Please enable javascript for the best experience. Manage your booking. Flights + Hotel.</p><form action="/book"><input type="email" name="email"><button type="submit">Search</button></form></body></html>`, query: "vacation", expected: "check", endIso: null },
  { url: "https://enrforce.com/pages/current-giveaway", title: "CURRENT GIVEAWAY", html: `<!doctype html><html><head><title>CURRENT GIVEAWAY</title></head><body><script src="https://js.hs-scripts.com/hubspot.js"></script><p>CURRENT GIVEAWAY. 1 entry per $1 spent. Enter to win the truck giveaway.</p><button>Add to cart</button>${FORM}<a href="https://enrforce.com/pages/enrforce-official-rules">Official Rules</a><footer><p>NO PURCHASE NECESSARY TO ENTER OR WIN. The sweepstakes ends at 11:59:59 p.m. MT on November 15, 2026.</p></footer></body></html>`, query: "truck", expected: "store", endIso: "2026-11-15", paid: true, linked: [{ url: "https://enrforce.com/pages/enrforce-official-rules", html: ENR_RULES }] },
  { url: "https://enrforce.com/blogs/past-winners/enr-74", title: "ENR#74 - ENRFORCE", html: readFixture("enr-74"), query: "truck", expected: "check", linked: [{ url: "https://enrforce.com/pages/enrforce-official-rules", html: ENR_RULES }] },
  { url: "https://www.jetbluevacations.com/sale/sweepstakes-cruise", title: "Sweepstakes | JetBlue Vacations", html: `<!doctype html><html><head><title>Sweepstakes | JetBlue Vacations</title></head><body><p>Enter the JetBlue Vacations cruise sweepstakes.</p><a href="https://www.jetbluevacations.com/sale/sweepstakes-official-rules-cruise/">Official Rules</a>${FORM}</body></html>`, query: "cruise", expected: "verified", endIso: "2026-12-31", linked: [{ url: "https://www.jetbluevacations.com/sale/sweepstakes-official-rules-cruise/", html: JETBLUE_RULES }] },
  { url: "https://coingate.com/gift-cards/giveaways", title: "Giveaways | CoinGate Gift Cards", html: `<!doctype html><html><head><title>Giveaways | CoinGate Gift Cards</title></head><body><p>No purchase necessary. Enter to win a gift card. Ends December 31, 2026. Must be 18 years or older. Winners will be selected in a random drawing.</p>${FORM}<a href="/gift-cards/amazon">Amazon Gift Card Giveaway</a><a href="/gift-cards/visa">Visa Gift Card Giveaway</a><a href="/gift-cards/steam">Steam Gift Card Giveaway</a><a href="/gift-cards/apple">Apple Gift Card Giveaway</a></body></html>`, query: "gift card", expected: "check" },
  { url: "https://shop.example/weekly-gleam", title: "Weekly Gleam Giveaway", html: `<!doctype html><html><head><title>Weekly Gleam Giveaway</title></head><body><iframe src="https://gleam.io/KnVog/weekly-giveaway-week163"></iframe><button>Add to cart</button><a href="https://shop.example/official-rules">Official Rules</a></body></html>`, query: "video game", expected: "verified", endIso: "2026-12-31", linked: [{ url: "https://shop.example/official-rules", html: `<!doctype html><html><head><title>Weekly Gleam Official Rules</title></head><body><p>No purchase necessary. Sponsored by Example Shop. Enter to win a video game. The sweepstakes ends on December 31, 2026. Must be 18 years or older. Winners will be selected in a random drawing.</p>${FORM}</body></html>` }] },
  { url: "https://www.abcwarehouse.com/survey/ge-dream-kitchen-giveaway", title: "Event Survey", html: `<!doctype html><html><head><title>Event Survey</title></head><body><p>No purchase necessary. Enter to win.</p>${FORM}</body></html>`, query: "kitchen", expected: "check", needsChecking: ["endDate"], note: "End date needs checking. The page was fetched. Frequency, eligibility, end date, and automation were not all found, so rules are not verified." },
  { url: "https://www.cbdmall.com/lp/free-gift-card", title: "Free $25 Gift Card Giveaway", html: `<!doctype html><html><head><title>Free $25 Gift Card Giveaway</title></head><body><p>No purchase necessary. Enter to win a $25 gift card. Open to legal residents of the United States who are 18 years or older. One entry per person.</p>${FORM}</body></html>`, query: "gift card", expected: "check", needsChecking: ["endDate"], note: "End date needs checking." },
  { url: "https://www.subzero-wolf.com/trade/kitchen-design-contest", title: "Kitchen Design Contest", html: `<!doctype html><html><head><title>Kitchen Design Contest</title></head><body><p>Open to design professionals and trade members. Submit your design. This design contest is judged by a jury. No purchase necessary. Must be 18 years or older. The contest ends on December 31, 2027.</p>${FORM}</body></html>`, query: "kitchen", expected: "check", needsChecking: ["eligibility"], note: "Open to trade professionals only — check eligibility." },
  { url: "https://www.kwch.com/news/local-raffle-recap", title: "Station recap", html: `<!doctype html><html><head><title>Station recap</title><meta property="og:type" content="article"></head><body><p>Written by Pat Lee. Published January 2, 2026. The sponsor said enter to win a truck.</p><form><input type="email" name="email"><button type="submit">Subscribe</button></form></body></html>`, query: "truck", expected: "check" },
  { url: "https://www.kwch.com/contests/truck", title: "KWCH Truck Sweepstakes", html: `<!doctype html><html><head><title>KWCH Truck Sweepstakes</title><meta property="og:type" content="article"></head><body><p>No purchase necessary. Enter to win a truck. Open to legal residents of the United States who are 18 years or older. The sweepstakes ends on December 31, 2026. Winners will be selected in a random drawing.</p><a href="https://www.kwch.com/contests/truck/rules">Official Rules</a>${FORM}</body></html>`, query: "truck", expected: "check", note: "Sponsor not confirmed" },
  { url: "https://www.example.com/12-truck-giveaways", title: "12 Truck Giveaways", html: sponsorPage("12 Truck Giveaways"), query: "truck", expected: "check" },
  { url: "https://sponsor.example/one-contest", title: "One Truck Sweepstakes", html: `<!doctype html><html><head><title>One Truck Sweepstakes</title></head><body><h1>One Truck Sweepstakes</h1><p>No purchase necessary. Enter to win a truck. The runner-up receives a gift card. The sweepstakes ends on December 31, 2026. Open to legal residents of the United States who are 18 years or older. Winners will be selected in a random drawing.</p>${FORM}</body></html>`, query: "truck", expected: "check", note: "Sponsor not confirmed" },
  { url: "https://sponsor.example/two-contests", title: "Two Truck Sweepstakes", html: `<!doctype html><html><head><title>Two Truck Sweepstakes</title></head><body><p>No purchase necessary. Enter to win a truck. The first sweepstakes ends on January 10, 2027. The second sweepstakes ends on January 29, 2027. Open to legal residents of the United States who are 18 years or older.</p>${FORM}</body></html>`, query: "truck", expected: "check" },
  { url: "https://prizegrab.com/sweepstakes/giftcards/750-aldi/join/3/", title: "$750 Aldi Gift Card", html: `<!doctype html><html><head><title>$750 Aldi Gift Card</title></head><body><p>Sponsored by PrizeGrab. No purchase necessary. Enter to win a gift card. Ends December 31, 2026. Open to legal residents who are 18 years or older. Winners will be selected in a random drawing.</p><a href="https://prizegrab.com/sweepstakes/giftcards/750-aldi/rules">Official Rules</a>${FORM}<aside class="related"><a href="https://prizegrab.com/sweepstakes/cash-elevator/">Cash Elevator Sweepstakes</a><a href="https://prizegrab.com/sweepstakes/cash-grab/">Cash Grab Sweepstakes</a><a href="https://prizegrab.com/sweepstakes/dream-car/">Dream Car Sweepstakes</a><a href="https://prizegrab.com/sweepstakes/dream-home/">Dream Home Sweepstakes</a></aside></body></html>`, query: "gift card", expected: "verified" },
  { url: "https://www.thetravelmom.com/vacation-giveaways", title: "Vacation Giveaways | The Travel Mom", html: `<!doctype html><html><head><title>Vacation Giveaways | The Travel Mom</title></head><body><p>A roundup of vacation giveaways. Enter to win a cruise on another site.</p></body></html>`, query: "vacation", expected: "check" },
  { url: "https://news.example/today-announced", title: "Sponsor today announced a truck giveaway", html: `<!doctype html><html><head><title>Sponsor today announced a truck giveaway</title></head><body><p>DALLAS, TX. The company today announced a truck giveaway. Enter at https://sponsor.example/truck-giveaway.</p></body></html>`, query: "truck", expected: "check" },
  { url: "https://www.thetravelmom.com/vacation-giveaways-form", title: "Vacation Giveaways | The Travel Mom", html: `<!doctype html><html><head><title>Vacation Giveaways | The Travel Mom</title></head><body><p>No purchase necessary. Enter to win a vacation. Ends December 31, 2026. Must be 18 years or older.</p>${FORM}</body></html>`, query: "vacation", expected: "check" },
  { url: "https://www.ramseysolutions.com/cash-giveaway", title: "Ramsey Cash Giveaway", html: sponsorPage("Ramsey Cash Giveaway"), query: "cash", expected: "verified" },
  { url: "https://www.jetbluevacations.com/cruise-sweepstakes", title: "JetBlue Vacations Cruise Sweepstakes", html: sponsorPage("JetBlue Vacations Cruise Sweepstakes"), query: "cruise", expected: "verified" },
  { url: "https://www.sweepstake.com/some-contest", title: "Sweepstake.com Contest", html: sponsorPage("Sweepstake.com Contest"), query: "vacation", expected: "check" },
  { url: "https://kitchen.example/mixer", title: "Mixer Sweepstakes", html: `<!doctype html><html><head><title>Mixer Sweepstakes</title></head><body><p>No purchase necessary. Sponsored by Mixer Co. Enter to win a stand mixer. Ends December 31, 2026. Open to legal residents of the United States who are 18 years or older. Winners will be selected in a random drawing.</p>${FORM}</body></html>`, query: "Glock G43X MOS", expected: "check", note: "Prize may not match your search — check the prize." },
  { url: "https://glock.example/g43x", title: "Glock G43X MOS Giveaway", html: `<!doctype html><html><head><title>Glock G43X MOS Giveaway</title></head><body><p>No purchase necessary. Sponsored by Glock. Enter to win a Glock G43X MOS. Ends December 31, 2026. Open to legal residents of the United States who are 18 years or older. Winners will be selected in a random drawing.</p>${FORM}</body></html>`, query: "Glock G43X MOS", expected: "verified" },
  { url: "https://www.jetbluevacations.com/sale/sweepstakes-cruise", title: "Sweepstakes | JetBlue Vacations", html: readFixture("jetblue-cruise"), query: "cruise", expected: "check", endIso: "2026-12-31", note: "Entry form is not in the page HTML.", ageTag: "21+" },
  { url: "https://www.carnival.com/Registration/Promotions/bcsweeps-2026", title: "Carnival Cruise Lines Carnival Players Club Brian Christopher Sweeps", html: readFixture("carnival-bcsweeps"), query: "cruise", expected: "check", endIso: "2026-12-31", note: "Entry form is not in the page HTML.", ageTag: "21+" },
  { url: "https://hondawin2026.com/", title: "Honda Win 2026", html: readFixture("honda-win-2026"), query: "Honda", expected: "verified", endIso: "2027-01-10", ageTag: "18+" },
  { url: "https://www.ramseysolutions.com/giveaway/ramsey-cash-giveaway", title: "Ramsey Cash Giveaway", html: readFixture("ramsey-cash"), query: "cash", expected: "check", endIso: "2026-12-20" },
  { url: "https://contest.gunnisoncopper.com/", title: "$25,000 Cash Sweepstakes", html: readFixture("gunnison-copper"), query: "cash", expected: "verified", endIso: "2026-12-13" },
  { url: "https://www.dreamvacations.com/vacation/deals/promos/contest-enter-to-win", title: "Enter to Win | Dream Vacations", html: readFixture("dreamvacations-enter"), query: "vacation", expected: "check", note: "Sponsor not confirmed", endIso: "2027-01-12" },
  { url: "https://gunbros.com/shop/guntalks/glock-43x-mos-9mm-15rd-guntickets-10-spot-4/", title: "Glock 43X MOS 9mm 15rd - GUNTICKETS [10 SPOT]", html: readFixture("gunbros-glock"), query: "Glock G43X MOS", expected: "store" },
  { url: "https://www.academy.com/giveaway/boat", title: "Academy Sports Boat Giveaway", html: `<!doctype html><html><head><title>Academy Sports Boat Giveaway</title></head><body><p>No purchase necessary. Enter to win a boat. Open to legal residents of the United States who are 18 years or older. Winners will be selected in a random drawing.</p>${FORM}</body></html>`, query: "boat", expected: "check", note: "End date needs checking.", placement: "main" },
  { url: "https://www.basspro.com/shop/cooler", title: "Bass Pro Shops Cooler", html: `<!doctype html><html><head><title>Bass Pro Shops Cooler</title></head><body><p>Add to cart. $49.99. A fishing cooler for the boat.</p></body></html>`, query: "boat", expected: "check", placement: "related" },
  { url: "https://www.topgolf.com/us/promotions/honda-classic-challenge/", title: "Honda Classic Challenge", html: `<!doctype html><html><head><title>Honda Classic Challenge</title></head><body><p>Topgolf Honda Classic Challenge. Event fee $150 to play. $40 per ticket for the outing. This challenge ended September 30, 2026.</p></body></html>`, query: "Honda", expected: "check", endIso: "2026-09-30" },
  { url: "https://getfreewrite.com/writing-contests-for-money", title: "Writing Contests for Money", html: `<!doctype html><html><head><title>Writing Contests for Money</title></head><body><p>Written by Ada Lee. 6 min read. These writing contests charge a $25 entry fee. Some stores offer 1 entry per $1 spent.</p></body></html>`, query: "cash", expected: "check", placement: "related" },
  { url: "https://rifleconfigurator.com/best-glock-43x-upgrades-2026", title: "Best Glock 43X Upgrades 2026", html: `<!doctype html><html><head><title>Best Glock 43X Upgrades 2026</title></head><body><p>A product guide. The optic is $499. Some raffles cost $55 per ticket. Add to cart.</p></body></html>`, query: "Glock", expected: "check", placement: "related" },
  { url: "https://ultracontest.com/contests/win-cash-sweepstakes", title: "Cash Sweepstakes and Giveaways | ultracontest", html: `<!doctype html><html><head><title>Cash Sweepstakes and Giveaways | ultracontest</title></head><body><p>No purchase necessary. Enter to win cash. Ends December 31, 2026. Must be 18 years or older.</p>${FORM}</body></html>`, query: "cash", expected: "check", placement: "related" },
  { url: "https://www.sweepfeed.com/sweepstakes/category/cash", title: "Cash Sweepstakes & Money Giveaways — Prizes and Rules | SweepFeed", html: `<!doctype html><html><head><title>Cash Sweepstakes &amp; Money Giveaways — Prizes and Rules | SweepFeed</title></head><body><p>No purchase necessary. Enter to win cash. Ends December 31, 2026. Must be 18 years or older.</p>${FORM}</body></html>`, query: "cash", expected: "check", placement: "related" },
  { url: "https://cdn.powerequipment.honda.com/pe/pdf/twelve-days-of-giveaways-official-rules.pdf", title: "12 Days of Giveaways Official Rules", html: `<!doctype html><html><head><title>12 Days of Giveaways Official Rules</title></head><body><p>Official Rules. NO PURCHASE NECESSARY. Sponsored by American Honda Motor Co., Inc. Enter to win a Honda generator. Open to legal residents of the United States who are 18 years or older. The sweepstakes ends on December 24, 2026. Enter at https://powerequipment.honda.com/promotions/twelve-days-of-giveaways.</p></body></html>`, query: "Honda", expected: "check", endIso: "2026-12-24", note: "Rules found; enter at https://powerequipment.honda.com/promotions/twelve-days-of-giveaways." },
  { url: "https://www.guntalk.com/win", title: "Gun Talk November 2026 Giveaway | Gun Talk", html: readFixture("guntalk-november"), query: "gun", expected: "check", endIso: "2026-11-30", note: "Rules are inside the entry widget — check before entering." },
];

function visible(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

function oldEnd(text: string): string | null {
  const cue = String.raw`(?:ends|ended|ending|end date|deadline|closes|closing date|through|until)`;
  const month = new RegExp(String.raw`${cue}\s+(?:on\s+)?([A-Za-z]+\s+\d{1,2},\s+\d{4})`, "i").exec(text);
  if (month) return month[1];
  const numeric = new RegExp(String.raw`${cue}\s+(?:on\s+)?(\d{1,2})[/-](\d{1,2})[/-](\d{4})`, "i").exec(text);
  return numeric ? `${numeric[3]}-${numeric[1]}-${numeric[2]}` : null;
}

function oldNever(url: string, title: string): boolean {
  const path = new URL(url).pathname.replace(/\/+$/, "").toLowerCase() || "/";
  const where = `${path} ${title}`;
  if (/\bhow-?\s*to\b|\bguides?\b|\bways\b|\btips\b|\bplans?\b/i.test(where)) return true;
  if (/\b(?:press release|investor|earnings)\b/i.test(where)) return true;
  if (/\b(?:\d+\s+best|listicle|roundup)\b/i.test(title)) return true;
  if (/\bwinners?\b/i.test(title) && /\b(?:announced|won|wins|selected|crowned|page)\b/i.test(title)) return true;
  if (path === "/" || path === "/index" || path === "/index.html") return true;
  return false;
}

/** 5208636: no-purchase or three details, plus the page's own entry. No page-type ban. */
function label5208636(html: string, url: string, title: string): "verified" | "store" | "check" {
  const text = `${title} ${visible(html)}`;
  const promo = /\b(?:sweepstakes|giveaway|no purchase necessary|enter to win)\b/i.test(text);
  const emailForm = /type=["']email["']|name=["'][^"']*email[^"']*["']/i.test(html);
  const form = /<form\b/i.test(html) && emailForm;
  const steps = /\benter (?:the |this )?(?:sweepstakes|giveaway|contest)\b/i.test(text);
  const own = (form && promo) || steps;
  const npn = /no purchase necessary/i.test(text);
  const details = [
    /\b(?:must be \d|years or older|legal residents|eligib)\b/i.test(text),
    /\b(?:ends|ended|deadline|closes)\b/i.test(text),
    /\brandom drawing\b/i.test(text),
    /\bodds of winning\b/i.test(text),
    /\bretail value\b/i.test(text),
    /\bsponsor\b/i.test(text),
  ].filter(Boolean).length;
  if (!(own && (npn || details >= 3))) return "check";
  if (oldEnd(text) && oldEnd(text)!.startsWith("2011")) return "check";
  if (/1 entry per \$\d/.test(text)) return "store";
  return "verified";
}

/** 7a09dd3: also requires a sponsor line, "win a …", and a date the old parser accepts. */
function label7a09dd3(html: string, url: string, title: string, query: string): "verified" | "store" | "check" {
  if (oldNever(url, title)) return "check";
  if (/\bducks\b/i.test(title) && /\bhonda\b/i.test(query) && !/win an? [^.]{0,40}honda/i.test(visible(html))) return "check";
  const text = visible(html);
  const sponsor = /\b(?:sponsored by|the sponsor is|sponsor:)\s+(?!the\b)[A-Za-z0-9]/i.test(text);
  const prize = /\b(?:enter to win|win|won)\s+(?:a|an|the|your)\s+(?!prize\b)[A-Za-z0-9]/i.test(text);
  const dates = oldEnd(text) !== null;
  const base = label5208636(html, url, title);
  if (!(sponsor && prize && dates) || base === "check") return "check";
  return base;
}

async function search(query: string, pages: Array<{ url: string; title: string; html: string }>, alsoServe: Array<{ url: string; html: string }> = []) {
  const byUrl = new Map<string, string>();
  for (const item of alsoServe) byUrl.set(item.url, item.html);
  for (const item of pages) byUrl.set(item.url, item.html);
  return searchVerifiedGiveaways(query, {
    apiKey: "test-key",
    searchUrl: "https://api.search.brave.com/res/v1/web/search",
    maxBraveCalls: 1,
    now: () => NOW,
    lookupImpl: async () => ["93.184.216.34"],
    fetchImpl: async (input, init) => {
      const url = String(input);
      if (url.includes("api.search.brave.com")) {
        return Response.json({ web: { results: pages.map((item) => ({ url: item.url, title: item.title, description: "" })) } });
      }
      if (url.endsWith("/robots.txt")) return new Response("missing", { status: 404 });
      const html = byUrl.get(url);
      if (!html) return new Response("missing", { status: 404 });
      const signal = init && typeof init === "object" && "signal" in init ? init.signal : undefined;
      if (signal?.aborted) return new Response("aborted", { status: 499 });
      return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
    },
  });
}

describe.skipIf(!PRIVATE_FIXTURES)("live retest fixtures", () => {
  it("labels the 15-search pages from main-page evidence", async () => {
    const scores = { fresh: 0, at5208636: 0, at7a09dd3: 0 };
    for (const item of CASES) {
      const found = await search(item.query, [item], item.linked ?? []);
      const row = found.listings.find((listing) => listing.url === item.url);
      const actual = row?.listingGroup === "store" ? "store" : row?.listingGroup === "verified" ? "verified" : "check";
      if (actual === item.expected) scores.fresh += 1;
      if (label5208636(item.html, item.url, item.title) === item.expected) scores.at5208636 += 1;
      if (label7a09dd3(item.html, item.url, item.title, item.query) === item.expected) scores.at7a09dd3 += 1;
      expect(actual, item.url).toBe(item.expected);
      if (!row && isExcludedDirectorySource(item.url)) continue;
      if ("endIso" in item && item.endIso) {
        expect(row?.endIso, item.url).toBe(item.endIso);
        if (Date.parse(item.endIso) < NOW.getTime()) expect(confidenceTier(row!, NOW), item.url).toBe(4);
      }
      if (item.paid) expect(row?.methods ?? [], item.url).toContain("paid");
      if (item.note) expect(row?.rulesNote, item.url).toBe(item.note);
      if ("ageTag" in item && item.ageTag) expect(row?.ageTag, item.url).toBe(item.ageTag);
      if ("placement" in item && item.placement) expect(row?.placement, item.url).toBe(item.placement);
      if (item.url.includes("gunnisoncopper.com")) {
        expect(row?.excludedStates ?? [], item.url).toEqual(expect.arrayContaining(["NY", "FL", "RI"]));
      }
      if (item.needsChecking) expect(row?.needsChecking, item.url).toEqual(item.needsChecking);
      if ("endIso" in item && item.endIso === null) expect(row?.endIso ?? null, item.url).toBeNull();
    }
    expect(scores).toEqual({ fresh: 98, at5208636: 57, at7a09dd3: 63 });
    const cruise = (await search("cruise", [CASES.find((item) => item.url.includes("sweepstakes-cruise"))!], CASES.find((item) => item.url.includes("sweepstakes-cruise"))!.linked ?? [])).listings[0];
    expect(cruise?.ageTag).toBe("21+");
    expect(cruise?.methods ?? []).toContain("free");
    expect(bucketRows([cruise!]).main.map((row) => row.url)).toEqual([cruise!.url]);
    const sandals = CASES.find((item) => item.url === "https://www.sandals.com/sweepstakes")!;
    const sandalsRow = (await search(sandals.query, [sandals])).listings[0];
    expect(bucketRows([sandalsRow!]).main.map((row) => row.listingGroup)).toEqual(["verified"]);
    const trucks = await search("truck", [CASES[0]]);
    expect(trucks.listings[0]?.endIso).toBe("2026-11-18");
    expect(statedEndIso("ends 11:59 p.m. Eastern Time on November 18, 2026")).toBe("2026-11-18");
  });

  it("does not verify a weekly-ad date or a Honda page that misses generator", async () => {
    const food = readFileSync(new URL("./fixtures/stress/foodtown.html", import.meta.url), "utf8");
    const honda = readFixture("honda-win-2026");
    const foodResult = await search("PS5", [{ url: "https://www.yourfoodtown.com/crushing-it/", title: "Food Town Crushing PS5 Giveaway", html: food }]);
    const foodRow = foodResult.listings.find((row) => row.url.includes("yourfoodtown.com"));
    expect(foodRow?.listingGroup).toBe("check");
    expect(foodRow?.endIso).not.toBe("2027-10-01");
    expect(foodRow?.rulesVerified).not.toBe(true);
    const plain = await search("Honda", [{ url: "https://hondawin2026.com/", title: "Honda Win 2026", html: honda }]);
    const plainRow = plain.listings.find((row) => row.url.includes("hondawin2026.com"));
    expect(plainRow?.listingGroup).toBe("verified");
    expect(plainRow?.endIso).toBe("2027-01-10");
    const generator = await search("Honda generator", [{ url: "https://hondawin2026.com/", title: "Honda Win 2026", html: honda }]);
    const generatorRow = generator.listings.find((row) => row.url.includes("hondawin2026.com"));
    expect(generatorRow?.listingGroup).toBe("check");
    expect(generatorRow?.rulesNote).toMatch(/Prize does not mention generator/);
    const listing = readFileSync(new URL("./fixtures/stress/giveawaylisting.html", import.meta.url), "utf8");
    const crypto = readFileSync(new URL("./fixtures/stress/cryptoslate.html", import.meta.url), "utf8");
    const dead = readFileSync(new URL("./fixtures/stress/deadspin.html", import.meta.url), "utf8");
    const bronco = readFileSync(new URL("./fixtures/stress/allcar.html", import.meta.url), "utf8");
    const buckets = await search("car", [
      { url: "https://giveawaylisting.com/car-sweepstakes/", title: "Top 9 Car Sweepstakes to Win Online", html: listing },
      { url: "https://cryptoslate.com/sweepstakes-casinos/", title: "Best Sweepstakes Casinos in the US", html: crypto },
      { url: "https://deadspin.com/sweepstakes-casinos/", title: "Best Sweepstakes Casinos", html: dead },
      { url: "https://allcargiveaways.com/giveaways/bronco/", title: "Bronco Giveaways 2026: 7 Live Now", html: bronco },
    ]);
    for (const host of ["giveawaylisting.com", "cryptoslate.com", "deadspin.com", "allcargiveaways.com"]) {
      const row = buckets.listings.find((item) => item.url.includes(host));
      expect(row?.listingGroup, host).not.toBe("store");
      expect(row?.placement, host).toBe("related");
    }
    const vague = "The official rules were not read, so this page needs checking.";
    const pages = [
      ["https://americantrucks.com/at-sweepstakes.html", "AmericanTrucks Sweepstakes", "americantrucks.html"],
      ["https://goshootindoors.com/photo_contest.html", "Shoot Indoors Photo Contest", "goshoot.html"],
      ["https://sweeps4all.com/sweeps/100_amazongiftcard__10_14_19", "Win the $100 Amazon Gift Card Sweepstakes", "sweeps4all.html"],
      ["https://play.sweeps.pet/sweeps/one-year-pet-food", "Sweeps.Pet - Win One Year of Pet Food", "sweepspet.html"],
    ] as const;
    for (const [url, title, file] of pages) {
      const html = readFileSync(new URL(`./fixtures/stress/${file}`, import.meta.url), "utf8");
      const found = await search("gift card", [{ url, title, html }]);
      const row = found.listings.find((item) => item.url === url);
      expect(row?.rulesNote ?? "", url).not.toBe(vague);
    }
  });

  it("puts a widget page with hidden rules first in Needs checking", async () => {
    const guntalk = CASES.find((item) => item.url === "https://www.guntalk.com/win")!;
    const other = `<!doctype html><html><head><title>Academy Sports Boat Giveaway</title></head><body><p>No purchase necessary. Enter to win a boat. Open to legal residents of the United States who are 18 years or older. Winners will be selected in a random drawing.</p>${FORM}</body></html>`;
    const found = await search("gun", [
      { url: "https://www.academy.com/giveaway/boat", title: "Academy Sports Boat Giveaway", html: other },
      guntalk,
    ]);
    const buckets = bucketRows(found.listings);
    expect(buckets.main).toEqual([]);
    expect(buckets.needsChecking[0]?.url).toBe("https://www.guntalk.com/win");
    expect(buckets.needsChecking[0]?.rulesNote).toBe(WIDGET_RULES_NOTE);
    expect(buckets.needsChecking[0]?.endIso).toBe("2026-11-30");
    expect(buckets.needsChecking[0]?.listingGroup).toBe("check");
    expect(buckets.needsChecking.findIndex((row) => row.url.includes("academy.com"))).toBeGreaterThan(0);
  });

  it("keeps a read page when its rules link hangs, including a later ended date", async () => {
    const official = sponsorPage("KitchenAid Sweepstakes").replace(
      "</body>",
      `<a href="https://www.kitchenaid.com/official-rules">Official Rules</a></body>`,
    );
    const ended = `<!doctype html><html><head><title>2011 Honda CRF Giveaway</title></head><body>
<p>No purchase necessary. Enter to win a 2011 Honda CRF. This sweepstakes ended in 2011. Must be 18 years or older.</p>${FORM}</body></html>`;
    let rulesStarted = 0;
    const pages = new Map<string, string>([
      ["https://www.kitchenaid.com/sweepstakes", official],
      ["https://powersports.honda.com/2011-crf", ended],
    ]);
    const found = await searchVerifiedGiveaways("kitchen", {
      apiKey: "test-key",
      searchUrl: "https://api.search.brave.com/res/v1/web/search",
      maxBraveCalls: 1,
      now: () => NOW,
      lookupImpl: async () => ["93.184.216.34"],
      fetchImpl: async (input, init) => {
        const url = String(input);
        if (url.includes("api.search.brave.com")) {
          return Response.json({
            web: {
              results: [
                { url: "https://www.kitchenaid.com/sweepstakes", title: "KitchenAid Sweepstakes", description: "" },
                { url: "https://powersports.honda.com/2011-crf", title: "2011 Honda CRF Giveaway", description: "ended in 2011" },
              ],
            },
          });
        }
        if (url.endsWith("/robots.txt")) return new Response("missing", { status: 404 });
        if (url.startsWith("https://www.kitchenaid.com/official-rules")) {
          rulesStarted += 1;
          await new Promise((_resolve, reject) => {
            const signal = init && typeof init === "object" && "signal" in init ? init.signal : undefined;
            const timer = setTimeout(() => reject(new Error("hung")), 30_000);
            signal?.addEventListener("abort", () => {
              clearTimeout(timer);
              reject(new DOMException("aborted", "AbortError"));
            });
          });
        }
        const html = pages.get(url);
        if (!html) return new Response("missing", { status: 404 });
        return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
      },
    });
    const kitchen = found.listings.find((row) => row.url.includes("kitchenaid.com"));
    const honda = found.listings.find((row) => row.url.includes("powersports.honda.com"));
    expect(rulesStarted).toBe(1);
    expect(kitchen?.listingGroup).toBe("verified");
    expect(kitchen?.rulesNote ?? "").not.toMatch(/This page was not read|Not checked yet/);
    expect(honda?.endIso).toBe("2011-12-31");
    expect(honda?.rulesNote ?? "").not.toMatch(/This page was not read|Not checked yet/);
  });

  it("reads sponsor contest paths before aggregators, up to the cap, and labels the rest as not attempted", async () => {
    const aggregators = Array.from({ length: 50 }, (_, index) => ({
      url: `https://www.moneypantry.com/giveaway/${index}`,
      title: `Archive ${index}`,
      html: `<!doctype html><html><head><title>Archive ${index}</title></head><body><p>Other giveaways.</p></body></html>`,
    }));
    const sponsors = ["blueribboncoalition.org/sxs-sweepstakes", "blueribboncoalition.org/dirt-bike", "steezy.com/blogs/steezy/95814918-honda-cr125-giveaway", "freegobikes.com/pages/giveaway-submission"].map((path) => ({
      url: `https://${path}`,
      title: path,
      html: sponsorPage(path),
    }));
    const found = await search("dirt bike", [...aggregators, ...sponsors]);
    for (const sponsor of sponsors) {
      const row = found.listings.find((item) => item.url === sponsor.url);
      expect(row?.rulesNote ?? "", sponsor.url).not.toMatch(/search stopped before this page/);
    }
    const unread = found.listings.filter((row) => /search stopped before this page/.test(row.rulesNote));
    const failed = found.listings.filter((row) => /did not load/.test(row.rulesNote));
    expect(unread.length).toBeGreaterThan(0);
    expect(failed.length).toBe(0);
    expect(unread.length + sponsors.length + (found.listings.length - unread.length - sponsors.length)).toBe(found.listings.length);
    expect(found.listings.length - unread.length).toBe(48);
  });

  it("ranks a blocked official page above press copies and does not copy the wire date", async () => {
    const release = `<p>No purchase necessary. Enter to win a custom Polaris UTV. Must be 18 years or older. The sweepstakes ends on December 31, 2027. Winners will be selected in a random drawing.</p>${FORM}`;
    const found = await searchVerifiedGiveaways("UTV", {
      apiKey: "test-key",
      searchUrl: "https://api.search.brave.com/res/v1/web/search",
      maxBraveCalls: 1,
      now: () => NOW,
      lookupImpl: async () => ["93.184.216.34"],
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("api.search.brave.com")) {
          return Response.json({
            web: {
              results: [
                { url: "https://culturezonecolorado.com/article/800241878-side-by-side-fury", title: "Side by Side Fury Launches Giveaway", description: "EIN Presswire" },
                { url: "https://who13.com/business/press-releases/ein-presswire/800241878/side-by-side-fury/", title: "Side by Side Fury Launches Giveaway", description: "" },
                { url: "https://sidebysidefury.com/giveaway70k_01/", title: "Side by Side Fury Giveaway", description: "" },
              ],
            },
          });
        }
        if (url.endsWith("/robots.txt")) return new Response("missing", { status: 404 });
        if (url.includes("sidebysidefury.com")) return new Response("no", { status: 403, headers: { "content-type": "text/html" } });
        return new Response(`<!doctype html><html><head><title>Side by Side Fury Launches Giveaway</title><meta name="description" content="EIN Presswire"></head><body><p>CASTLE ROCK, CO / EIN Presswire /</p>${release}</body></html>`, { status: 200, headers: { "content-type": "text/html" } });
      },
    });
    const urls = found.listings.map((row) => row.url);
    const official = found.listings.find((row) => row.url.includes("sidebysidefury.com"));
    expect(official?.listingGroup).toBe("check");
    expect(official?.sponsorPageBlocked).toBe(true);
    expect(official?.endIso ?? null).toBeNull();
    expect(official?.prize ?? "").not.toMatch(/Polaris|70,000|\$70/);
    for (const copy of found.listings.filter((row) => !row.url.includes("sidebysidefury.com"))) {
      expect(copy.listingGroup).toBe("check");
    }
    expect(urls.indexOf(official!.url)).toBeLessThan(urls.indexOf(urls.find((url) => url.includes("culturezone"))!));
    expect(urls.indexOf(official!.url)).toBeLessThan(urls.indexOf(urls.find((url) => url.includes("who13"))!));
  });

  it("keeps the main page when only the rules link fails", async () => {
    const main = sponsorPage("KitchenAid Mixer Sweepstakes").replace("</body>", `<a href="https://www.kitchenaid.com/official-rules">Official Rules</a></body>`);
    const found = await searchVerifiedGiveaways("mixer", {
      apiKey: "test-key",
      searchUrl: "https://api.search.brave.com/res/v1/web/search",
      maxBraveCalls: 1,
      now: () => NOW,
      lookupImpl: async () => ["93.184.216.34"],
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("api.search.brave.com")) {
          return Response.json({ web: { results: [{ url: "https://www.kitchenaid.com/sweepstakes", title: "KitchenAid Mixer Sweepstakes", description: "" }] } });
        }
        if (url.endsWith("/robots.txt")) return new Response("missing", { status: 404 });
        if (url.includes("/official-rules")) return new Response("no", { status: 406, headers: { "content-type": "text/html" } });
        return new Response(main, { status: 200, headers: { "content-type": "text/html" } });
      },
    });
    const row = found.listings[0];
    expect(row?.endIso).toBe("2026-12-31");
    expect(row?.sponsorPageBlocked).not.toBe(true);
    expect(row?.rulesNote ?? "").not.toMatch(/need checking|not checked yet|was not read|could not be read|could not read this site|does not allow automated reading|shut down on/i);
    expect(row?.needsChecking ?? []).toEqual([]);
    expect(row?.listingGroup).toBe("verified");
  });

  it("does not follow the expired JetBlue sweepstakes redirect or invent its date", async () => {
    const found = await searchVerifiedGiveaways("vacation", {
      apiKey: "test-key",
      searchUrl: "https://api.search.brave.com/res/v1/web/search",
      maxBraveCalls: 1,
      now: () => NOW,
      lookupImpl: async () => ["93.184.216.34"],
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("api.search.brave.com")) {
          return Response.json({ web: { results: [{ url: "https://www.jetbluevacations.com/sweepstakes", title: "JetBlue Vacations Sweepstakes", description: "ends December 31, 2026" }] } });
        }
        if (url.endsWith("/robots.txt")) return new Response("missing", { status: 404 });
        return new Response("", { status: 301, headers: { location: "/deals?source=expired-sale_sweepstakes" } });
      },
    });
    const row = found.listings[0];
    expect(row?.listingGroup).toBe("check");
    expect(row?.endIso ?? null).toBeNull();
    expect(row?.sponsorPageBlocked).not.toBe(true);
  });

  it("stops after a host's first block and reads another host with the freed budget", async () => {
    const fetched: string[] = [];
    const blocked = ["https://blocked.example/sweepstakes/winter", "https://blocked.example/sweepstakes/spring", "https://blocked.example/sweepstakes/summer"];
    const readable = Array.from({ length: 3 }, (_, index) => `https://sponsor${index}.example/sweepstakes`);
    const press = "https://who13.com/business/press-releases/ein-presswire/800241878/side-by-side/";
    const results = [...blocked, ...readable, press].map((url) => ({ url, title: url, description: url.includes("who13") ? "EIN Presswire" : "" }));
    const found = await searchVerifiedGiveaways("truck", {
      apiKey: "test-key",
      searchUrl: "https://api.search.brave.com/res/v1/web/search",
      maxBraveCalls: 1,
      now: () => NOW,
      lookupImpl: async () => ["93.184.216.34"],
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("api.search.brave.com")) return Response.json({ web: { results } });
        if (url.endsWith("/robots.txt")) return new Response("missing", { status: 404 });
        fetched.push(url);
        if (url.includes("blocked.example")) return new Response("no", { status: 403, headers: { "content-type": "text/html" } });
        if (url.includes("who13.com")) {
          return new Response(`<!doctype html><html><head><title>Side by Side</title><meta name="description" content="EIN Presswire"></head><body><p>EIN Presswire. No purchase necessary. Enter to win a truck. Ends December 31, 2027.</p>${FORM}</body></html>`, { status: 200, headers: { "content-type": "text/html" } });
        }
        return new Response(sponsorPage("Truck Sweepstakes"), { status: 200, headers: { "content-type": "text/html" } });
      },
    });
    const blockedFetches = fetched.filter((url) => url.includes("blocked.example"));
    expect(blockedFetches).toEqual(["https://blocked.example/sweepstakes/winter"]);
    for (const url of blocked) {
      const row = found.listings.find((item) => item.url === url);
      expect(row?.sponsorPageBlocked, url).toBe(true);
      expect(row?.rulesNote ?? "").toMatch(/This site blocked our check/);
      expect(row?.endIso ?? null).toBeNull();
    }
    const pressRow = found.listings.find((item) => item.url === press);
    expect(pressRow?.listingGroup).toBe("check");
    expect(pressRow?.rulesNote ?? "").not.toMatch(/^The search stopped before this page/);
    expect(pressRow?.endIso).toBe("2027-12-31");
    expect(found.listings.find((item) => item.url === readable[0])?.rulesNote ?? "").not.toMatch(/search stopped before this page/);
  });

  it("does not end a blocked page from a snippet date, and names the unconfirmed facts", async () => {
    const found = await searchVerifiedGiveaways("gift card", {
      apiKey: "test-key",
      searchUrl: "https://api.search.brave.com/res/v1/web/search",
      maxBraveCalls: 1,
      now: () => NOW,
      lookupImpl: async () => ["93.184.216.34"],
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("api.search.brave.com")) {
          return Response.json({
            web: {
              results: [
                { url: "https://gleam.io/abcd/old-giveaway", title: "Old Gleam Giveaway", description: "The giveaway ends Dec 31, 2025." },
                { url: "https://gleam.io/efgh/undated", title: "Undated Gleam Giveaway", description: "Enter this Gleam giveaway." },
              ],
            },
          });
        }
        if (url.endsWith("/robots.txt")) return new Response("missing", { status: 404 });
        return new Response("no", { status: 403, headers: { "content-type": "text/html" } });
      },
    });
    const dated = found.listings.find((row) => row.url.includes("/abcd/"));
    const undated = found.listings.find((row) => row.url.includes("/efgh/"));
    expect(dated?.endIso ?? null).toBeNull();
    expect(confidenceTier(dated!, NOW)).toBe(2);
    expect(dated?.needsChecking).toEqual(["endDate", "freeEntry", "eligibility", "entryMethod"]);
    expect(dated?.rulesNote).toBe("End date, free entry, eligibility, and entry method need checking. Search preview says Dec 31, 2025. This site blocked our check.");
    expect(undated?.endIso ?? null).toBeNull();
    expect(confidenceTier(undated!, NOW)).toBe(2);
    expect(undated?.rulesNote).toBe("End date, free entry, eligibility, and entry method need checking. This site blocked our check.");
    expect(undated?.needsChecking).toEqual(["endDate", "freeEntry", "eligibility", "entryMethod"]);
  });

  it("keeps a readable page with a past end date Ended", async () => {
    const html = `<!doctype html><html><head><title>Winter Sweepstakes</title></head><body><p>No purchase necessary. Enter to win a truck. The sweepstakes ends on January 2, 2026. Must be 18 years or older. Winners will be selected in a random drawing.</p>${FORM}</body></html>`;
    const found = await search("truck", [{ url: "https://example.com/sweepstakes/winter", title: "Winter Sweepstakes", html }]);
    const row = found.listings[0];
    expect(row?.endIso).toBe("2026-01-02");
    expect(row?.needsChecking ?? []).toEqual([]);
    expect(confidenceTier(row!, NOW)).toBe(4);
  });

  it("keeps one Honda row, hides Glock junk, and drops a platform help page", async () => {
    const rules = "https://powersports.honda.com/ride-red-rules.pdf";
    const dealer = (host: string) => `<!doctype html><html><head><title>${host} Honda truck sweepstakes</title></head><body><p>No purchase necessary. Enter to win a Honda truck. Sponsored by Honda. Ends December 31, 2026. Open to legal residents of the United States who are 18 years or older. Winners will be selected in a random drawing.</p><a href="${rules}">Official Rules</a>${FORM}</body></html>`;
    const found = await searchVerifiedGiveaways("honda", {
      apiKey: "test-key",
      searchUrl: "https://api.search.brave.com/res/v1/web/search",
      maxBraveCalls: 1,
      now: () => NOW,
      lookupImpl: async () => ["93.184.216.34"],
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("api.search.brave.com")) {
          return Response.json({
            web: {
              results: [
                { url: "https://dealer1.example/honda", title: "Dealer 1 Honda truck sweepstakes", description: "" },
                { url: "https://dealer2.example/honda", title: "Dealer 2 Honda truck sweepstakes", description: "" },
                { url: "https://www.glock.com/p/43x", title: "Glock 43X review", description: "$500 Add to cart" },
                { url: "https://app.viralsweep.com/sweeps/glock", title: "Win A Glitter Glock 43X", description: "Enter to win" },
                { url: "https://woobox.com/help/getting-started", title: "Woobox help", description: "Documentation" },
                { url: "https://canada.example/cruise", title: "Canada only cruise", description: "Open only to residents of Canada only." },
              ],
            },
          });
        }
        if (url.endsWith("/robots.txt")) return new Response("missing", { status: 404 });
        if (url.includes("viralsweep")) return new Response("no", { status: 403, headers: { "content-type": "text/html" } });
        if (url.includes("dealer1")) return new Response(dealer("Dealer 1"), { status: 200, headers: { "content-type": "text/html" } });
        if (url.includes("dealer2")) return new Response(dealer("Dealer 2"), { status: 200, headers: { "content-type": "text/html" } });
        if (url.includes("glock.com")) return new Response(`<!doctype html><html><head><title>Glock 43X review</title></head><body><p>$500</p><button>Add to cart</button><p>A product review.</p></body></html>`, { status: 200, headers: { "content-type": "text/html" } });
        return new Response("missing", { status: 404 });
      },
    });
    const dealers = found.listings.filter((row) => row.url.includes("dealer"));
    expect(dealers).toHaveLength(1);
    expect(found.listings.some((row) => row.url.includes("woobox.com/help"))).toBe(false);
    expect(found.listings.some((row) => row.url.includes("canada.example"))).toBe(false);
    expect(found.listings.find((row) => row.url.includes("glock.com"))?.placement).toBe("related");
    const glock = found.listings.find((row) => row.url.includes("viralsweep"));
    expect(glock?.listingGroup).toBe("check");
    expect(glock?.placement ?? "main").toBe("main");
    expect(glock?.sponsorPageBlocked).toBe(true);
    const buckets = bucketRows(found.listings);
    expect(buckets.main.every((row) => row.listingGroup === "verified")).toBe(true);
    expect(buckets.needsChecking.map((row) => row.url)).toContain(glock!.url);
    expect(buckets.related.map((row) => row.url)).toContain(found.listings.find((row) => row.url.includes("glock.com"))!.url);
    const ranked = bucketRows(found.listings, "ranked");
    expect(ranked.needsChecking).toEqual([]);
    expect(ranked.main.map((row) => row.url)).toContain(glock!.url);
  });
});
