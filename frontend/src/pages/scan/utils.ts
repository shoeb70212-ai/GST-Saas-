export const safeNum = (val: unknown) => {
  if (val === "" || val === null || val === undefined) return null;
  const n = parseFloat(String(val));
  return isNaN(n) ? null : n;
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
