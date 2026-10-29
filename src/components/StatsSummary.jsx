import { formatCurrency, formatDate, formatNumber, formatPercent } from '../utils/format'

export default function StatsSummary({ result, providerName, currency }) {
  const {
    migratedGmv,
    retainedOldGmv,
    migratedSubscribers,
    totalSubscribers,
    monthlyChurnRate,
    fullyMigratedDate,
    horizonMonths,
  } = result

  const providerLabel = providerName?.trim() || 'old provider'
  const stats = [
    { label: 'Migrated on day 0', value: formatCurrency(migratedGmv, { currency }) },
    { label: `Stays with ${providerLabel}`, value: formatCurrency(retainedOldGmv, { currency }) },
    {
      label: 'Subscribers migrated',
      value: `${formatNumber(migratedSubscribers)} / ${formatNumber(totalSubscribers)}`,
    },
    { label: 'Blended monthly churn', value: formatPercent(monthlyChurnRate) },
    {
      label: 'Fully migrated by',
      value: `${formatDate(fullyMigratedDate)} (${horizonMonths} mo)`,
      wide: true,
    },
  ]

  return (
    <section className="panel stats-summary">
      <h2>Summary</h2>
      <dl className="stats-grid">
        {stats.map((stat) => (
          <div className={stat.wide ? 'stat stat-wide' : 'stat'} key={stat.label}>
            <dt>{stat.label}</dt>
            <dd>{stat.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
