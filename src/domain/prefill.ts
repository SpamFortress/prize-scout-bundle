/**
 * Cross-site prefill. A web page cannot type into another site.
 * The same function is what the bookmarklet runs after the user clicks it on the sponsor page.
 * It never clicks Submit, never touches a captcha, and never follows a social action.
 */

export interface PrefillCard {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  dob: string;
}

export interface PrefillMatch {
  field: keyof PrefillCard;
  matched: string;
  value: string;
}

export interface PrefillReport {
  filled: PrefillMatch[];
  notOnPage: Array<keyof PrefillCard>;
  limits: string[];
  clickedSubmit: false;
}

export const SAMPLE_PREFILL_CARD: PrefillCard = {
  name: "Prize Scout Sample",
  email: "sample.entrant@example.com",
  phone: "208-555-0100",
  address: "1 Rules Fixture Road",
  city: "Boise",
  state: "ID",
  zip: "83702",
  dob: "1990-01-15",
};

/** Hosts whose terms forbid automated access. Open the page. Do not offer a filler. */
export function entryHostPolicy(url: string): "prefill" | "open-only" {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "open-only";
  }
  if (host === "woobox.com" || host.endsWith(".woobox.com")) return "open-only";
  if (host === "shortstack.com" || host.endsWith(".shortstack.com")) return "open-only";
  if (host.endsWith(".cmpgn.page") || host.endsWith(".lndg.page")) return "open-only";
  if (host === "rafflecopter.com" || host.endsWith(".rafflecopter.com")) return "open-only";
  return "prefill";
}

/** Runs in the sponsor page. Self-contained so a bookmarklet and the browser test share it. */
export function fillPrizeScoutForm(profile: PrefillCard): PrefillReport {
  const fields: Array<keyof PrefillCard> = ["name", "email", "phone", "address", "city", "state", "zip", "dob"];
  const aliases: Record<keyof PrefillCard, string[]> = {
    name: ["name", "fullname", "full_name", "custname", "customername", "firstname", "first_name"],
    email: ["email", "emailaddress", "custemail", "mail"],
    phone: ["phone", "tel", "telephone", "mobile", "custtel"],
    address: ["address", "street", "streetaddress", "address1", "addr"],
    city: ["city", "town"],
    state: ["state", "region", "province"],
    zip: ["zip", "zipcode", "postal", "postalcode", "postcode"],
    dob: ["dob", "birthday", "birthdate", "dateofbirth", "date_of_birth", "bday"],
  };
  const limits: string[] = [];
  const controls: HTMLInputElement[] = [];

  function norm(value: string | null | undefined): string {
    return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  function addFrom(root: ParentNode) {
    root.querySelectorAll("input, textarea").forEach((node) => {
      if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) controls.push(node as HTMLInputElement);
    });
    root.querySelectorAll("*").forEach((node) => {
      const shadow = (node as HTMLElement).shadowRoot;
      if (shadow) addFrom(shadow);
    });
  }

  addFrom(document);
  document.querySelectorAll("iframe").forEach((frame) => {
    try {
      const doc = frame.contentDocument;
      if (!doc) {
        limits.push("cross-origin iframe skipped");
        return;
      }
      addFrom(doc);
    } catch {
      limits.push("cross-origin iframe skipped");
    }
  });

  function labelText(control: HTMLInputElement): string {
    const id = control.id;
    const root = control.ownerDocument;
    if (id) {
      const label = root.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (label) return label.textContent ?? "";
    }
    const parent = control.closest("label");
    return parent?.textContent ?? "";
  }

  function score(control: HTMLInputElement, field: keyof PrefillCard): number {
    const type = (control.getAttribute("type") ?? "text").toLowerCase();
    if (["submit", "button", "password", "hidden", "file", "checkbox", "radio", "image", "reset", "search"].includes(type)) return 0;
    if (type === "email" && field !== "email") return 0;
    if (type === "tel" && field !== "phone") return 0;
    if ((type === "date" || type === "datetime-local") && field !== "dob") return 0;
    const name = norm(control.getAttribute("name"));
    const id = norm(control.id);
    const auto = norm(control.getAttribute("autocomplete"));
    const placeholder = norm(control.getAttribute("placeholder"));
    const aria = norm(control.getAttribute("aria-label"));
    const label = norm(labelText(control));
    let best = 0;
    for (const alias of aliases[field]) {
      const key = norm(alias);
      if (!key) continue;
      if (name === key || id === key) best = Math.max(best, 100);
      if (auto === key || auto.endsWith(key)) best = Math.max(best, 90);
      if (placeholder === key || aria === key) best = Math.max(best, 80);
      if (label === key || (key.length >= 4 && label.includes(key))) best = Math.max(best, 50);
    }
    if (field === "address" && (label.includes("email") || name.includes("email"))) return 0;
    return best;
  }

  const used = new Set<HTMLInputElement>();
  const filled: PrefillMatch[] = [];
  for (const field of fields) {
    const value = (profile[field] ?? "").trim();
    if (!value) continue;
    let best: HTMLInputElement | null = null;
    let bestScore = 0;
    let matched = "";
    for (const control of controls) {
      if (used.has(control)) continue;
      const next = score(control, field);
      if (next > bestScore) {
        best = control;
        bestScore = next;
        matched = control.getAttribute("name") || control.id || control.getAttribute("placeholder") || field;
      }
    }
    if (!best || bestScore < 50) continue;
    const prototype = best instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(prototype.prototype, "value")?.set;
    if (setter) setter.call(best, value);
    else best.value = value;
    best.dispatchEvent(new Event("input", { bubbles: true }));
    best.dispatchEvent(new Event("change", { bubbles: true }));
    used.add(best);
    filled.push({ field, matched, value });
  }

  const notOnPage = fields.filter((field) => profile[field]?.trim() && !filled.some((item) => item.field === field));
  return { filled, notOnPage, limits, clickedSubmit: false };
}

export function prefillBookmarklet(profile: PrefillCard): string {
  const payload = JSON.stringify(profile).replace(/</g, "\\u003c");
  return `javascript:(${fillPrizeScoutForm.toString()})(${payload})`;
}

export function prefillClipboard(profile: PrefillCard): string {
  return [
    `Name: ${profile.name}`,
    `Email: ${profile.email}`,
    `Phone: ${profile.phone}`,
    `Address: ${profile.address}`,
    `City: ${profile.city}`,
    `State: ${profile.state}`,
    `ZIP: ${profile.zip}`,
    `Date of birth: ${profile.dob}`,
  ].join("\n");
}
