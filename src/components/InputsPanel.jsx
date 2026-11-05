import { useState } from 'react'
import { formatCompactCurrency, formatCurrency, formatDate } from '../utils/format'

const CURRENCIES = [
  { code: 'USD', symbol: '$' },
  { code: 'EUR', symbol: '€' },
  { code: 'GBP', symbol: '£' },
]

const PERIODS = [
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'annual', label: 'Annual' },
  { id: 'custom', label: 'Custom…' },
]

const DEFAULT_LIFESPAN = { weekly: 12, monthly: 24, annual: 36, custom: 24 }

function rebalanceShares(plans, id, nextShare) {
  const share = Math.min(100, Math.max(0, Math.round(Number(nextShare) || 0)))
  const others = plans.filter((plan) => plan.id !== id)
  if (others.length === 0) return plans.map((plan) => ({ ...plan, sharePct: 100 }))

  const otherSum = others.reduce((sum, plan) => sum + plan.sharePct, 0)
  const remaining = 100 - share
  const shares = new Map([[id, share]])
  let used = 0

  others.forEach((plan, index) => {
    if (index === others.length - 1) {
      shares.set(plan.id, remaining - used)
      return
    }
    const portion = otherSum === 0
      ? Math.floor(remaining / others.length)
      : Math.floor((plan.sharePct / otherSum) * remaining)
    used += portion
    shares.set(plan.id, portion)
  })

  return plans.map((plan) => ({ ...plan, sharePct: shares.get(plan.id) }))
}

function addPlan(plans) {
  const used = new Set(plans.map((plan) => plan.period))
  const period = PERIODS.map((item) => item.id).find((id) => id !== 'custom' && !used.has(id)) || 'monthly'
  const id = Math.max(0, ...plans.map((plan) => plan.id)) + 1
  const withNew = [
    ...plans,
    { id, period, customLabel: '', sharePct: 0, lifespanMonths: DEFAULT_LIFESPAN[period] },
  ]
  const openingShare = Math.max(1, Math.round(100 / (plans.length + 1)))
  return { plans: rebalanceShares(withNew, id, openingShare), id }
}

function removePlan(plans, id) {
  const remaining = plans.filter((plan) => plan.id !== id)
  if (remaining.length === 0) return plans
  if (remaining.length === 1) return [{ ...remaining[0], sharePct: 100 }]
  return rebalanceShares(remaining, remaining[0].id, remaining[0].sharePct)
}

function planTitle(plan) {
  if (plan.period === 'custom' && plan.customLabel?.trim()) return plan.customLabel.trim()
  return PERIODS.find((period) => period.id === plan.period)?.label ?? 'Plan'
}

