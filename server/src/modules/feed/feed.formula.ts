const GRAVITY = 1.5;
const BOOST_HOURS = 2;
const MS_PER_HOUR = 3_600_000;
const FRESHNESS_BOOST = 1;

/**
 * Gravity-based decay ranking formula (Hacker News-style, modified).
 *
 * ```
 * score = (likeCount + FRESHNESS_BOOST) / (hoursSinceUpload + 2) ^ 1.5
 * ```
 *
 * Properties:
 * - Fresh photos start with a non-zero score that decays naturally,
 *   giving them visibility before they earn likes
 * - Popular photos rank higher (numerator proportional to likes)
 * - No eternal winners (polynomial time decay)
 * - The +2 prevents division-by-zero and gives a 2-hour "boost window"
 * - FRESHNESS_BOOST acts as an implicit "first like" for every photo
 */
export function calculateFeedScore(
  likeCount: number,
  createdAt: Date,
  now: Date = new Date()
): number {
  const hoursSinceUpload = Math.max(0, (now.getTime() - createdAt.getTime()) / MS_PER_HOUR);
  const denominator = (hoursSinceUpload + BOOST_HOURS) ** GRAVITY;
  return (likeCount + FRESHNESS_BOOST) / denominator;
}
