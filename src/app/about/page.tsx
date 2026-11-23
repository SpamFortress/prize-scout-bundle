import { FORTRESS_CHAT_ASK } from "@/domain/chat";
import { IDENTITY_CHAT_LABEL, IDENTITY_REMOVAL_ASK, IDENTITY_REMOVAL_GUIDANCE } from "@/domain/fortress";
import { CleanupRow } from "@/components/cleanup-row";
import { CHAT_URL, PREVIEW_URL } from "@/domain/types";

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 pt-20 pb-16 text-[#202124]">
      <h1 className="text-3xl font-normal">About</h1>
      <p>
        Prize Scout keeps a short list of official pages you ask it to fetch, and it can ask Prize Scout chat to search. The search box in this app does not search the public web.
      </p>
      <h2 className="text-xl">What this app can do</h2>
      <ul className="list-disc space-y-1 pl-5 text-sm text-[#3c4043]">
        <li>Ask Prize Scout chat to search. The search box in this app does not search the web.</li>
        <li>Fetch one official https page you name, and record a form or rules link only when that page contains them.</li>
        <li>Keep saved contests, saved searches, entries, and profile details in this tab only. Saving a contest is not an entry.</li>
        <li>Web search runs only when PRIZE_SCOUT_SEARCH_API_KEY is set to a Brave Search API subscription token. Without it, practice rows stay labeled samples. Listings are not invented.</li>
        <li>Enter prefills a free form and stops. A bookmarklet types name, email, phone, address, and date of birth into the open page. You press the sponsor&apos;s Submit button. Prize Scout never clicks Submit, solves a captcha, rotates IPs, or scripts a follow. Name, phone, street, and birth date are not stored in Profile. Hosts that forbid automated access (Woobox, ShortStack) are opened only. A web page cannot type into another site by itself, and a filler cannot see a closed shadow root, a cross-origin iframe, or a captcha widget.</li>
        <li>X, Facebook, and Instagram: this server has no login.</li>
        <li>Sponsor submission: off. No CAPTCHA solving. No win classifier.</li>
        <li>Mail provider: not connected. No inbox OAuth is configured.</li>
        <li>Email Fortress and Phone Fortress: not connected. A handoff is created only after a permitted pairing. Post-contest cleanup is their job. This app does not send removal letters.</li>
      </ul>
      <h2 className="text-xl">Email Fortress</h2>
      <p>
        Email Fortress pairing is optional. Profile prepares an unpaired draft only. It does not connect, send mail, or opt you out. Explicit pairing consent has to be given by you in Prize Scout chat. The recipient may also request direct consent. Prize Scout does not start that handshake on its own.
      </p>
      <p>
        An unpaired draft may include only a redacted sponsor, a public URL, a coarse date, the entry method, the channel, and an opaque reference. The email packet is prize-scout-email-cleanup/v1 with message_type link_proposal. The phone packet is prize-fortress-v1 PRIZE_FORTRESS_PAIR_REQUEST, status pending, owner confirmed false, and accepted false. Pending is not acceptance and is not a connection.
      </p>
      <p>{FORTRESS_CHAT_ASK}</p>
      <p>
        <a href={CHAT_URL} className="text-[#1a0dab] hover:underline">
          Start in Prize Scout chat
        </a>
      </p>
      <h2 className="text-xl">Contest details</h2>
      <CleanupRow />
      <p>{IDENTITY_REMOVAL_GUIDANCE}</p>
      <p>{IDENTITY_REMOVAL_ASK}</p>
      <p>
        <a href={CHAT_URL} className="text-[#1a0dab] hover:underline">
          {IDENTITY_CHAT_LABEL}
        </a>
      </p>
      <h2 className="text-xl">Preview</h2>
      <p>The celebration page is separate. It is not embedded here and it does not open on its own.</p>
      <p>
        <a href={PREVIEW_URL} target="_blank" rel="noreferrer" className="text-[#1a0dab] hover:underline">
          Preview
        </a>
      </p>
      <h2 id="adapters" className="text-xl">
        Adapter contract
      </h2>
      <p className="text-sm text-[#3c4043]">
        Live search uses the Brave Search API when PRIZE_SCOUT_SEARCH_API_KEY is set. Each https result is fetched, and a listing is kept only when that page shows a form and a rules link. The key is not shown here. A future submitter package would be named in PRIZE_SCOUT_SUBMITTER_MODULE and would export createSubmitter(). This app does not load that module or a filesystem path. Direct social tools are not authenticated.
      </p>
      <pre className="overflow-x-auto rounded-xl bg-[#f8f9fa] p-4 text-xs">{`{
  "verified": true,
  "urls": ["https://sponsor.example/enter"]
}`}</pre>
      <p className="text-sm text-[#3c4043]">
        Returned URLs would still be fetched and observed. A hit is not ready until the official page shows a form and a rules link. This server does not claim that observation makes a contest legitimate.
      </p>
    </main>
  );
}
