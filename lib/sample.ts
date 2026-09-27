// A few real rows from NIKHIL.xlsx (AW'25EOSS) to try the app with.
import { uid, type Line } from "./calc";

type S = [string, string, string, string, string, string, "DISC" | "FRESH", number, number, number, number | null];
const ROWS: S[] = [
  ["2025-09-01", "5284", "8909125117209", "Mens", "Trouser", "SS25", "DISC", 0.5, 2199, 1, null],
  ["2025-09-01", "5295", "8909125055877", "Mens", "Shirt", "SS25", "DISC", 0.5, 1799, 1, null],
  ["2025-09-02", "5307", "8905600997427", "Mens", "Shirt", "AW24", "DISC", 0.5, 1599, 1, null],
  ["2025-09-04", "5352", "8905600997854", "Mens", "Shirt", "AW24", "DISC", 0.5, 2399, 1, null],
  ["2025-09-06", "5367", "8905600686550", "Mens", "Tshirt", "SS24", "DISC", 0.5, 899, 1, 599.3633],
  ["2025-09-08", "5408", "8907606779175", "Boy", "Shirt", "AW19", "FRESH", 0, 1499, -1, null],
  ["2025-09-10", "5427", "8909125203780", "Mens", "Denim", "SS25", "DISC", 0.5, 2899, 1, null],
  ["2025-09-16", "5442", "8909125471653", "Mens", "Denim", "AW25", "FRESH", 0, 2999, 1, null],
  ["2025-09-22", "5577", "8909125364443", "Mens", "Shirt", "AW25", "FRESH", 0.0625, 1999, 1, null],
  ["2025-09-28", "5722", "8909125477303", "Mens", "Denim", "AW25", "FRESH", 0, 2999, 1, null],
  ["2025-10-04", "5912", "8909125552970", "Boy", "Tshirt", "AW25", "FRESH", 0, 899, 1, 599.3633],
  ["2025-10-12", "6130", "8909125247098", "Boy", "Tshirt", "CFAW25", "FRESH", 0.0625, 1049, 1, 699.3683],
];

export function sampleLines(): Line[] {
  return ROWS.map(([date, billNo, barcode, division, department, ageing, type, disc, mrp, qty, wsp]) => ({
    id: uid(), date, billNo, barcode, division, department, ageing, type, disc, mrp, qty, wsp, gstB2B: null,
  }));
}

/** The brand in NIKHIL.xlsx (Crimsoune Club, AW'25) with the sample rows, for a first look. */
export const SAMPLE_BRAND = {
  name: "Crimsoune Club",
  code: "CC",
  dealName: "30/20/10",
  season: "AW'25",
  applicability: "AW'25 onwards",
  conditions: "1000 pcs / season",
  firstSeason: "AW23",
  dispatch: { qty: 38, mrp: 87362, wsp: 55367.73, gst: 5785.94 },
};
