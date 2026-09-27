import { summarize } from "./calc";
import { calcSettings, type Data, type Party } from "./store";

/** Sales not yet settled in a credit note, and what they are worth. */
export function partyStats(d: Data, p: Party) {
  const sales = d.sales.filter((s) => s.partyId === p.id);
  const open = sales.filter((s) => !s.noteId);
  const pending = summarize(open, calcSettings(d.globals, p));
  const notes = d.notes.filter((n) => n.partyId === p.id);
  return {
    sales,
    open,
    pending,
    notes,
    issued: notes.reduce((a, n) => a + n.total, 0),
  };
}
