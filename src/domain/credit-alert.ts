export interface LowCreditNotice {
  remainingUsd: number;
  thresholdUsd: number;
  searchesLeft: number;
}

/** Sends nothing unless a notifier is configured. */
export interface CreditNotifier {
  notifyLowCredit(notice: LowCreditNotice): Promise<void>;
}

export function silentNotifier(): CreditNotifier {
  return { async notifyLowCredit() {} };
}

export function webhookNotifier(url: string, fetchImpl: typeof fetch = fetch): CreditNotifier {
  return {
    async notifyLowCredit(notice) {
      await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ event: "low_credit", ...notice }),
        signal: AbortSignal.timeout(8000),
      });
    },
  };
}

export function notifierFromEnv(webhookUrl: string | undefined, fetchImpl?: typeof fetch): CreditNotifier {
  const url = webhookUrl?.trim();
  if (!url) return silentNotifier();
  return webhookNotifier(url, fetchImpl);
}
