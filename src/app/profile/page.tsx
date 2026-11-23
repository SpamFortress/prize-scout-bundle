"use client";

import { useState } from "react";
import { FORTRESS_CHAT_ASK } from "@/domain/chat";
import {
  describeFortressDraft,
  FORTRESS_DRAFT_BUTTON,
  FORTRESS_DRAFT_EXPLAIN,
  FORTRESS_DRAFT_READY,
  IDENTITY_CHAT_LABEL,
  IDENTITY_REMOVAL_ASK,
  IDENTITY_REMOVAL_GUIDANCE,
} from "@/domain/fortress";
import { COUNTRIES, US_STATES } from "@/domain/geo";
import { profileIsNotSaved } from "@/domain/profile";
import { CHAT_URL } from "@/domain/types";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AddonPairingToken } from "@/components/addon-pairing-token";
import { CleanupRow } from "@/components/cleanup-row";
import { useScout } from "@/components/scout-provider";
import { cn } from "@/lib/utils";

export default function ProfilePage() {
  const scout = useScout();
  const [personalDraft, setPersonalDraft] = useState("");
  const [dedicatedDraft, setDedicatedDraft] = useState(scout.profile.dedicatedEmail ?? "");
  const unsaved = profileIsNotSaved();
  const countries = Object.entries(COUNTRIES).sort((a, b) => a[1].localeCompare(b[1]));
  const states = Object.entries(US_STATES).sort((a, b) => a[1].localeCompare(b[1]));

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-3xl font-normal text-[#202124]">Profile</h1>
      <AddonPairingToken />
      <p className="mt-2 text-sm text-[#70757a]">{unsaved.reason}</p>
      {scout.notice ? <p className="mt-4 text-sm">{scout.notice}</p> : null}
      <form className="mt-6 space-y-5" onSubmit={(event) => event.preventDefault()}>
        <label className="block text-sm">
          Country for eligibility
          <select
            aria-label="Country"
            className="mt-1 h-11 w-full rounded-full border border-[#dfe1e5] bg-white px-4"
            value={scout.profile.country ?? ""}
            onChange={(event) => scout.patchProfile({ country: event.target.value || null })}
          >
            <option value="">Not entered</option>
            {countries.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </label>
        {scout.profile.country === "US" ? (
          <label className="block text-sm">
            State
            <select
              aria-label="State"
              className="mt-1 h-11 w-full rounded-full border border-[#dfe1e5] bg-white px-4"
              value={scout.profile.state ?? ""}
              onChange={(event) => scout.patchProfile({ state: event.target.value || null })}
            >
              <option value="">Not entered</option>
              {states.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="block text-sm">
          Age
          <Input
            inputMode="numeric"
            aria-label="Age"
            className="mt-1 h-11 rounded-full px-4"
            value={scout.profile.age ?? ""}
            onChange={(event) => {
              const raw = event.target.value.trim();
              scout.patchProfile({ age: raw === "" ? null : Number(raw) });
            }}
          />
        </label>
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Email</legend>
          <Label className="items-start gap-2 font-normal">
            <input
              type="radio"
              name="email-mode"
              checked={scout.profile.emailMode === "dedicated"}
              onChange={() => scout.patchProfile({ emailMode: "dedicated" })}
            />
            Dedicated address you already use
          </Label>
          {scout.profile.emailMode === "dedicated" ? (
            <Input
              aria-label="Dedicated email"
              autoComplete="off"
              className="h-11 rounded-full px-4"
              value={dedicatedDraft}
              placeholder="name@example.com"
              onChange={(event) => setDedicatedDraft(event.target.value)}
              onBlur={() =>
                scout.patchProfile({ dedicatedEmail: dedicatedDraft.trim() === "" ? null : dedicatedDraft.trim() })
              }
            />
          ) : null}
          <Label className="items-start gap-2 font-normal">
            <input
              type="radio"
              name="email-mode"
              checked={scout.profile.emailMode === "personal"}
              onChange={() => scout.patchProfile({ emailMode: "personal" })}
            />
            Personal address from your vault, typed only to fill a sponsor form
          </Label>
          {scout.profile.emailMode === "personal" ? (
            <div>
              <p className="mb-2 text-sm text-[#70757a]">
                This field is not saved. Ask chat for the vault address, then type it when you are filling the sponsor&apos;s form.
              </p>
              <Input
                aria-label="Personal email draft"
                autoComplete="off"
                className="h-11 rounded-full px-4"
                value={personalDraft}
                onChange={(event) => setPersonalDraft(event.target.value)}
              />
            </div>
          ) : null}
          <Label className="items-start gap-2 font-normal text-[#70757a]">
            <input type="radio" name="email-mode" disabled checked={false} />
            Email Fortress — not connected
          </Label>
        </fieldset>
        <div className="rounded-2xl border border-[#dfe1e5] p-4">
          <p className="text-sm text-[#4d5156]">{FORTRESS_DRAFT_EXPLAIN}</p>
          <Button
            type="button"
            variant="outline"
            className="mt-3 rounded-full"
            onClick={() => scout.prepareFortressDraft()}
          >
            {scout.profile.fortressDraftPrepared ? FORTRESS_DRAFT_READY : FORTRESS_DRAFT_BUTTON}
          </Button>
          {scout.fortress ? <p className="mt-3 text-sm">{describeFortressDraft(scout.fortress)}</p> : null}
          <p className="mt-3 text-sm text-[#202124]">{FORTRESS_CHAT_ASK}</p>
          <a href={CHAT_URL} className={cn(buttonVariants({ variant: "outline" }), "mt-3 inline-flex rounded-full")}>
            Return to Prize Scout chat
          </a>
          <CleanupRow />
          <p className="mt-4 text-sm text-[#4d5156]">{IDENTITY_REMOVAL_GUIDANCE}</p>
          <p className="mt-3 text-sm text-[#202124]">{IDENTITY_REMOVAL_ASK}</p>
          <a href={CHAT_URL} className="mt-3 inline-flex text-sm text-[#1a0dab] hover:underline">
            {IDENTITY_CHAT_LABEL}
          </a>
        </div>
      </form>
    </main>
  );
}
