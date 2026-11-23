/** Brand and product words that choose a watched-site category. Not a guns-only list. */
export type BrandCategory = "gun" | "vehicle" | "cruise" | "cash";

const BRANDS: Array<{ category: BrandCategory; names: string[] }> = [
  {
    category: "gun",
    names: [
      "sig sauer",
      "smith & wesson",
      "smith and wesson",
      "s&w",
      "glock",
      "sig",
      "ruger",
      "springfield",
      "taurus",
      "beretta",
      "henry",
      "savage",
      "walther",
      "cz",
      "fn",
      "daniel defense",
      "mossberg",
      "remington",
      "winchester",
      "browning",
      "colt",
    ],
  },
  {
    category: "vehicle",
    names: ["honda", "polaris", "can-am", "can am", "yamaha", "kawasaki", "ktm"],
  },
  {
    category: "cruise",
    names: [
      "royal caribbean",
      "norwegian cruise",
      "celebrity cruises",
      "princess cruises",
      "msc cruises",
      "holland america",
      "disney cruise",
      "carnival",
      "norwegian",
    ],
  },
  { category: "cash", names: ["cash"] },
];

const SHORT_GUN_BRANDS = new Set(["henry", "colt"]);
const GUN_WORD = /\b(?:guns?|firearms?|rifles?|pistols?|revolvers?|shotguns?|handguns?|lever[\s-]?actions?)\b/i;

const CATEGORY_WORDS: Array<{ category: BrandCategory; pattern: RegExp }> = [
  { category: "gun", pattern: GUN_WORD },
  { category: "vehicle", pattern: /\b(?:generators?|power equipment|motorcycles?|vehicles?|trucks?|cars?|suvs?|atvs?|utvs?|dirt\s*bikes?)\b/i },
  { category: "cruise", pattern: /\bcruises?\b/i },
  { category: "cash", pattern: /\bcash\b|\$\s?\d|\bgift cards?\b|student loan payoff/i },
];

const FAMILY_WORDS: Record<string, RegExp> = {
  generator: /\bgenerators?\b|\bpower equipment\b/i,
  motorcycle: /\bmotorcycles?\b|\bdirt\s*bikes?\b|\bmotocross\b/i,
  vehicle: /\b(?:vehicles?|trucks?|cars?|suvs?|atvs?|utvs?|boats?)\b/i,
  gun: GUN_WORD,
  cruise: /\bcruises?\b/i,
  cash: /\bcash\b|\$\s?\d|\bgift cards?\b|student loan payoff/i,
};

