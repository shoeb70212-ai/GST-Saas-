/**
 * Phase C — match extracted field values to OCR word boxes for preview highlight.
 * Word payload shape from backend: { t, p, c?, b?: number[], n?: boolean }
 */

export type OcrWordBox = {
  t: string;
  p: number;
  c?: number;
  /** Polygon [x1,y1,x2,y2,...] — normalized 0–1 when n===true */
  b?: number[];
  n?: boolean;
};

export type ReviewReason = {
  code: string;
  field?: string | null;
  message: string;
  severity?: 'error' | 'warning' | 'info';
  detail?: unknown;
};

function norm(s: string): string {
  return s.replace(/[\s\-_/]/g, '').toUpperCase();
}

/** Axis-aligned rect from polygon, as CSS % (left, top, width, height). */
export function polygonToCssPercent(
  poly: number[],
  opts?: { pageWidth?: number; pageHeight?: number; normalized?: boolean }
): { left: number; top: number; width: number; height: number } | null {
  if (!poly || poly.length < 4) return null;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < poly.length; i += 2) {
    let x = poly[i];
    let y = poly[i + 1];
    if (x == null || y == null) continue;
    if (!opts?.normalized && opts?.pageWidth && opts?.pageHeight) {
      x = x / opts.pageWidth;
      y = y / opts.pageHeight;
    }
    // Already 0–1, or treat raw as fraction if all ≤ 1.5
    xs.push(x);
    ys.push(y);
  }
  if (!xs.length) return null;
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  // If values look like inches/pixels (>>1), refuse without dims
  if (!opts?.normalized && maxX > 1.5 && !opts?.pageWidth) return null;
  const left = Math.max(0, Math.min(100, minX * 100));
  const top = Math.max(0, Math.min(100, minY * 100));
  const width = Math.max(0.2, Math.min(100 - left, (maxX - minX) * 100));
  const height = Math.max(0.2, Math.min(100 - top, (maxY - minY) * 100));
  return { left, top, width, height };
}

/**
 * Find OCR words whose text appears in / matches the field value.
 * Returns boxes suitable for overlay (may be empty).
 */
export function findOcrBoxesForValue(
  words: OcrWordBox[] | undefined | null,
  value: unknown,
  opts?: { pageWidth?: number; pageHeight?: number }
): Array<{ left: number; top: number; width: number; height: number; text: string }> {
  if (!words?.length || value == null || value === '') return [];
  const needle = norm(String(value));
  if (needle.length < 2) return [];

  const hits: Array<{ left: number; top: number; width: number; height: number; text: string }> = [];
  for (const w of words) {
    if (!w.b || !w.t) continue;
    const hay = norm(w.t);
    if (!hay) continue;
    const match =
      hay === needle ||
      (needle.length >= 3 && hay.includes(needle)) ||
      (hay.length >= 3 && needle.includes(hay));
    if (!match) continue;
    const box = polygonToCssPercent(w.b, {
      normalized: w.n === true,
      pageWidth: opts?.pageWidth,
      pageHeight: opts?.pageHeight,
    });
    if (box) hits.push({ ...box, text: w.t });
  }
  return hits;
}

export function flaggedFieldSet(reasons: ReviewReason[] | undefined | null): Set<string> {
  const s = new Set<string>();
  for (const r of reasons || []) {
    if (r.field) s.add(r.field);
  }
  return s;
}
