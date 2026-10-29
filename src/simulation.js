// Core migration simulation math.
//
// Model summary:
// - GMV is the total monthly recurring subscription revenue before migration.
// - `migratablePct` of that GMV moves to Paddle instantly on the migration date.
//   The remainder stays with the previous provider and receives no new
//   business going forward (all new signups land on Paddle from day 0).
// - GMV can be split across plans (weekly, monthly, annual). The billing
//   period is a label. Each plan has its own average lifespan, and churn
//   for that slice is churnRate = 1 / lifespanMonths.
// - We assume the business was in steady state before migration (new
//   business inflow exactly offset churn). With no growth, total revenue
//   (Paddle + old provider combined) stays flat at GMV:
//
//     old(t)    = sum over plans of (1 - m) * planGMV * retention^t
//     paddle(t) = GMV - old(t)                   -> grows toward GMV
//
// - Optional annual growth applies only to new traffic, and only to the
//   amount above that flat replacement. The annual rate is converted to a
//   compound monthly rate, (1 + annual) ^ (1/12) - 1. The old-provider line
//   is unchanged. At 0% growth the extra is zero, so the curves match the
//   flat model.
//
// Exponential decay never lands on exactly $0, so the simulation runs until
// the old provider's revenue falls below 1% of the original GMV. That month
// is "fully migrated."

const FULLY_MIGRATED_FRACTION = 0.01
const MIN_HORIZON_MONTHS = 1
const MAX_HORIZON_MONTHS = 240 // safety cap (20 years)

/**
 * Monthly retention rate implied by an average subscriber lifespan.
 * @param {number} lifespanMonths
 */
export function retentionFromLifespan(lifespanMonths) {
  if (!lifespanMonths || lifespanMonths <= 0) return 0
  const churnRate = 1 / lifespanMonths
  return Math.max(0, 1 - churnRate)
}

/** Turn plan shares into weights that sum to 1. */
export function normalizedPlans(plans) {
  const source = Array.isArray(plans) && plans.length > 0
    ? plans
    : [{ sharePct: 100, lifespanMonths: 24 }]
  const totalShare = source.reduce((sum, plan) => sum + (Number(plan.sharePct) || 0), 0)

  return source.map((plan) => ({
    share: totalShare > 0 ? (Number(plan.sharePct) || 0) / totalShare : 1 / source.length,
    lifespanMonths: Number(plan.lifespanMonths) > 0 ? Number(plan.lifespanMonths) : 1,
  }))
}

/** Dollars of new traffic per month that exactly replace churn on the original book. */
export function monthlyReplacement(gmv, plans) {
  return normalizedPlans(plans).reduce(
    (sum, plan) => sum + (gmv * plan.share) / plan.lifespanMonths,
    0,
  )
}

/** Monthly compound rate equivalent to an annual growth percent. */
export function monthlyRateFromAnnual(growthPct) {
  const annual = Number(growthPct) / 100
  if (!annual) return 0
  return Math.pow(1 + annual, 1 / 12) - 1
}

/**
 * Extra Paddle revenue at month t from new traffic growing at `growthPct`
 * percent per year. Month k's intake is replacement * (1 + g)^k, where g is
 * the monthly equivalent of that annual rate. This returns only the
 * cumulative amount above the flat replacement already included in
 * `gmv - old(t)`.
 */
export function growthExtraAt(t, gmv, plans, growthPct) {
  const g = monthlyRateFromAnnual(growthPct)
  if (!t || t <= 0 || !g) return 0

  const base = monthlyReplacement(gmv, plans)
  const ratio = 1 + g
  if (base <= 0 || ratio <= 0) return 0

  const compounded = (ratio * (Math.pow(ratio, t) - 1)) / g
  return base * (compounded - t)
}

/** Old-provider revenue at month t, summed across plans. */
export function oldRevenueAt(t, gmv, migratablePct, plans) {
  const m = Math.min(1, Math.max(0, migratablePct / 100))
  return normalizedPlans(plans).reduce((sum, plan) => {
    const retention = retentionFromLifespan(plan.lifespanMonths)
    return sum + (1 - m) * gmv * plan.share * Math.pow(retention, t)
  }, 0)
}

/**
 * Number of whole months until the old provider's revenue falls below 1% of
 * the original GMV.
 */
export function computeHorizonMonths(gmv, migratablePct, plans) {
  const startingOld = oldRevenueAt(0, gmv, migratablePct, plans)
  if (gmv <= 0 || startingOld <= FULLY_MIGRATED_FRACTION * gmv) return MIN_HORIZON_MONTHS

  for (let t = 1; t <= MAX_HORIZON_MONTHS; t++) {
    if (oldRevenueAt(t, gmv, migratablePct, plans) <= FULLY_MIGRATED_FRACTION * gmv) return t
  }

  return MAX_HORIZON_MONTHS
}

/** Add `months` calendar months to a Date, returning a new Date. */
export function addMonths(date, months) {
  const result = new Date(date)
  result.setMonth(result.getMonth() + months)
  return result
}

/**
 * Run the full migration simulation.
 *
 * @param {Object} params
 * @param {number} params.gmv - Total monthly subscription GMV before migration.
 * @param {number} params.migratablePct - 0-100, % of GMV migrated instantly.
 * @param {number} params.aov - Average order value (used for subscriber counts).
 * @param {Array} params.plans - Plan slices of GMV, each with sharePct and lifespanMonths.
 * @param {number} params.growthPct - Annual % growth of new traffic above replacement. Paddle only.
 * @param {Date|string} params.migrationDate - Date the migration takes effect.
 */
export function simulate({ gmv, migratablePct, aov, plans, growthPct = 0, migrationDate }) {
  const m = Math.min(1, Math.max(0, migratablePct / 100))
  const horizonMonths = computeHorizonMonths(gmv, migratablePct, plans)
  const startDate = new Date(migrationDate)
  const segments = normalizedPlans(plans)

  const points = []
  for (let t = 0; t <= horizonMonths; t++) {
    const old = oldRevenueAt(t, gmv, migratablePct, plans)
    const paddle = Math.max(0, gmv - old + growthExtraAt(t, gmv, plans, growthPct))
    points.push({
      month: t,
      date: addMonths(startDate, t),
      old,
      paddle,
    })
  }

  const migratedGmv = m * gmv
  const retainedOldGmv = (1 - m) * gmv
  const monthlyChurnRate = segments.reduce(
    (sum, plan) => sum + plan.share / plan.lifespanMonths,
    0,
  )

  return {
    points,
    horizonMonths,
    migrationDate: startDate,
    fullyMigratedDate: addMonths(startDate, horizonMonths),
    gmv,
    migratedGmv,
    retainedOldGmv,
    migratedSubscribers: aov > 0 ? Math.round(migratedGmv / aov) : 0,
    totalSubscribers: aov > 0 ? Math.round(gmv / aov) : 0,
    monthlyChurnRate,
  }
}
