export const safeNum = (val: unknown) => {
  if (val === "" || val === null || val === undefined) return null;
  const n = parseFloat(String(val).replace(/,/g, ""));
  return isNaN(n) ? null : n;
};

/** Clamp money to Postgres NUMERIC(18,2) — prevents "numeric field overflow" on save. */
const MONEY_ABS_MAX = 1e16; // comfortably under NUMERIC(18,2)

export const safeMoney = (val: unknown): number | null => {
  const n = safeNum(val);
  if (n === null) return null;
  if (!Number.isFinite(n) || Math.abs(n) >= MONEY_ABS_MAX) return null;
  return Math.round(n * 100) / 100;
};

/** Confidence is stored as NUMERIC(5,2) — accept 0–1 or 0–100. */
export const safeConfidence = (val: unknown): number | null => {
  const n = safeNum(val);
  if (n === null) return null;
  const pct = n > 0 && n <= 1 ? n * 100 : n;
  if (pct < 0 || pct > 100) return Math.max(0, Math.min(100, pct));
  return Math.round(pct * 100) / 100;
};

export function formatDateToIso(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const s = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const match1 = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (match1) {
    const [, d, m, y] = match1;
    return `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
  }

  const match2 = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (match2) {
    const [, y, m, d] = match2;
    return `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
  }

  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }

  return null;
}
