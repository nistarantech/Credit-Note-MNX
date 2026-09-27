import { summarize, type Summary } from "./calc";
import { calcSettings, type CreditNote, type Data, type Party, type Sale } from "./store";

/** "2025-09-14" → "2025-09" */
export const monthOf = (date: string) => date.slice(0, 7);

export function monthLabel(key: string, style: "long" | "short" = "long") {
  if (!/^\d{4}-\d{2}$/.test(key)) return key;
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-IN", { month: style, year: "numeric" });
}

/** First and last day of a month, as yyyy-mm-dd. */
export function monthRange(key: string): [string, string] {
  const [y, m] = key.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return [`${key}-01`, `${key}-${String(last).padStart(2, "0")}`];
}

export function shiftMonth(key: string, by: number) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export const thisMonth = () => new Date().toISOString().slice(0, 7);

/** Every month that has a sale, newest first. */
export function salesMonths(sales: Sale[]) {
  return [...new Set(sales.map((s) => monthOf(s.date)).filter(Boolean))].sort().reverse();
}

export interface PartyMonth {
  party: Party;
  sales: Sale[]; // all of the party's sales dated in the month
  open: Sale[]; // those not yet settled
  notes: CreditNote[]; // notes that settled any of this month's sales
  pending: Summary; // the credit note the open sales would make
  total: Summary; // the month as a whole, settled or not
}

/** The month-end position of every party: what is settled, what is still due. */
export function monthEnd(d: Data, month: string): PartyMonth[] {
  return d.parties.map((party) => {
    const s = calcSettings(d.globals, party);
    const sales = d.sales.filter((x) => x.partyId === party.id && monthOf(x.date) === month);
    const open = sales.filter((x) => !x.noteId);
    const noteIds = new Set(sales.map((x) => x.noteId).filter(Boolean));
    return {
      party,
      sales,
      open,
      notes: d.notes.filter((n) => noteIds.has(n.id)),
      pending: summarize(open, s),
      total: summarize(sales, s),
    };
  });
}

/** What issueNote needs to settle `sales` for `party` as one credit note. */
export function notePayload(
  d: Data,
  party: Party,
  sales: Sale[],
  opts: { date: string; from: string; to: string; month: string | null; remarks: string },
): Omit<CreditNote, "id" | "number" | "createdAt"> {
  const settings = calcSettings(d.globals, party);
  return {
    ...opts,
    partyId: party.id,
    party,
    settings,
    lines: sales.map(({ partyId: _p, noteId: _n, ...l }) => l),
    total: summarize(sales, settings).totalCn,
  };
}
