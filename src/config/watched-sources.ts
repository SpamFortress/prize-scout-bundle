/**
 * Watched shops from the 2026-11-10 verified source list.
 * A hostname is not a listing. Prize and end-date strings are omitted when the
 * verification notes say those facts were not confirmed. Search never copies
 * them onto a row; a row shows only what its own fetched page stated.
 */
export interface WatchedSource {
  name: string;
  domain: string;
  category: "vehicle" | "travel" | "outdoors" | "cash" | "home" | "gun" | "retail" | "other";
  /** Known page to try on a category search. Not a prize and not an end date. */
  giveawayUrl?: string;
  /** Show the known URL when the site blocks the fetch. No prize or date is filled in. */
  showWhenBlocked?: boolean;
  /** Short label from the verification notes. Not a prize description. */
  caution: string | null;
  /** Shown only when the profile state matches. */
  stateCautions: Readonly<Record<string, string>>;
  /** Ticketed raffle. Never treated as a free automatic entry. */
  paidRaffle: boolean;
  /** Merch or membership entries. Other pages on this domain, including the homepage, stay Store. */
  storeBrand?: boolean;
  /** Donation entries. The sponsor’s own rules page stays Verified and Paid. */
  donation?: boolean;
  /** The notes state a free method. Used only for this known donation brand. */
  freeMethodStated?: boolean;
  /** Confirmed prize text, or null when the notes say it was not confirmed. */
  prize: string | null;
  /** Confirmed end date, or null when none was verified. */
  endDate: string | null;
}

