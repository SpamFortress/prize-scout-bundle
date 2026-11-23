"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function AddonPairingToken() {
  const [token, setToken] = useState("");
  const [masked, setMasked] = useState(false);
  const [revealed, setRevealed] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [ownerToken, setOwnerToken] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let stop = false;
    fetch("/api/addon/token")
      .then((response) => response.json())
      .then((body: { token?: string }) => {
        if (!stop && body.token) setToken(body.token);
      })
      .catch(() => undefined);
    return () => {
      stop = true;
    };
  }, []);

  async function rotate() {
    setError("");
    const response = await fetch("/api/owner/pairing-token", {
      method: "POST",
      headers: { "content-type": "application/json", "x-owner-token": ownerToken },
    });
    setOwnerToken("");
    const body = (await response.json().catch(() => null)) as { token?: string } | null;
    if (!response.ok || !body?.token) {
      setError("The pairing token was not changed.");
      return;
    }
    setToken("");
    setMasked(true);
    setRevealed(body.token);
    setConfirming(false);
  }

  async function copyToken() {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(revealed);
    } catch {
      setError("The token could not be copied.");
      return;
    }
    setRevealed("");
  }

  return (
    <div className="mt-4 text-sm leading-6 text-[#3c4043]">
      <p>Add-on pairing token</p>
      <code data-addon-token className="mt-1 block break-all rounded-md bg-[#f8f9fa] px-3 py-2 text-xs">
        {masked ? "••••••••" : token || "Loading…"}
      </code>
      <p>Paste this into the Prize Scout extension. Other websites cannot read it.</p>
      {revealed ? (
        <div className="mt-3 rounded-md border border-[#dadce0] p-3">
          <p>New pairing token. Copy it now. It is hidden after you copy it.</p>
          <code data-new-pairing-token className="mt-1 block break-all rounded-md bg-[#f8f9fa] px-3 py-2 text-xs">
            {revealed}
          </code>
          <Button type="button" variant="outline" className="mt-2 rounded-full" onClick={() => void copyToken()}>
            Copy
          </Button>
        </div>
      ) : null}
      {confirming ? (
        <div data-pairing-confirm className="mt-3 rounded-md border border-[#dadce0] p-3">
          <p>The add-on will need re-pairing</p>
          <label className="mt-2 block text-xs">
            Owner token
            <input
              type="password"
              autoComplete="off"
              value={ownerToken}
              onChange={(event) => setOwnerToken(event.target.value)}
              className="mt-1 block h-9 w-full rounded-md border border-[#dadce0] px-2"
            />
          </label>
          <div className="mt-2 flex gap-2">
            <Button type="button" className="rounded-full" onClick={() => void rotate()}>
              Create new token
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => {
                setConfirming(false);
                setOwnerToken("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="outline" className="mt-3 rounded-full" onClick={() => setConfirming(true)}>
          New pairing token
        </Button>
      )}
      {error ? <p className="mt-2 text-sm text-[#202124]">{error}</p> : null}
    </div>
  );
}
