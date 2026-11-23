"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { usePracticeOptional } from "@/components/practice-provider";
import {
  SAMPLE_RECEIPTS,
  correctReceiptAmount,
  giveawayTitle,
  groupPracticeGiveaways,
  readableReceipt,
  reassignReceipt,
  recordReceipt,
  type SampleReceipt,
} from "./profile-sample";

const SAMPLE_EMAIL = "sample.person@example.com";
const SAMPLE_PHONE = "(555) 010-0199";
const SAMPLE_ADDRESS = "100 Example Street, Springfield";

function maskEmail(value: string): string {
  const [name, host] = value.split("@");
  return `${name.slice(0, 1)}••••@${host ?? "example.com"}`;
}

function maskPhone(): string {
  return "(•••) •••-0199";
}

function maskAddress(): string {
  return "••• Example Street, Springfield";
}

export function ProfilePreview({ onBack }: { onBack: () => void }) {
  const [notice, setNotice] = useState("");
  const [openSections, setOpenSections] = useState<string[]>(["entry"]);
  const [name, setName] = useState("Sample Person");
  const [email, setEmail] = useState(SAMPLE_EMAIL);
  const [phone, setPhone] = useState(SAMPLE_PHONE);
  const [address, setAddress] = useState(SAMPLE_ADDRESS);
  const [revealEmail, setRevealEmail] = useState(false);
  const [revealPhone, setRevealPhone] = useState(false);
  const [revealAddress, setRevealAddress] = useState(false);
  const [needPhone, setNeedPhone] = useState(true);
  const [needAddress, setNeedAddress] = useState(true);
  const [emailRole, setEmailRole] = useState<"personal" | "dedicated">("dedicated");
  const [connectNote, setConnectNote] = useState<string | null>(null);
  const practice = usePracticeOptional();
  const onPracticeTab = usePathname().startsWith("/practice");
  const [localReceipts, setLocalReceipts] = useState<SampleReceipt[]>(SAMPLE_RECEIPTS);
  const receipts = practice ? practice.receipts : localReceipts;
  const setReceipts = practice ? practice.setReceipts : setLocalReceipts;
  const savedIds = practice?.checked ?? ["demo-illustration-1", "demo-illustration-2", "demo-illustration-3"];
  const enteredIds = practice?.confirmedEntryIds ?? [];
  const groups = groupPracticeGiveaways(savedIds, enteredIds);
  const [query, setQuery] = useState("");
  const [openReceiptId, setOpenReceiptId] = useState<string | null>(null);
  const [amountDraft, setAmountDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [undo, setUndo] = useState<SampleReceipt | null>(null);
  const [region, setRegion] = useState("US");
  const [methodPreference, setMethodPreference] = useState<"all" | "free" | "paid">("all");
  const [winNotices, setWinNotices] = useState(true);
  const [problemNotices, setProblemNotices] = useState(true);
  const [promoNotices, setPromoNotices] = useState(false);

  const openReceipt = receipts.find((item) => item.id === openReceiptId) ?? null;
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return receipts;
    return receipts.filter((item) => {
      const haystack = `${item.date} ${item.merchant} ${item.amount} ${giveawayTitle(item.giveawayId)}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [query, receipts]);

  function toggleSection(id: string) {
    setOpenSections((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function openReceiptDialog(item: SampleReceipt) {
    setAmountDraft(String(item.amount));
    setConfirmDelete(false);
    setOpenReceiptId(item.id);
  }

  function recordAgain(item: SampleReceipt) {
    const next = recordReceipt(receipts, {
      messageId: `${item.messageIds[0]}-forward`,
      sameAsMessageId: item.messageIds[0],
      date: item.date,
      merchant: item.merchant,
      amount: item.amount + 24,
      giveawayId: item.giveawayId,
      body: item.body,
      attachmentName: item.attachmentName,
    });
    setReceipts(next.receipts);
    setNotice(next.added ? "A new sample receipt was added." : `Same sample receipt. The spend stays $${item.amount}. It was not counted twice.`);
  }

  return (
    <div data-profile-preview="sample">
      {onPracticeTab ? null : (
        <p className="bg-[#fef7e0] px-4 py-3 text-sm font-medium text-[#202124]">
          DESIGN PREVIEW — sample Profile. Not your Profile. Nothing here is saved, connected, or collected.
        </p>
      )}
      <h1 className="mt-6 text-3xl font-normal text-[#202124]">Profile</h1>
      {notice ? (
        <p className="mt-4 text-sm text-[#3c4043]" role="status">
          {notice}
        </p>
      ) : null}

      <div className="mt-8 divide-y divide-[#ebebeb] border-y border-[#ebebeb]">
        <section className="py-4" data-profile-section="entry">
          <SectionButton open={openSections.includes("entry")} onClick={() => toggleSection("entry")} controls="entry-panel" title="Entry details" summary="Free methods only · Sample fields, not your identity" />
          {openSections.includes("entry") ? <div id="entry-panel">
          <div className="mt-4 max-w-xl text-sm leading-6">
            <p>Prefill is only for a free entry. You still press the sponsor&apos;s Submit button. Paid form filling, checkout, and purchase are never filled.</p>
            <p className="mt-2 text-[#3c4043]">A paid action on the Entries list is a later correction. This profile preview does not change Entries.</p>
            <p className="mt-2 text-xs text-[#70757a]">Demo only. Edits stay in this preview. They are not saved as your identity.</p>
            <label className="mt-4 block">
              Name
              <input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 block h-10 w-full rounded-md border border-[#dadce0] px-3" />
            </label>
            <MaskedField label="Email" shown={revealEmail} masked={maskEmail(email)} value={email} onChange={setEmail} onToggle={() => setRevealEmail((current) => !current)} />
            <label className="mt-3 flex items-center gap-2">
              <input type="checkbox" checked={needPhone} onChange={(event) => setNeedPhone(event.target.checked)} />
              Sample rules require a phone
            </label>
            {needPhone ? <MaskedField label="Phone · required by this sample" shown={revealPhone} masked={maskPhone()} value={phone} onChange={setPhone} onToggle={() => setRevealPhone((current) => !current)} /> : <p className="mt-2 text-[#70757a]">Phone stays hidden until a free entry’s rules require it.</p>}
            <label className="mt-3 flex items-center gap-2">
              <input type="checkbox" checked={needAddress} onChange={(event) => setNeedAddress(event.target.checked)} />
              Sample rules require a mailing address
            </label>
            {needAddress ? (
              <MaskedField label="Mailing address · required by this sample" shown={revealAddress} masked={maskAddress()} value={address} onChange={setAddress} onToggle={() => setRevealAddress((current) => !current)} />
            ) : (
              <p className="mt-2 text-[#70757a]">Mailing address stays hidden until a free entry’s rules require it.</p>
            )}
            <p className="mt-3 text-[#3c4043]">Not collected: password, payment card, or government ID.</p>
          </div>
          </div> : null}
        </section>

        <section className="py-4" data-profile-section="email">
          <SectionButton open={openSections.includes("email")} onClick={() => toggleSection("email")} controls="email-panel" title="Email & Fortress" summary="Not connected · Unpaired" />
          {openSections.includes("email") ? <div id="email-panel">
          <div className="mt-4 max-w-xl text-sm leading-6">
            <p className="inline-block rounded-full border border-[#202124] px-3 py-1 font-medium">Not connected</p>
            <p className="mt-3">Unpaired. A mail account is not a Fortress pairing. Preparing a draft is not a live connection. This preview does not prepare one and does not send a pairing message.</p>
            <fieldset className="mt-4">
              <legend>Contest email role</legend>
              <label className="mt-2 flex items-start gap-2">
                <input type="radio" name="sample-email-role" checked={emailRole === "dedicated"} onChange={() => setEmailRole("dedicated")} />
                <span>Dedicated sample role. No address is allocated, and no inbox is read.</span>
              </label>
              <label className="mt-2 flex items-start gap-2">
                <input type="radio" name="sample-email-role" checked={emailRole === "personal"} onChange={() => setEmailRole("personal")} />
                <span>Personal sample role, {SAMPLE_EMAIL}. Not a real mailbox.</span>
              </label>
            </fieldset>
            <p className="mt-3">Confirmations and receipts would use that contest email role. Bonus offers are a separate stream. This preview does not route mail.</p>
            <p className="mt-2">Sample warning: one message asks for a fee to claim a prize. That warning is about that message. It is not a verdict that other mail is safe.</p>
            <button type="button" className="mt-4 h-9 rounded-full border border-[#dadce0] bg-white px-4" onClick={() => setConnectNote("Preview only—no connection made.")}>
              Connect
            </button>
            {connectNote ? <p className="mt-2">{connectNote} Status remains Not connected.</p> : null}
          </div>
          </div> : null}
        </section>

        <section className="py-4" data-profile-section="receipts">
          <SectionButton open={openSections.includes("receipts")} onClick={() => toggleSection("receipts")} controls="receipts-panel" title="Receipts" summary={`${receipts.length} sample ${receipts.length === 1 ? "receipt" : "receipts"} · not from a mailbox`} />
          {openSections.includes("receipts") ? <div id="receipts-panel">
          <div className="mt-4 text-sm leading-6">
            <p className="max-w-xl text-[#3c4043]">Demo only. A repeated forward updates the same sample transaction. Reassigning it does not copy the receipt or change an organizer’s entries. Nothing here is a tax writeoff.</p>
            {undo ? (
              <p className="mt-3" role="status">
                Sample receipt removed.{" "}
                <button type="button" className="text-[#1a0dab] underline" onClick={() => { setReceipts((current) => [undo, ...current]); setUndo(null); }}>
                  Undo
                </button>
              </p>
            ) : null}
            <label className="mt-3 block max-w-xs">
              Search sample receipts
              <input value={query} onChange={(event) => setQuery(event.target.value)} className="mt-1 block h-10 w-full rounded-md border border-[#dadce0] px-3" />
            </label>
            {shown.length === 0 ? <p className="mt-3 text-[#70757a]">No sample receipt matches.</p> : null}
            <ul className="mt-3 divide-y divide-[#ebebeb] border-y border-[#ebebeb]">
              {shown.map((item) => (
                <li key={item.id}>
                  <button type="button" className="flex w-full flex-wrap items-baseline gap-x-4 gap-y-1 py-3 text-left hover:underline" onClick={() => openReceiptDialog(item)}>
                    <span>{item.date}</span>
                    <span className="font-medium">{item.merchant}</span>
                    <span>${item.amount}</span>
                    <span className="text-[#3c4043]">{giveawayTitle(item.giveawayId)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          </div> : null}
        </section>

        <section className="py-4" data-profile-section="preferences">
          <SectionButton open={openSections.includes("preferences")} onClick={() => toggleSection("preferences")} controls="preferences-panel" title="Preferences" summary={`Promotions ${promoNotices ? "on" : "off"} · Budget is not set here`} />
          {openSections.includes("preferences") ? <div id="preferences-panel">
          <div className="mt-4 max-w-xl text-sm leading-6">
            <p className="text-xs text-[#70757a]">Demo only. These switches do not change saved preferences, routines, or notifications.</p>
            <label className="mt-4 block">
              Default search region, optional
              <select value={region} onChange={(event) => setRegion(event.target.value)} className="mt-1 block h-10 w-full rounded-md border border-[#dadce0] bg-white px-3">
                <option value="">No region</option>
                <option value="US">United States</option>
                <option value="CA">Canada</option>
              </select>
            </label>
            <p className="mt-1 text-xs text-[#70757a]">Not used for a live search.</p>
            <fieldset className="mt-4">
              <legend>Free or paid preference</legend>
              {(
                [
                  ["all", "All methods"],
                  ["free", "Free methods"],
                  ["paid", "Paid methods"],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="mt-2 flex items-center gap-2">
                  <input type="radio" name="sample-method-preference" checked={methodPreference === value} onChange={() => setMethodPreference(value)} />
                  {label}
                </label>
              ))}
            </fieldset>
            <p className="mt-1 text-xs text-[#70757a]">Sample default only. It does not change the Entries list.</p>
            <label className="mt-4 flex items-center gap-2">
              <input type="checkbox" checked={winNotices} onChange={(event) => setWinNotices(event.target.checked)} />
              Win notices
            </label>
            <label className="mt-2 flex items-center gap-2">
              <input type="checkbox" checked={problemNotices} onChange={(event) => setProblemNotices(event.target.checked)} />
              Entry-problem notices
            </label>
            <label className="mt-2 flex items-center gap-2">
              <input type="checkbox" checked={promoNotices} onChange={(event) => setPromoNotices(event.target.checked)} />
              Promotional bonuses
            </label>
            <p className="mt-2 text-[#3c4043]">Promotions can stay off while win notices and entry-problem notices stay on. No notice is sent from this preview.</p>
            <p className="mt-3">A budget is optional each time you compare. This profile does not store an amount as what you can afford.</p>
          </div>
          </div> : null}
        </section>
      </div>

      <Button type="button" variant="ghost" className="mt-8 text-[#1a73e8]" onClick={onBack}>
        Back to sample results
      </Button>

      <Dialog
        open={openReceipt !== null}
        onOpenChange={(next) => {
          if (!next) setOpenReceiptId(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl" style={{ backgroundColor: "#ffffff", color: "#202124", opacity: 1, animation: "none" }}>
          {openReceipt ? (
            <>
              <DialogTitle className="pr-8 text-xl font-normal">Sample receipt</DialogTitle>
              <DialogDescription className="text-sm leading-6 text-[#3c4043]">Prize Scout readable copy. Not a mail app, and not fetched from an inbox.</DialogDescription>
              <pre className="whitespace-pre-wrap rounded-md border border-[#ebebeb] bg-[#f8f9fa] p-3 font-sans text-sm leading-6">{readableReceipt(openReceipt)}</pre>
              <p className="text-xs text-[#70757a]">Demo only. Correcting or reassigning stays in this preview.</p>
              <label className="block text-sm">
                Amount
                <input value={amountDraft} onChange={(event) => setAmountDraft(event.target.value)} inputMode="decimal" className="mt-1 block h-10 w-28 rounded-md border border-[#dadce0] px-3" />
              </label>
              <button
                type="button"
                className="h-9 w-fit rounded-full border border-[#dadce0] px-3 text-sm"
                onClick={() => {
                  const amount = Number(amountDraft);
                  if (!Number.isFinite(amount) || amount < 0) {
                    setNotice("Enter a plain sample amount.");
                    return;
                  }
                  setReceipts((current) => correctReceiptAmount(current, openReceipt.id, amount));
                  setNotice("Sample amount updated on this same receipt.");
                }}
              >
                Update sample amount
              </button>
              <label className="block text-sm">
                Associated giveaway
                <select
                  aria-describedby="giveaway-association-help"
                  value={openReceipt.giveawayId}
                  onChange={(event) => {
                    const giveawayId = event.target.value;
                    setReceipts((current) => reassignReceipt(current, openReceipt.id, giveawayId));
                    setNotice("Sample association changed. Choosing a giveaway does not confirm an entry, and the receipt was not copied.");
                  }}
                  className="mt-1 block h-10 w-full rounded-md border border-[#dadce0] bg-white px-3"
                >
                  <optgroup label="Entered">
                    {groups.entered.length === 0 ? (
                      <option value="" disabled>
                        No confirmed entry. Save, Enter, autofill, or a receipt does not confirm one.
                      </option>
                    ) : (
                      groups.entered.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title} — entered
                        </option>
                      ))
                    )}
                  </optgroup>
                  <optgroup label="Saved — not entered">
                    {groups.saved.length === 0 ? (
                      <option value="" disabled>
                        Nothing is saved in this practice.
                      </option>
                    ) : (
                      groups.saved.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title} — saved, not entered
                        </option>
                      ))
                    )}
                  </optgroup>
                  <optgroup label="Not saved — not entered">
                    {groups.other.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title} — not saved, not entered
                      </option>
                    ))}
                  </optgroup>
                </select>
                <p id="giveaway-association-help" className="text-xs leading-5 text-[#70757a]">
                  Association does not confirm an entry.
                </p>
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="h-9 rounded-full border border-[#dadce0] px-3 text-sm" onClick={() => recordAgain(openReceipt)}>
                  Record this receipt again
                </button>
                <button
                  type="button"
                  className="h-9 rounded-full border border-[#dadce0] px-3 text-sm"
                  onClick={() => {
                    const blob = new Blob([readableReceipt(openReceipt)], { type: "text/plain" });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = "sample-receipt.txt";
                    link.click();
                    URL.revokeObjectURL(url);
                    setNotice("Sample text file downloaded. It was not fetched from mail.");
                  }}
                >
                  Download sample copy
                </button>
              </div>
              {confirmDelete ? (
                <p>
                  Remove this sample receipt?{" "}
                  <button
                    type="button"
                    className="text-[#1a0dab] underline"
                    onClick={() => {
                      setUndo(openReceipt);
                      setReceipts((current) => current.filter((item) => item.id !== openReceipt.id));
                      setOpenReceiptId(null);
                      setConfirmDelete(false);
                      setNotice("Sample receipt removed.");
                    }}
                  >
                    Remove sample
                  </button>{" "}
                  <button type="button" className="text-[#1a0dab] underline" onClick={() => setConfirmDelete(false)}>
                    Cancel
                  </button>
                </p>
              ) : (
                <button type="button" className="w-fit text-sm text-[#1a0dab] underline" onClick={() => setConfirmDelete(true)}>
                  Delete sample
                </button>
              )}
              <Button type="button" variant="outline" className="w-fit rounded-full" onClick={() => setOpenReceiptId(null)}>
                Close receipt
              </Button>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SectionButton({ open, onClick, controls, title, summary }: { open: boolean; onClick: () => void; controls: string; title: string; summary: string }) {
  return (
    <button type="button" className="w-full text-left text-xl text-[#202124]" aria-expanded={open} aria-controls={controls} onClick={onClick}>
      <span aria-hidden="true" className="mr-2 inline-block w-4 text-[#3c4043]">{open ? "▾" : "▸"}</span>
      {title}
      <span className="mt-1 block pl-6 text-sm font-normal text-[#70757a]">{summary}</span>
    </button>
  );
}

function MaskedField({
  label,
  shown,
  masked,
  value,
  onChange,
  onToggle,
}: {
  label: string;
  shown: boolean;
  masked: string;
  value: string;
  onChange: (value: string) => void;
  onToggle: () => void;
}) {
  return (
    <div className="mt-3">
      <span className="block">{label}</span>
      {shown ? (
        <input value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 block h-10 w-full rounded-md border border-[#dadce0] px-3" />
      ) : (
        <p className="mt-1 font-mono text-sm">{masked}</p>
      )}
      <button type="button" className="mt-1 text-[#1a0dab] underline" onClick={onToggle}>
        {shown ? "Hide sample value" : "Reveal sample value"}
      </button>
    </div>
  );
}
