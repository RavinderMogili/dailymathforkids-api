import { jest, describe, it, expect } from '@jest/globals';

// ── Pure scoring logic (extracted from submit.js) ──
function calcPoints(score, outOf) {
  let pts = score;
  if (outOf > 0 && score === outOf) pts += 3;
  return pts;
}

function compareAnswer(given, expected) {
  const got = String(given ?? '').trim().toLowerCase();
  const exp = String(expected ?? '').trim().toLowerCase();
  return got === exp || (
    !isNaN(parseFloat(got)) && !isNaN(parseFloat(exp)) && parseFloat(got) === parseFloat(exp)
  );
}

// ── Tests ──
describe('calcPoints', () => {
  it('gives raw score when not perfect', () => {
    expect(calcPoints(3, 5)).toBe(3);
  });
  it('gives raw score + 3 bonus for perfect', () => {
    expect(calcPoints(5, 5)).toBe(8);
  });
  it('gives 0 for 0 score', () => {
    expect(calcPoints(0, 5)).toBe(0);
  });
  it('gives bonus for 1/1 perfect', () => {
    expect(calcPoints(1, 1)).toBe(4);
  });
  it('handles outOf=0 edge case', () => {
    expect(calcPoints(0, 0)).toBe(0);
  });
});

describe('compareAnswer', () => {
  it('matches exact text', () => {
    expect(compareAnswer('42', '42')).toBe(true);
  });
  it('is case-insensitive', () => {
    expect(compareAnswer('Hello', 'hello')).toBe(true);
  });
  it('trims whitespace', () => {
    expect(compareAnswer('  42 ', '42')).toBe(true);
  });
  it('compares numbers by value (int vs float)', () => {
    expect(compareAnswer('5', '5.0')).toBe(true);
  });
  it('compares decimal numbers', () => {
    expect(compareAnswer('3.14', '3.14')).toBe(true);
  });
  it('rejects wrong answer', () => {
    expect(compareAnswer('42', '43')).toBe(false);
  });
  it('rejects empty vs non-empty', () => {
    expect(compareAnswer('', '42')).toBe(false);
  });
  it('handles null/undefined gracefully', () => {
    expect(compareAnswer(null, '42')).toBe(false);
    expect(compareAnswer(undefined, '42')).toBe(false);
  });
  it('matches text answers like "6x"', () => {
    expect(compareAnswer('6x', '6x')).toBe(true);
  });
  it('rejects similar but wrong text', () => {
    expect(compareAnswer('6x', '3x')).toBe(false);
  });
  it('matches √3/2 style answers', () => {
    expect(compareAnswer('√3/2', '√3/2')).toBe(true);
  });
  it('matches (4, 6) style answers', () => {
    expect(compareAnswer('(4, 6)', '(4, 6)')).toBe(true);
  });
});
