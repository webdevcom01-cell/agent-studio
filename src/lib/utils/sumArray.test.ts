import { describe, it, expect } from 'vitest';
import { sumArray } from './sumArray';

describe('sumArray', () => {
  it('returns 0 for an empty array', () => {
    expect(sumArray([])).toBe(0);
  });
  it('returns the sum for a typical array', () => {
    expect(sumArray([1, 2, 3, 4, 5])).toBe(15);
  });
  it('handles negative numbers', () => {
    expect(sumArray([-1, -2, -3, 4])).toBe(-2);
  });
  it('handles an array with zero', () => {
    expect(sumArray([0, 5, 10])).toBe(15);
  });
  it('handles a single element array', () => {
    expect(sumArray([42])).toBe(42);
  });
  it('handles large numbers', () => {
    expect(sumArray([1_000_000, 2_000_000, 3_000_000])).toBe(6_000_000);
  });
});
