import { calculateFeedScore } from './feed.formula';

describe('calculateFeedScore', () => {
  // Fixed reference time for deterministic tests
  const now = new Date('2025-06-01T12:00:00Z');

  function hoursAgo(hours: number): Date {
    return new Date(now.getTime() - hours * 3_600_000);
  }

  it('matches worked example A: 50 likes, 1 hour ago', () => {
    const score = calculateFeedScore(50, hoursAgo(1), now);
    // 50 / 3^1.5 = 50 / 5.196 ≈ 9.62
    expect(score).toBeCloseTo(9.62, 1);
  });

  it('matches worked example B: 200 likes, 12 hours ago', () => {
    const score = calculateFeedScore(200, hoursAgo(12), now);
    // 200 / 14^1.5 = 200 / 52.38 ≈ 3.82
    expect(score).toBeCloseTo(3.82, 1);
  });

  it('matches worked example C: 5 likes, 10 min ago', () => {
    const score = calculateFeedScore(5, hoursAgo(10 / 60), now);
    // 5 / 2.17^1.5 = 5 / 3.20 ≈ 1.56
    expect(score).toBeCloseTo(1.56, 1);
  });

  it('matches worked example D: 1000 likes, 3 days (72 hours) ago', () => {
    const score = calculateFeedScore(1000, hoursAgo(72), now);
    // 1000 / 74^1.5 = 1000 / 636.9 ≈ 1.57
    expect(score).toBeCloseTo(1.57, 1);
  });

  it('matches worked example E: 3000 likes, 14 days (336 hours) ago', () => {
    const score = calculateFeedScore(3000, hoursAgo(336), now);
    // 3000 / 338^1.5 = 3000 / 6214 ≈ 0.48
    expect(score).toBeCloseTo(0.48, 1);
  });

  it('produces correct ranking order from worked examples', () => {
    const scores = {
      A: calculateFeedScore(50, hoursAgo(1), now),
      B: calculateFeedScore(200, hoursAgo(12), now),
      C: calculateFeedScore(5, hoursAgo(10 / 60), now),
      D: calculateFeedScore(1000, hoursAgo(72), now),
      E: calculateFeedScore(3000, hoursAgo(336), now),
    };

    // Expected order: A > B > D > C > E
    expect(scores.A).toBeGreaterThan(scores.B);
    expect(scores.B).toBeGreaterThan(scores.D);
    expect(scores.D).toBeGreaterThan(scores.C);
    expect(scores.C).toBeGreaterThan(scores.E);
  });

  it('returns 0 for photos with 0 likes', () => {
    const score = calculateFeedScore(0, hoursAgo(5), now);
    expect(score).toBe(0);
  });

  it('handles photos created just now (0 hours)', () => {
    const score = calculateFeedScore(1, now, now);
    // 1 / 2^1.5 = 1 / 2.828 ≈ 0.354
    expect(score).toBeCloseTo(0.354, 2);
  });

  it('handles future createdAt gracefully (clamps to 0 hours)', () => {
    const futureDate = new Date(now.getTime() + 3_600_000);
    const score = calculateFeedScore(1, futureDate, now);
    // Same as 0 hours: 1 / 2^1.5
    expect(score).toBeCloseTo(0.354, 2);
  });
});