export const WATCHED_SOURCES: readonly WatchedSource[] = [
  { name: "Honda Powersports", domain: "powersports.honda.com", category: "vehicle", caution: null, stateCautions: {}, paidRaffle: false, prize: null, endDate: null },
  { name: "Hodson Motors", domain: "hodsonmotors.com", category: "vehicle", caution: null, stateCautions: {}, paidRaffle: false, prize: "1996 Dodge Ram 2500 + $10,000 cash, or $20,000 cash alternative (declared value $35,000)", endDate: "2026-11-13" },
  { name: "Own Boss Supply Co.", domain: "ownbosssupplyco.com", category: "vehicle", caution: null, stateCautions: {}, paidRaffle: false, prize: "OB47 package: 2016 Ford F750 dump truck, 2016 Cat 299D2 skid steer, 2018 Cat HM418 mulching head, 2027 24-ft Load Trail trailer, and $20,000 cash (ARV $144,400)", endDate: "2026-11-15" },
  { name: "ENRFORCE", domain: "enrforce.com", category: "vehicle", caution: null, stateCautions: {}, paidRaffle: false, storeBrand: true, prize: "ENR#93: 2026 Ford F-150 Raptor R plus $30,000 cash (package ARV $100,000)", endDate: "2026-11-15" },
  { name: "LGND Supply Co.", domain: "lgndsupplyco.com", category: "vehicle", caution: null, stateCautions: {}, paidRaffle: false, prize: null, endDate: "2026-11-22" },
  { name: "80Eighty", domain: "80eighty.com", category: "vehicle", caution: null, stateCautions: {}, paidRaffle: false, prize: null, endDate: "2026-12-06" },
  { name: "Cleetus McFarland (GForce Media LLC)", domain: "cleetusmcfarland.com", category: "vehicle", caution: "Caution: prize vehicles are not street-legal", stateCautions: {}, paidRaffle: false, prize: "2025 Ford F-150 Raptor R, 2026 Polaris XPEDITION, 2026 Challenger car trailer, and $25,000 cash (total ARV $130,000). The prize vehicles are for racetrack or off-road use and are not street-legal.", endDate: "2026-11-30" },
  { name: "Maverik (Raptor Rampage / SNICKERS)", domain: "maverik.com", category: "vehicle", caution: null, stateCautions: {}, paidRaffle: false, prize: "2026 Ford F-150 Raptor, $5,000 cash, and up to $1,000 travel (ARV approximately $75,000)", endDate: "2026-12-29" },
  { name: "Dream Giveaway (New Beginning Children's Homes, Inc.)", domain: "dreamgiveaway.com", category: "vehicle", caution: null, stateCautions: {}, paidRaffle: false, donation: true, freeMethodStated: true, prize: "Multiple concurrent charity giveaways. The soonest listed close is the 2026 Cadillac Optiq-V.", endDate: "2026-11-19" },
  { name: "717 Supply", domain: "717supply.com", category: "vehicle", caution: null, stateCautions: {}, paidRaffle: false, prize: null, endDate: "2026-11-20" },
  { name: "Murphy's Diesel", domain: "murphysdiesel.com", category: "vehicle", caution: null, stateCautions: {}, paidRaffle: false, prize: "2025 Ford F-550, 2027 XLR Nitro Toy Hauler, 2026 Can-Am Maverick R, and $20,000 cash (ARV $200,000)", endDate: "2026-12-31" },
  { name: "Sarahntuned LLC", domain: "sarahntuned.com", category: "vehicle", caution: null, stateCautions: {}, paidRaffle: false, prize: "1987 Ford Ranger XLT plus $3,000 cash (total ARV $18,000)", endDate: "2026-12-18" },
  { name: "Go Roam Supply Co.", domain: "goroamsupply.com", category: "vehicle", caution: null, stateCautions: {}, paidRaffle: false, prize: "2026 Toyota Sequoia Platinum and 2026 Toyota Tacoma TRD Sport, plus $35,000 cash (approximate value $165,000)", endDate: "2026-11-13" },
  { name: "Tropical Torque", domain: "tropicaltorque.com", category: "vehicle", caution: null, stateCautions: {}, paidRaffle: false, prize: "2022 Lamborghini Urus (ARV $205,000) or $100,000 cash. The rules also allow a smaller cash alternative if the vehicle title is not secured.", endDate: "2027-03-21" },
  { name: "Hodge Twins (Diamond Hands LLC)", domain: "officialhodgetwins.com", category: "vehicle", caution: null, stateCautions: {}, paidRaffle: false, prize: "2026 Ford Bronco, $10,000 cash, and a one-way pickup trip (total ARV $81,749)", endDate: "2027-01-29" },
  { name: "One Country", domain: "onecountry.com", category: "vehicle", caution: null, stateCautions: {}, paidRaffle: false, prize: "2026 Ford Bronco Outer Banks, or $48,750 cash (ARV $48,750)", endDate: "2026-12-31" },
  { name: "JMR Rebuilders (JMR Store)", domain: "jmrstore.com", category: "vehicle", caution: null, stateCautions: {}, paidRaffle: false, prize: "1997 Ford F-350 and 20-ft trailer plus travel (pool about $20,250)", endDate: "2026-12-31" },
  { name: "Harvest Culture", domain: "theharvestculture.org", category: "vehicle", caution: null, stateCautions: {}, paidRaffle: false, prize: "1991 Chevrolet Camaro RS (ARV $20,000)", endDate: "2026-12-22" },
  { name: "Alltroo (Rally with Jeremy Camp / Speaking Louder)", domain: "alltroo.com", category: "vehicle", caution: "Caution: 24-hour winner reply", stateCautions: {}, paidRaffle: false, prize: "2026 Jeep Grand Wagoneer Summit Reserve plus $20,000 cash, or a $70,000 cash alternative", endDate: "2026-11-13" },
  { name: "NRA Win This Truck Sweepstakes", domain: "trucksweepstakes.nra.org", category: "vehicle", caution: null, stateCautions: {}, paidRaffle: false, prize: "Winner's choice of a truck plus an adventure prize and $25,000 cash (grand prize VRV $110,000)", endDate: "2027-01-30" },
  { name: "Win a Chevy Sweepstakes (General Motors / EventLink Group)", domain: "winchevy.com", category: "vehicle", caution: null, stateCautions: { ID: "Not open in Idaho" }, paidRaffle: false, prize: "Winner's choice of one Chevrolet vehicle with MSRP up to $50,000", endDate: "2026-12-31" },
  { name: "518 Motorsports (Ultra4 Jones / The Company Truck)", domain: "ultra4jones.com", category: "vehicle", caution: null, stateCautions: {}, paidRaffle: false, prize: "Used 2008 Ford F-350 or $5,000 cash", endDate: "2026-11-20" },
  { name: "Portside Giveaways", domain: "portsidegiveaways.com", category: "vehicle", caution: null, stateCautions: {}, paidRaffle: false, prize: "Axopar 28 T-Top Brabus Edition boat or $100,000 cash", endDate: "2026-11-30" },
  { name: "Montana Knife Company", domain: "montanaknifecompany.com", category: "travel", caution: null, stateCautions: {}, paidRaffle: false, prize: "Ridge XT Overlander RV package (ARV $183,000), or $100,000 cash plus the gear package", endDate: "2026-12-01" },
  { name: "Major League Fishing (MLF Bass Pro Shops Z19 Sweepstakes)", domain: "majorleaguefishing.com", category: "outdoors", caution: null, stateCautions: {}, paidRaffle: false, prize: "Nitro Z19 boat package and additional prizes (total ARV $61,528.96)", endDate: "2026-11-20" },
  { name: "SIG Sauer x Decked Sweepstakes", domain: "sigsauer.com", category: "outdoors", caution: null, stateCautions: {}, paidRaffle: false, prize: "SIG Sauer Sawtooth rifle, DECKED drawer certificate, and DECKED case (total ARV $4,804.98)", endDate: "2026-11-23" },
  { name: "Delta Waterfowl (Built for the Blind Sweepstakes)", domain: "deltawaterfowl.org", category: "outdoors", caution: null, stateCautions: {}, paidRaffle: false, prize: "Excel duck boat package plus additional firearm and optics prizes", endDate: "2026-12-11" },
  { name: "Okuma Fishing", domain: "okumafishingusa.com", category: "outdoors", caution: null, stateCautions: {}, paidRaffle: false, prize: "40 limited-edition Okuma spinning reels", endDate: "2026-11-30" },
  { name: "Shoshone Prairie Adventures (Winchester Duck Hunt Giveaway)", domain: "shoshoneadventures.com", category: "outdoors", caution: null, stateCautions: {}, paidRaffle: false, prize: "Two-day Kansas duck hunt for 2 hunters (ARV $6,000)", endDate: "2026-12-01" },
  { name: "Ramsey (The Lampo Group, LLC)", domain: "ramseysolutions.com", category: "cash", caution: null, stateCautions: {}, paidRaffle: false, prize: "$10,000 grand prize plus eight weekly $500 prizes", endDate: "2026-12-20" },
  { name: "OnePay (One Finance, Inc.)", domain: "onepay.com", category: "cash", caution: null, stateCautions: {}, paidRaffle: false, prize: "$100,000 deposited to a OnePay account, or a check for a mail entry", endDate: "2026-11-30" },
  { name: "Corona Premier Golf 2026 Sweepstakes (Crown Imports LLC)", domain: "coronausa.com", category: "travel", caution: null, stateCautions: {}, paidRaffle: false, prize: "Golf trips and weekly golf bundles. The remaining listed destination is San Diego.", endDate: "2026-12-31" },
  { name: "KitchenAid (Whirlpool Corporation)", domain: "kitchenaid.com", category: "home", caution: null, stateCautions: {}, paidRaffle: false, prize: "One KitchenAid small appliance with MSRP up to $700", endDate: "2026-12-31" },
  { name: "Ethan Allen", domain: "ethanallen.com", category: "cash", caution: null, stateCautions: {}, paidRaffle: false, prize: "$1,500 Ethan Allen gift card", endDate: "2026-12-31" },
  { name: "St. Jude Children's Research Hospital Dream Home Giveaway", domain: "stjude.org", category: "home", caution: "Paid raffle ticket", stateCautions: {}, paidRaffle: true, prize: null, endDate: null },
  { name: "DEWALT (Stanley Black & Decker)", domain: "dewalt.com", category: "other", caution: null, stateCautions: {}, paidRaffle: false, prize: "Monthly drawings for DEWALT tools", endDate: "2026-12-31" },
  { name: "Be Great Golf", domain: "begreatgolf.com", category: "other", caution: null, stateCautions: {}, paidRaffle: false, prize: "Eight-item golf package (total ARV $1,143.05)", endDate: "2026-12-14" },
  { name: "Bryan Anthonys (Gold Words, LLC)", domain: "bryananthonys.com", category: "other", caution: null, stateCautions: {}, paidRaffle: false, prize: "$1,000 of jewelry plus five $100 gift cards", endDate: "2026-11-20" },
  { name: "Guns.com", domain: "guns.com", category: "gun", caution: null, stateCautions: {}, paidRaffle: false, prize: null, endDate: null, giveawayUrl: "https://www.guns.com/giveaways", showWhenBlocked: true },
  { name: "Gun Talk", domain: "guntalk.com", category: "gun", caution: null, stateCautions: {}, paidRaffle: false, prize: null, endDate: null, giveawayUrl: "https://www.guntalk.com/win", showWhenBlocked: true },
  { name: "NRA Whittington Center", domain: "nrawc.org", category: "gun", caution: null, stateCautions: {}, paidRaffle: false, prize: null, endDate: null, giveawayUrl: "https://www.nrawc.org/sweepstakes", showWhenBlocked: true },
  /**
   * Retail boosters. Only HGTV and Food Network had a sweepstakes path this app already
   * knows (/sweepstakes and /sweepstakes/<name>). Williams Sonoma, Sur La Table, Le Creuset,
   * Target, Walmart, Kohl's, Home Depot, Lowe's, Bass Pro, Cabela's, Sephora, Ulta, Visa,
   * and Mastercard did not return a confirmed sweepstakes URL (blocked, 404, or a coupon page),
   * so they are not listed. No prize or end date is stored.
   */
  { name: "HGTV", domain: "hgtv.com", category: "retail", caution: null, stateCautions: {}, paidRaffle: false, prize: null, endDate: null, giveawayUrl: "https://www.hgtv.com/sweepstakes" },
  { name: "Food Network", domain: "foodnetwork.com", category: "retail", caution: null, stateCautions: {}, paidRaffle: false, prize: null, endDate: null, giveawayUrl: "https://www.foodnetwork.com/sweepstakes" },
  { name: "Gleam Giveaways", domain: "gleam.io", category: "other", caution: null, stateCautions: {}, paidRaffle: false, prize: null, endDate: null, giveawayUrl: "https://gleam.io/giveaways" },
];

