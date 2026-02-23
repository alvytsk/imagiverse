const GRAVITY = 1.5;
const BOOST_HOURS = 2;
const MS_PER_HOUR = 3_600_000;

/**
 * Gravity-based decay ranking formula (Hacker News-style, modified).
 *
 * ```
 * score = likeCount / (hoursSinceUpload + 2) ^ 1.5
 * ```
 *
 * Properties:
 * - New photos surface quickly (denominator starts at 2^1.5 ≈ 2.83)
 * - Popular photos rank higher (numerator proportional to likes)
 * - No eternal winners (polynomial time decay)
 * - The +2 prevents division-by-zero and gives a 2-hour "boost window"
 */
export function calculateFeedScore(
  likeCount: number,
  createdAt: Date,
  now: Date = new Date()
): number {
  const hoursSinceUpload = Math.max(0, (now.getTime() - createdAt.getTime()) / MS_PER_HOUR);
  const denominator = (hoursSinceUpload + BOOST_HOURS) ** GRAVITY;
  return likeCount / denominator;
}
