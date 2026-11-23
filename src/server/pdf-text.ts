import { extractText } from "unpdf";

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Turns one PDF's text into HTML the contest classifier already understands. */
export async function pdfBytesToHtml(bytes: Uint8Array): Promise<string> {
  const extracted = await extractText(bytes, { mergePages: true });
  const raw = extracted.text as string | string[];
  const text = Array.isArray(raw) ? raw.join("\n") : raw;
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length < 20) return "";
  const title = clean.slice(0, 80);
  return `<!doctype html><html><head><title>${escapeText(title)}</title></head><body><p>${escapeText(clean)}</p></body></html>`;
}