function toDateInputValue(date) {
  const d = date instanceof Date ? date : new Date(date)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function latestMigrationDate(migrations) {
  return migrations.reduce((latest, migration) => {
    const date = new Date(migration.migrationDate)
    if (Number.isNaN(date.getTime())) return latest
    return !latest || date > latest ? date : latest
  }, null) || new Date()
}

function CurrencySelect({ value, onChange }) {
  return (
    <select
      className="currency-select"
      value={value}
      aria-label="Currency"
      onChange={(event) => onChange(event.target.value)}
    >
      {CURRENCIES.map((currency) => (
        <option key={currency.code} value={currency.code}>
          {currency.symbol}
        </option>
      ))}
    </select>
  )
}

function Fold({ open, title, summary, onToggle, onRemove, children }) {
  return (
    <div className={`fold${open ? '' : ' fold-collapsed'}`}>
      <div className="fold-header">
        <button
          type="button"
          className="fold-toggle"
          aria-expanded={open}
          onClick={onToggle}
        >
          <span className="plan-chevron" aria-hidden="true" />
          <span className="fold-title">{open ? title : summary}</span>
        </button>
        {onRemove && (
          <button type="button" className="plan-remove" onClick={onRemove} aria-label={`Remove ${title}`}>
            ×
          </button>
        )}
      </div>
      <div className={`slide${open ? ' slide-open' : ''}`}>
        <div className="slide-inner" {...(open ? {} : { inert: '' })}>
          <div className="fold-body">{children}</div>
        </div>
      </div>
    </div>
  )
}

function PlanCard({ plan, plans, gmv, currency, open, onToggle, updatePlan, updatePlans }) {
  const locked = plans.length === 1
  const sharePct = locked ? 100 : plan.sharePct

  return (
    <div className={`plan-card${open ? '' : ' plan-card-collapsed'}`}>
      <div className="plan-card-header">
        <button
          type="button"
          className="plan-toggle"
          aria-expanded={open}
          aria-label={`${open ? 'Collapse' : 'Expand'} ${planTitle(plan)}`}
          onClick={onToggle}
        >
          <span className="plan-chevron" aria-hidden="true" />
        </button>
        {open ? (
          <select
            value={plan.period}
            onChange={(event) => updatePlan(plan.id, { period: event.target.value })}
            aria-label="Plan type"
          >
            {PERIODS.map((period) => (
              <option key={period.id} value={period.id}>
                {period.label}
              </option>
            ))}
          </select>
        ) : (
          <button type="button" className="plan-collapsed-label" onClick={onToggle}>
            {planTitle(plan)} · {sharePct}% · {plan.lifespanMonths || 0} mo
          </button>
        )}
        {plans.length > 1 && (
          <button
            type="button"
            className="plan-remove"
            onClick={() => updatePlans(removePlan(plans, plan.id))}
            aria-label="Remove plan"
          >
            ×
          </button>
        )}
      </div>

      <div className={`slide${open ? ' slide-open' : ''}`}>
        <div className="slide-inner" {...(open ? {} : { inert: '' })}>
          <div className="plan-body">
          {plan.period === 'custom' && (
            <input
              type="text"
              className="plan-custom-label"
              placeholder="Plan name"
              value={plan.customLabel}
              onChange={(event) => updatePlan(plan.id, { customLabel: event.target.value })}
              aria-label="Custom plan name"
            />
          )}

          <label className="field">
            <span className="field-label">
              Share of GMV
              <strong className="field-value">
                {' '}
                {sharePct}% ({formatCurrency((gmv * sharePct) / 100, { currency })})
              </strong>
            </span>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={sharePct}
              disabled={locked}
              onChange={(event) => updatePlans(rebalanceShares(plans, plan.id, event.target.value))}
              className="slider"
              aria-label="Share of GMV"
            />
            <div className="slider-ticks">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </label>

          <label className="field">
            <span className="field-label">Average lifespan</span>
            <div className="input-with-suffix">
              <input
                type="number"
                min="1"
                step="1"
                value={plan.lifespanMonths}
                onChange={(event) => updatePlan(plan.id, {
                  lifespanMonths: event.target.value === '' ? '' : Number(event.target.value),
                })}
                aria-label="Average lifespan"
              />
              <span className="suffix">months</span>
            </div>
          </label>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function InputsPanel({ inputs, onChange, buyerLedPool = 0 }) {
  const { sellerName, currency, growthPct, aov, plans, migrations, buyerLed } = inputs
  const [openSection, setOpenSection] = useState(null)
  const [openPlanId, setOpenPlanId] = useState(null)
  const totalGmv = migrations.reduce((sum, migration) => sum + (Number(migration.gmv) || 0), 0)

  const setCurrency = (next) => onChange({ ...inputs, currency: next })
  const updatePlans = (nextPlans) => onChange({ ...inputs, plans: nextPlans })
  const updatePlan = (id, patch) => {
    updatePlans(plans.map((plan) => (plan.id === id ? { ...plan, ...patch } : plan)))
  }
  const updateMigration = (id, patch) => {
    onChange({
      ...inputs,
      migrations: migrations.map((migration) => (
        migration.id === id ? { ...migration, ...patch } : migration
      )),
    })
  }

  const toggleSection = (id) => {
    setOpenSection((current) => (current === id ? null : id))
  }

  const addMigration = () => {
    const id = Math.max(0, ...migrations.map((migration) => migration.id)) + 1
    onChange({
      ...inputs,
      migrations: [
        ...migrations,
        {
          id,
          previousProvider: '',
          gmv: 0,
          migratablePct: 70,
          migrationDate: new Date(),
        },
      ],
    })
    setOpenSection(id)
  }

  const removeMigration = (id) => {
    if (migrations.length <= 1) return
    onChange({
      ...inputs,
      migrations: migrations.filter((migration) => migration.id !== id),
    })
    setOpenSection((current) => (current === id ? null : current))
  }

  const generalSummary = [
    sellerName?.trim() || 'General',
    `${Math.round(Number(growthPct) || 0)}% / year`,
    formatCurrency(Number(aov) || 0, { currency }),
  ].join(' · ')

  return (
    <section className="panel inputs-panel">
      <h2>Inputs</h2>

      <Fold
        open={openSection === 'general'}
        title="General"
        summary={generalSummary}
        onToggle={() => toggleSection('general')}
      >
        <label className="field">
          <input
            type="text"
            placeholder="Seller name"
            value={sellerName}
            onChange={(event) => onChange({ ...inputs, sellerName: event.target.value })}
            aria-label="Seller name"
          />
        </label>

        <label className="field">
          <span className="field-label">
            Annual Growth Goal
            <strong className="field-value"> {Math.round(Number(growthPct) || 0)}% / year</strong>
          </span>
          <input
            type="range"
            min="0"
            max="300"
            step="1"
            value={growthPct}
            onChange={(event) => onChange({ ...inputs, growthPct: Number(event.target.value) })}
            className="slider"
            aria-label="Annual Growth Goal"
          />
          <div className="slider-ticks">
            <span>0%</span>
            <span>150%</span>
            <span>300%</span>
          </div>
        </label>

        <label className="field">
          <span className="field-label">Average order value</span>
          <div className="input-with-prefix">
            <CurrencySelect value={currency} onChange={setCurrency} />
            <input
              type="number"
              min="0"
              step="1"
              value={aov}
              onChange={(event) => onChange({
                ...inputs,
                aov: event.target.value === '' ? '' : Number(event.target.value),
              })}
            />
          </div>
        </label>

        <div className="field">
          <span className="field-label">Plans</span>
          <div className="plan-list">
            {plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                plans={plans}
                gmv={totalGmv}
                currency={currency}
                open={openPlanId === plan.id}
                onToggle={() => setOpenPlanId((current) => (current === plan.id ? null : plan.id))}
                updatePlan={updatePlan}
                updatePlans={updatePlans}
              />
            ))}
          </div>
          <button
            type="button"
            className="add-plan"
            onClick={() => {
              const next = addPlan(plans)
              updatePlans(next.plans)
              setOpenPlanId(next.id)
            }}
          >
            Add plan
          </button>
        </div>
      </Fold>

      {migrations.map((migration, index) => {
        const name = migration.previousProvider?.trim() || `Token migration ${index + 1}`
        const summary = [
          name,
          formatCompactCurrency(Number(migration.gmv) || 0, currency),
          `${Math.round(Number(migration.migratablePct) || 0)}%`,
          formatDate(migration.migrationDate),
        ].join(' · ')
        return (
          <Fold
            key={migration.id}
            open={openSection === migration.id}
            title={migrations.length > 1 ? `Token migration ${index + 1}` : 'Token migration'}
            summary={summary}
            onToggle={() => toggleSection(migration.id)}
            onRemove={migrations.length > 1 ? () => removeMigration(migration.id) : undefined}
          >
            <label className="field">
              <input
                type="text"
                placeholder="Stripe"
                value={migration.previousProvider}
                onChange={(event) => updateMigration(migration.id, { previousProvider: event.target.value })}
                aria-label="Previous provider"
              />
            </label>

            <label className="field">
              <span className="field-label">Total monthly GMV (subscriptions)</span>
              <div className="input-with-prefix">
                <CurrencySelect value={currency} onChange={setCurrency} />
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={migration.gmv}
                  onChange={(event) => updateMigration(migration.id, {
                    gmv: event.target.value === '' ? '' : Number(event.target.value),
                  })}
                />
              </div>
            </label>

            <label className="field">
              <span className="field-label">
                Migratable volume
                <strong className="field-value">
                  {' '}
                  {migration.migratablePct}% ({formatCurrency(
                    ((Number(migration.gmv) || 0) * (Number(migration.migratablePct) || 0)) / 100,
                    { currency },
                  )})
                </strong>
              </span>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={migration.migratablePct}
                onChange={(event) => updateMigration(migration.id, { migratablePct: Number(event.target.value) })}
                className="slider"
              />
              <div className="slider-ticks">
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
            </label>

            <label className="field">
              <span className="field-label">Migration date</span>
              <input
                type="date"
                value={toDateInputValue(migration.migrationDate)}
                onChange={(event) => updateMigration(migration.id, {
                  migrationDate: new Date(`${event.target.value}T00:00:00`),
                })}
              />
            </label>
          </Fold>
        )
      })}

      <button type="button" className="add-plan" onClick={addMigration}>
        Add token migration
      </button>

      {buyerLed ? (
        <Fold
          open={openSection === 'buyer'}
          title="Buyer-led migration"
          summary={`Buyer-led · ${Math.round(Number(buyerLed.successPct) || 0)}% of ${formatCompactCurrency(buyerLedPool, currency)} · ${buyerLed.months || 0} mo · ${formatDate(buyerLed.migrationDate || latestMigrationDate(migrations))}`}
          onToggle={() => toggleSection('buyer')}
          onRemove={() => {
            onChange({ ...inputs, buyerLed: null })
            setOpenSection((current) => (current === 'buyer' ? null : current))
          }}
        >
          <p className="field-label buyer-led-applied">
            Monthly GMV Remaining
            <strong className="field-value"> {formatCurrency(buyerLedPool, { currency })}</strong>
          </p>

          <label className="field">
            <span className="field-label">Migration date</span>
            <input
              type="date"
              value={toDateInputValue(buyerLed.migrationDate || latestMigrationDate(migrations))}
              onChange={(event) => onChange({
                ...inputs,
                buyerLed: {
                  ...buyerLed,
                  migrationDate: new Date(`${event.target.value}T00:00:00`),
                },
              })}
            />
          </label>

          <label className="field">
            <span className="field-label">
              Success rate
              <strong className="field-value"> {Math.round(Number(buyerLed.successPct) || 0)}%</strong>
            </span>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={buyerLed.successPct}
              onChange={(event) => onChange({
                ...inputs,
                buyerLed: { ...buyerLed, successPct: Number(event.target.value) },
              })}
              className="slider"
              aria-label="Buyer-led success rate"
            />
            <div className="slider-ticks">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </label>

          <label className="field">
            <span className="field-label">Months to complete</span>
            <div className="input-with-suffix">
              <input
                type="number"
                min="1"
                step="1"
                value={buyerLed.months}
                onChange={(event) => onChange({
                  ...inputs,
                  buyerLed: {
                    ...buyerLed,
                    months: event.target.value === '' ? '' : Number(event.target.value),
                  },
                })}
                aria-label="Months to complete"
              />
              <span className="suffix">months</span>
            </div>
          </label>
        </Fold>
      ) : (
        <button
          type="button"
          className="add-plan"
          onClick={() => {
            onChange({
              ...inputs,
              buyerLed: { successPct: 30, months: 3, migrationDate: null },
            })
            setOpenSection('buyer')
          }}
        >
          Add buyer-led migration
        </button>
      )}
    </section>
  )
}
