/** Synthetic Profile fixtures. Not a saved identity, a mailbox, or a Fortress connection. */

export interface SampleGiveaway {
  id: string;
  title: string;
}

export const SAMPLE_GIVEAWAYS: SampleGiveaway[] = [
  { id: "demo-illustration-1", title: "Furniture collection — illustration only" },
  { id: "demo-illustration-2", title: "Desk lamp drawing — illustration only" },
  { id: "demo-illustration-3", title: "Bookshelf set — illustration only" },
  { id: "demo-illustration-4", title: "Side table — illustration only" },
  { id: "demo-illustration-5", title: "Reading chair — illustration only" },
  { id: "demo-illustration-6", title: "Floor cushion — illustration only" },
  { id: "chair", title: "Reading chair drawing — illustration only" },
  { id: "oak", title: "Oak table drawing — illustration only" },
  { id: "lamp", title: "Desk lamp drawing — illustration only" },
  { id: "truck", title: "Field truck drawing — illustration only" },
];

export function groupPracticeGiveaways(savedIds: readonly string[], enteredIds: readonly string[]) {
  return {
    entered: SAMPLE_GIVEAWAYS.filter((item) => enteredIds.includes(item.id)),
    saved: SAMPLE_GIVEAWAYS.filter((item) => savedIds.includes(item.id) && !enteredIds.includes(item.id)),
    other: SAMPLE_GIVEAWAYS.filter((item) => !savedIds.includes(item.id) && !enteredIds.includes(item.id)),
  };
}

export interface SampleReceipt {
  id: string;
  messageIds: string[];
  date: string;
  merchant: string;
  amount: number;
  giveawayId: string;
  body: string;
  attachmentName: string;
}

export interface IncomingReceipt {
  messageId: string;
  /** When set, this forward belongs to the transaction that already has that message. */
  sameAsMessageId?: string;
  date: string;
  merchant: string;
  amount: number;
  giveawayId: string;
  body: string;
  attachmentName: string;
}

export const SAMPLE_RECEIPTS: SampleReceipt[] = [
  {
    id: "r-market",
    messageIds: ["msg-market-1"],
    date: "12/20/2026",
    merchant: "Sample Market",
    amount: 24,
    giveawayId: "demo-illustration-3",
    body: "Thank you for a sample purchase of $24. This message is synthetic. It was not fetched from a mailbox.",
    attachmentName: "sample-receipt.pdf",
  },
  {
    id: "r-news",
    messageIds: ["msg-news-1"],
    date: "01/09/2027",
    merchant: "Sample Newsstand",
    amount: 6,
    giveawayId: "demo-illustration-2",
    body: "Sample purchase of $6. Synthetic copy only. No mail server was contacted.",
    attachmentName: "sample-newsstand.pdf",
  },
];

export function giveawayTitle(id: string): string {
  return SAMPLE_GIVEAWAYS.find((item) => item.id === id)?.title ?? "Not associated";
}

/** A repeated forward updates the same transaction. It does not add a second spend. */
export function recordReceipt(receipts: SampleReceipt[], incoming: IncomingReceipt): { receipts: SampleReceipt[]; added: boolean } {
  const existing = receipts.find((item) => item.messageIds.includes(incoming.messageId) || (incoming.sameAsMessageId ? item.messageIds.includes(incoming.sameAsMessageId) : false));
  if (!existing) {
    return {
      added: true,
      receipts: [
        ...receipts,
        {
          id: `r-${incoming.messageId}`,
          messageIds: [incoming.messageId],
          date: incoming.date,
          merchant: incoming.merchant,
          amount: incoming.amount,
          giveawayId: incoming.giveawayId,
          body: incoming.body,
          attachmentName: incoming.attachmentName,
        },
      ],
    };
  }
  return {
    added: false,
    receipts: receipts.map((item) =>
      item.id === existing.id && !item.messageIds.includes(incoming.messageId) ? { ...item, messageIds: [...item.messageIds, incoming.messageId] } : item,
    ),
  };
}

/** Reassignment changes which sample giveaway is linked. It does not copy the receipt. */
export function reassignReceipt(receipts: SampleReceipt[], id: string, giveawayId: string): SampleReceipt[] {
  return receipts.map((item) => (item.id === id ? { ...item, giveawayId } : item));
}

export function correctReceiptAmount(receipts: SampleReceipt[], id: string, amount: number): SampleReceipt[] {
  return receipts.map((item) => (item.id === id ? { ...item, amount } : item));
}

export function readableReceipt(receipt: SampleReceipt): string {
  const extra = receipt.messageIds.length > 1 ? "Forwarded again in this sample. Still one transaction and one spend." : "";
  return [
    "Prize Scout sample receipt",
    "Synthetic. Not fetched from a mailbox.",
    "",
    `Date: ${receipt.date}`,
    `Merchant: ${receipt.merchant}`,
    `Amount: $${receipt.amount}`,
    `Associated giveaway: ${giveawayTitle(receipt.giveawayId)}`,
    "",
    receipt.body,
    "",
    `Attachment: ${receipt.attachmentName}`,
    "Sample file name only. Nothing was downloaded from a mail service.",
    extra,
  ]
    .filter((line) => line !== "")
    .join("\n");
}