/**
 * Who may take cash instead of the prize, from the verified rules notes.
 * Omitted sources do not state a cash alternative. “Plus cash” is not listed here.
 */
const CASH_CHOICE: Readonly<Record<string, "winner" | "sponsor" | "both" | "unspecified">> = {
  "hodsonmotors.com": "unspecified",
  "murphysdiesel.com": "winner",
  "tropicaltorque.com": "both",
  "alltroo.com": "winner",
  "trucksweepstakes.nra.org": "winner",
  "ultra4jones.com": "winner",
  "portsidegiveaways.com": "unspecified",
  "montanaknifecompany.com": "winner",
  "onecountry.com": "unspecified",
};

export function seedCashChoice(domain: string): "winner" | "sponsor" | "both" | "unspecified" | null {
  return CASH_CHOICE[domain] ?? null;
}

export function watchedDomains(sources: readonly WatchedSource[] = WATCHED_SOURCES, category?: WatchedSource["category"]): string[] {
  return sources.filter((source) => !category || source.category === category).map((source) => source.domain);
}

export function hostName(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export function watchedSourceFor(url: string, sources: readonly WatchedSource[] = WATCHED_SOURCES): WatchedSource | null {
  const host = hostName(url);
  if (!host) return null;
  return sources.find((source) => host === source.domain || host.endsWith(`.${source.domain}`)) ?? null;
}

/** Seed prize and end date only when that fact was confirmed. Unconfirmed fields stay null. */
export function presentableSeedFacts(source: WatchedSource): { prize: string | null; endDate: string | null } {
  return { prize: source.prize, endDate: source.endDate };
}

/** Caution label for a result. State-specific notes appear only for that profile state. */
export function cautionForUrl(url: string, profileState: string | null, sources: readonly WatchedSource[] = WATCHED_SOURCES): string | null {
  const source = watchedSourceFor(url, sources);
  if (!source) return null;
  const state = profileState?.trim().toUpperCase() ?? "";
  const parts = [source.caution, state ? source.stateCautions[state] : null].filter((item): item is string => Boolean(item));
  return parts.length > 0 ? parts.join(" · ") : null;
}
