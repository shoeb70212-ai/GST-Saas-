import { describe, expect, it } from 'vitest';
import {
  findOcrBoxesForValue,
  flaggedFieldSet,
  polygonToCssPercent,
} from './ocrHighlight';

describe('ocrHighlight', () => {
  it('normalizes polygon to css percent', () => {
    const box = polygonToCssPercent([0.1, 0.2, 0.4, 0.2, 0.4, 0.3, 0.1, 0.3], {
      normalized: true,
    });
    expect(box).not.toBeNull();
    expect(box!.left).toBeCloseTo(10);
    expect(box!.top).toBeCloseTo(20);
    expect(box!.width).toBeCloseTo(30);
    expect(box!.height).toBeCloseTo(10);
  });

  it('finds matching GSTIN word boxes', () => {
    const words = [
      { t: '27AAPFU0939F1ZV', p: 1, b: [0.1, 0.1, 0.5, 0.1, 0.5, 0.15, 0.1, 0.15], n: true },
      { t: 'INV-9', p: 1, b: [0.6, 0.1, 0.8, 0.1, 0.8, 0.15, 0.6, 0.15], n: true },
    ];
    const hits = findOcrBoxesForValue(words, '27AAPFU0939F1ZV');
    expect(hits).toHaveLength(1);
    expect(hits[0].text).toBe('27AAPFU0939F1ZV');
  });

  it('builds flagged field set', () => {
    const s = flaggedFieldSet([
      { code: 'tax_math', field: 'Total_Amount', message: 'x' },
      { code: 'low_confidence', field: null, message: 'y' },
    ]);
    expect(s.has('Total_Amount')).toBe(true);
    expect(s.size).toBe(1);
  });
});
