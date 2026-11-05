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
//
// Total monthly GMV is one number. Each token takes a share of it, and
// shares do not have to add up to 100%. On that token's date, its
// migratable share moves to Paddle. The rest of its share stays with that
// provider and decays. GMV no token claims stays with previous providers.
// The chart runs from the earliest migration until the last token falls
// under 1% of its own share.
//
// Buyer-led migration is the GMV no token actually takes: the unallocated
// remainder plus the non-migratable part of every share. Buyers are asked
// on the campaign date and respond over time, still churning while they
// decide. A success rate of 0% leaves the curves unchanged.

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
 * @param {number} params.subscriptions - Total subscriptions across the book. Migrated subscribers follow the migratable share of GMV.
 * @param {Array} params.plans - Plan slices of GMV, each with sharePct and lifespanMonths.
 * @param {number} params.growthPct - Annual % growth of new traffic above replacement. Paddle only.
 * @param {Date|string} params.migrationDate - Date the migration takes effect.
 */
export function simulate({ gmv, migratablePct, subscriptions = 0, plans, growthPct = 0, migrationDate }) {
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
    migratedSubscribers: subscriberCount(subscriptions, gmv, migratedGmv),
    totalSubscribers: Math.max(0, Math.round(amount(subscriptions))),
    monthlyChurnRate,
  }
}

function subscriberCount(subscriptions, gmv, sliceGmv) {
  const total = Math.max(0, Math.round(amount(subscriptions)))
  if (total === 0 || gmv <= 0) return 0
  return Math.round(total * (sliceGmv / gmv))
}

function amount(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/** Whole calendar months from `from` to `to`. */
export function monthsBetween(from, to) {
  const start = new Date(from)
  const end = new Date(to)
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())
}

export function providerKey(migration, index) {
  const name = String(migration?.previousProvider || '').trim()
  if (name) return `name:${name.toLowerCase()}`
  return `id:${migration?.id ?? index}`
}

export function providerSeriesLabel(migration, index) {
  const name = String(migration?.previousProvider || '').trim()
  return name || `Token migration ${index + 1}`
}

/**
 * Fraction of the asked cohort that has moved by `monthsAfterAsk`.
 * `monthsToComplete` is when about 90% of those who will ever move have done so.
 * The curve is front-loaded: 1 - e^(-u/τ).
 */
export function buyerLedConversion(monthsAfterAsk, successPct, monthsToComplete) {
  const elapsed = Number(monthsAfterAsk)
  const success = Math.min(1, Math.max(0, amount(successPct) / 100))
  const months = amount(monthsToComplete)
  if (elapsed <= 0 || success === 0 || months <= 0) return 0
  const tau = months / -Math.log(0.1)
  return success * (1 - Math.exp(-elapsed / tau))
}

function retainedOldAt(elapsed, book, offset, askOffset, successPct, monthsToComplete, plans) {
  const base = oldRevenueAt(elapsed, book.gmv, book.migratablePct, plans)
  const sinceAsk = offset + elapsed - askOffset
  if (sinceAsk <= 0) return base
  return base * (1 - buyerLedConversion(sinceAsk, successPct, monthsToComplete))
}

function unallocatedRemaining(monthsAfterAsk, unallocated, plans, successPct, monthsToComplete) {
  if (unallocated <= 0) return 0
  if (monthsAfterAsk < 0) return unallocated
  const base = oldRevenueAt(monthsAfterAsk, unallocated, 0, plans)
  return base * (1 - buyerLedConversion(monthsAfterAsk, successPct, monthsToComplete))
}

function horizonWithBuyerLed(book, offset, askOffset, successPct, monthsToComplete, plans) {
  const limit = FULLY_MIGRATED_FRACTION * book.gmv
  if (book.gmv <= 0 || oldRevenueAt(0, book.gmv, book.migratablePct, plans) <= limit) {
    return MIN_HORIZON_MONTHS
  }
  for (let elapsed = 1; elapsed <= MAX_HORIZON_MONTHS; elapsed++) {
    if (retainedOldAt(elapsed, book, offset, askOffset, successPct, monthsToComplete, plans) <= limit) {
      return elapsed
    }
  }
  return MAX_HORIZON_MONTHS
}

