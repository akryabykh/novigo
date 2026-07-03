import { describe, expect, test } from '@jest/globals';
import { equalWeights, redistributeWeights } from '../core/logic';

const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 10) / 10;

describe('equalWeights sums to exactly 100 (tenths of a percent)', () => {
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    test(`n=${n}`, () => {
      const w = equalWeights(n);
      expect(w).toHaveLength(n);
      expect(sum(w)).toBe(100);
      // every share is within one tenth of the ideal equal split
      for (const x of w) expect(Math.abs(x - 100 / n)).toBeLessThanOrEqual(0.1 + 1e-9);
    });
  }

  test('the awkward cases (3, 6, 7, 9) are exact', () => {
    expect(sum(equalWeights(3))).toBe(100);
    expect(sum(equalWeights(6))).toBe(100);
    expect(sum(equalWeights(7))).toBe(100);
    expect(sum(equalWeights(9))).toBe(100);
  });

  test('n<=0 → empty', () => {
    expect(equalWeights(0)).toEqual([]);
  });
});

describe('redistributeWeights spreads freed weight, still sums to 100', () => {
  test('two remaining, keeps rough proportions', () => {
    const w = redistributeWeights([50, 30], 20); // freed 20 across 2
    expect(sum(w)).toBe(100);
    expect(w[0]).toBeGreaterThan(w[1]); // 50-share stays the larger
  });

  test('three remaining after deleting one of four', () => {
    const w = redistributeWeights([25, 25, 25], 25);
    expect(sum(w)).toBe(100);
    expect(w).toHaveLength(3);
  });

  test('single remaining absorbs everything → 100', () => {
    expect(redistributeWeights([60], 40)).toEqual([100]);
  });

  test('empty → empty', () => {
    expect(redistributeWeights([], 100)).toEqual([]);
  });
});