function namePattern(name: string): RegExp {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\&/g, "\\s*&\\s*").replace(/ /g, "\\s+");
  return new RegExp(String.raw`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, "i");
}

/** Categories named by the query, from brands first and then ordinary words. */
function brandCounts(name: string, query: string): boolean {
  if (!namePattern(name).test(query)) return false;
  if (SHORT_GUN_BRANDS.has(name) && !GUN_WORD.test(query)) return false;
  return true;
}

export function queryCategories(query: string): BrandCategory[] {
  const found: BrandCategory[] = [];
  for (const group of BRANDS) {
    if (group.names.some((name) => brandCounts(name, query))) found.push(group.category);
  }
  for (const word of CATEGORY_WORDS) {
    if (word.pattern.test(query)) found.push(word.category);
  }
  return [...new Set(found)];
}

/** Brand names in the query. The word "cash" is a category, not a brand that must be printed on the prize. */
export function brandsInQuery(query: string): string[] {
  const names = BRANDS.filter((group) => group.category !== "cash").flatMap((group) => group.names);
  const sorted = [...names].sort((left, right) => right.length - left.length);
  const found: string[] = [];
  for (const name of sorted) {
    if (brandCounts(name, query) && !found.some((item) => item.includes(name) || name.includes(item))) found.push(name);
  }
  return found;
}

const GENERIC_QUERY_WORDS = new Set([
  "giveaway", "giveaways", "sweepstakes", "sweeps", "contest", "contests", "win", "free", "official", "rules",
  "cash", "money", "cruise", "cruises", "truck", "trucks", "car", "cars", "suv", "suvs", "vacation", "vacations",
  "gift", "card", "cards", "gun", "guns", "utv", "atv", "motorcycle", "motorcycles", "bike", "bikes", "dirt",
  "kitchen", "home", "boat", "boats", "rifle", "pistol", "crf", "motocross",
]);

function prizeSurface(title: string, text: string): string {
  const sponsor = /\b(?:sponsored by|the sponsor is|sponsor:)\s+([^.]{2,80})/i.exec(text)?.[1] ?? "";
  const prize = /\b(?:enter to win|prize:)\s+(?:a |an |the |your )?([^.]{3,160})/i.exec(text)?.[1] ?? "";
  return `${title} ${sponsor} ${prize} ${text}`.toLowerCase();
}

/** Distinctive product words in the query that are missing from the title, sponsor, and prize text. */
export function missingPrizeTerms(query: string, title: string, text: string): string[] {
  const brands = new Set(brandsInQuery(query).map((name) => name.toLowerCase()));
  if (brands.size === 0) return [];
  const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2 && !GENERIC_QUERY_WORDS.has(word) && !brands.has(word));
  const unique = [...new Set(terms)];
  const hay = prizeSurface(title, text);
  const modelKey = (term: string) => term.replace(/^[a-z]+(?=\d)/, "");
  const matched = unique.filter((term) => hay.includes(term) || hay.includes(modelKey(term)));
  const modelMatched = matched.some((term) => /\d/.test(term));
  return unique.filter((term) => {
    if (matched.includes(term)) return false;
    if (modelMatched && !/\d/.test(term)) return false;
    return true;
  });
}

/** True when a searched brand is missing from the title, sponsor line, and prize sentence. */
export function prizeMissesBrand(query: string, title: string, text: string, url = ""): boolean {
  const brands = brandsInQuery(query);
  if (brands.length === 0) return false;
  const sponsor = /\b(?:sponsored by|the sponsor is|sponsor:)\s+([^.]{2,80})/i.exec(text)?.[1] ?? "";
  const prize = /\b(?:enter to win|prize:)\s+(?:a |an |the |your )?([^.]{3,120})/i.exec(text)?.[1] ?? "";
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    host = "";
  }
  const hay = `${title} ${sponsor} ${prize} ${host}`.toLowerCase();
  return brands.some((brand) => !hay.includes(brand.toLowerCase()));
}

/** Family used for the two-per-family cap. Prize and title text beat a bare brand. */
export function productFamily(title: string, prize = ""): string | null {
  const blob = `${title} ${prize}`;
  if (/\bgenerators?\b|\bpower equipment\b/i.test(blob)) return "generator";
  if (/\bmotorcycles?\b|\bdirt\s*bikes?\b/i.test(blob)) return "motorcycle";
  if (/\bcruises?\b/i.test(blob) || brandsInText(blob, "cruise")) return "cruise";
  if (/\b(?:guns?|pistols?|rifles?|firearms?|shotguns?)\b/i.test(blob) || brandsInText(blob, "gun")) return "gun";
  if (/\bcash prize\b|\bcash giveaway\b/i.test(blob)) return "cash";
  if (/\b(?:trucks?|vehicles?|suvs?|atvs?|utvs?|boats?)\b/i.test(blob) || brandsInText(blob, "vehicle")) return "vehicle";
  return null;
}

function brandsInText(text: string, category: BrandCategory): boolean {
  const names = BRANDS.find((group) => group.category === category)?.names ?? [];
  return names.some((name) => namePattern(name).test(text));
}

/** The query names this family in words. A brand alone does not turn the cap off. */
export function queryNamesFamily(query: string, family: string): boolean {
  const pattern = FAMILY_WORDS[family];
  return pattern ? pattern.test(query) : query.toLowerCase().includes(family);
}