/**
 * One total GMV, split by each token's share. A token claims
 * share × migratable of that total on its migration date. Whatever no
 * token claims, including the non-migratable slice of each share, is the
 * buyer-led pool. That remainder stays with previous providers until the
 * campaign, which peels it off with the same front-loaded curve.
 */
export function simulatePortfolio({ gmv: totalInput = 0, subscriptions = 0, plans, growthPct = 0, migrations, buyerLed = null }) {
  const totalGmv = Math.max(0, amount(totalInput))
  const source = Array.isArray(migrations) && migrations.length > 0
    ? migrations
    : [{ id: 1, previousProvider: '', sharePct: 0, migratablePct: 0, migrationDate: new Date() }]

  const books = source.map((migration, index) => {
    const sharePct = Math.min(100, Math.max(0, amount(migration.sharePct)))
    const gmv = totalGmv * sharePct / 100
    const migratablePct = amount(migration.migratablePct)
    const parsed = new Date(migration.migrationDate)
    const migrationDate = Number.isNaN(parsed.getTime()) ? new Date() : parsed
    return {
      previousProvider: migration.previousProvider,
      index,
      sharePct,
      gmv,
      migratablePct,
      migrationDate,
      key: providerKey(migration, index),
      label: providerSeriesLabel(migration, index),
    }
  })

  const startDate = books.reduce(
    (earliest, book) => (book.migrationDate < earliest ? book.migrationDate : earliest),
    books[0].migrationDate,
  )
  const latestDate = books.reduce(
    (latest, book) => (book.migrationDate > latest ? book.migrationDate : latest),
    books[0].migrationDate,
  )

  const campaignDate = buyerLed
    ? new Date(buyerLed.migrationDate || latestDate)
    : null
  const safeCampaign = campaignDate && !Number.isNaN(campaignDate.getTime()) ? campaignDate : latestDate
  const successPct = buyerLed ? amount(buyerLed.successPct) : 0
  const monthsToComplete = buyerLed ? amount(buyerLed.months) : 0
  const campaignOffset = buyerLed ? monthsBetween(startDate, safeCampaign) : 0

  const scheduled = books.map((book) => {
    const offset = Math.max(0, monthsBetween(startDate, book.migrationDate))
    const askOffset = buyerLed ? Math.max(campaignOffset, offset) : offset
    return {
      ...book,
      offset,
      askOffset,
      horizonMonths: buyerLed
        ? horizonWithBuyerLed(book, offset, askOffset, successPct, monthsToComplete, plans)
        : computeHorizonMonths(book.gmv, book.migratablePct, plans),
    }
  })

  const claimedGmv = scheduled.reduce((sum, book) => sum + book.gmv, 0)
  const unallocated = Math.max(0, totalGmv - claimedGmv)

  let lastMonth = scheduled.reduce(
    (max, book) => Math.max(max, book.offset + book.horizonMonths),
    0,
  )
  if (buyerLed && unallocated > 0) {
    const limit = FULLY_MIGRATED_FRACTION * totalGmv
    const campaignStart = Math.max(0, campaignOffset)
    for (let elapsed = 0; elapsed <= MAX_HORIZON_MONTHS; elapsed++) {
      const remaining = unallocatedRemaining(elapsed, unallocated, plans, successPct, monthsToComplete)
      if (remaining <= limit) {
        lastMonth = Math.max(lastMonth, Math.min(MAX_HORIZON_MONTHS, campaignStart + elapsed))
        break
      }
    }
  }

  const providers = []
  const seen = new Set()
  scheduled.forEach((book) => {
    if (seen.has(book.key)) return
    seen.add(book.key)
    providers.push({ key: book.key, label: book.label })
  })

  const points = []
  for (let t = 0; t <= lastMonth; t++) {
    let old = 0
    let paddle = 0
    const byProvider = {}
    providers.forEach((provider) => {
      byProvider[provider.key] = 0
    })

    scheduled.forEach((book) => {
      const elapsed = t - book.offset
      const bookOld = elapsed < 0
        ? book.gmv
        : retainedOldAt(elapsed, book, book.offset, book.askOffset, successPct, monthsToComplete, plans)
      const bookPaddle = elapsed < 0
        ? 0
        : Math.max(0, book.gmv - bookOld + growthExtraAt(elapsed, book.gmv, plans, growthPct))
      old += bookOld
      paddle += bookPaddle
      byProvider[book.key] += bookOld
    })

    const unallocatedOld = buyerLed
      ? unallocatedRemaining(t - campaignOffset, unallocated, plans, successPct, monthsToComplete)
      : unallocated
    old += unallocatedOld
    paddle += unallocated - unallocatedOld

    points.push({
      month: t,
      date: addMonths(startDate, t),
      old,
      paddle,
      byProvider,
    })
  }

  const gmv = totalGmv
  const migratedGmv = scheduled.reduce((sum, book) => {
    const share = Math.min(1, Math.max(0, book.migratablePct / 100))
    return sum + share * book.gmv
  }, 0)
  const segments = normalizedPlans(plans)
  const monthlyChurnRate = segments.reduce(
    (sum, plan) => sum + plan.share / plan.lifespanMonths,
    0,
  )
  const contributing = scheduled.filter((book) => book.gmv > 0)
  const labelSource = contributing.length > 0 ? contributing : [scheduled[0]]
  const names = labelSource.map((book) => String(book.previousProvider || '').trim())
  const uniqueNames = [...new Set(names.filter(Boolean).map((name) => name.toLowerCase()))]
  const sharedName = uniqueNames.length === 1 && names.every(Boolean) ? names.find(Boolean) : ''

  const marks = []
  labelSource.forEach((book) => {
    const time = addMonths(startDate, book.offset).getTime()
    const existing = marks.find((mark) => mark.time === time)
    if (existing) {
      if (!existing.labels.includes(book.label)) existing.labels.push(book.label)
      return
    }
    marks.push({ time, labels: [book.label] })
  })

  let buyerLedPool = 0
  if (buyerLed) {
    buyerLedPool = Math.max(0, totalGmv - migratedGmv)
    const campaignTime = addMonths(startDate, Math.max(0, campaignOffset)).getTime()
    const existing = marks.find((mark) => mark.time === campaignTime)
    if (existing) existing.labels.push('Buyer-led')
    else marks.push({ time: campaignTime, labels: ['Buyer-led'] })
  }

  return {
    points,
    providers,
    marks: marks.map((mark) => {
      const names = mark.labels.filter((label) => label !== 'Buyer-led')
      const tokenLabel = names.length === 0
        ? ''
        : (labelSource.length === 1 ? 'Migration' : names.join(', '))
      const label = [tokenLabel, mark.labels.includes('Buyer-led') ? 'Buyer-led' : ''].filter(Boolean).join(', ')
      return { time: mark.time, label }
    }),
    horizonMonths: lastMonth,
    migrationDate: startDate,
    fullyMigratedDate: addMonths(startDate, lastMonth),
    gmv,
    migratedGmv,
    retainedOldGmv: gmv - migratedGmv,
    migratedSubscribers: subscriberCount(subscriptions, gmv, migratedGmv),
    totalSubscribers: Math.max(0, Math.round(amount(subscriptions))),
    monthlyChurnRate,
    providerLabel: labelSource.length <= 1 ? (names[0] || 'Previous provider') : (sharedName || 'Previous providers'),
    stayLabel: labelSource.length <= 1 ? (names[0] || 'old provider') : (sharedName || 'previous providers'),
    buyerLedEnabled: Boolean(buyerLed),
    buyerLedPool,
    buyerLedTarget: buyerLedPool * Math.min(1, Math.max(0, successPct / 100)),
    buyerLedDate: buyerLed ? addMonths(startDate, Math.max(0, campaignOffset)) : null,
  }
}
