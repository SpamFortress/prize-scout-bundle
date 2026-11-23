import { searchVerifiedGiveaways } from "@/server/giveaway-search";

const HTML = `<!doctype html><html><head><title>Stake.us Sweeps Coins</title></head><body><p>No purchase necessary. Official rules. Sponsored by Stake. Enter to win Sweeps Coins and Gold Coins. This is a social casino. Open to legal residents of the United States who are 18 years or older. The sweepstakes ends on December 31, 2026.</p><form action="/enter"><input name="email"><button type="submit">Enter</button></form></body></html>`;

export default async function CasinoNotePage() {
  const found = await searchVerifiedGiveaways("sweeps coins", {
    apiKey: "test-key",
    searchUrl: "https://api.search.brave.com/res/v1/web/search",
    maxBraveCalls: 1,
    now: () => new Date("2026-11-16T12:00:00.000Z"),
    lookupImpl: async () => ["93.184.216.34"],
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.includes("api.search.brave.com")) {
        return Response.json({ web: { results: [{ url: "https://stake.us/sweeps", title: "Stake.us Sweeps Coins", description: "Sweeps Coins" }] } });
      }
      if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nAllow: /\n", { status: 200 });
      return new Response(HTML, { status: 200, headers: { "content-type": "text/html" } });
    },
  });
  const row = found.listings[0];
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-normal text-[#202124]">Needs checking</h1>
      <article data-live-result={row?.url} className="mt-6 border-b border-[#ebebeb] py-4">
        <p className="text-xl text-[#1a0dab]">{row?.title}</p>
        <p className="text-sm text-[#006621]">{row?.url}</p>
        {row?.rulesNote ? <p data-rules-note className="mt-2 text-sm leading-5 text-[#3c4043]">{row.rulesNote}</p> : null}
      </article>
    </main>
  );
}
