import { useState } from 'react'
import { formatCurrency } from '../utils/format'

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
  return rebalanceShares(withNew, id, openingShare)
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

function PlanCard({ plan, plans, gmv, currency, updatePlan, updatePlans }) {
  const [open, setOpen] = useState(true)
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
          onClick={() => setOpen((current) => !current)}
        >
          <span className="plan-chevron" aria-hidden="true" />
        </button>
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

      {open ? (
        <>
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
        </>
      ) : (
        <p className="plan-summary">
          {sharePct}% of GMV · {plan.lifespanMonths || 0} months
        </p>
      )}
    </div>
  )
}

function toDateInputValue(date) {
  const d = date instanceof Date ? date : new Date(date)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function InputsPanel({ inputs, onChange }) {
  const { previousProvider, currency, gmv, migratablePct, growthPct, aov, plans, migrationDate } = inputs
  const setCurrency = (next) => onChange({ ...inputs, currency: next })

  const handleNumberChange = (key) => (e) => {
    const value = e.target.value === '' ? '' : Number(e.target.value)
    onChange({ ...inputs, [key]: value })
  }

  const handleDateChange = (e) => {
    onChange({ ...inputs, migrationDate: new Date(`${e.target.value}T00:00:00`) })
  }

  const updatePlans = (nextPlans) => onChange({ ...inputs, plans: nextPlans })

  const updatePlan = (id, patch) => {
    updatePlans(plans.map((plan) => (plan.id === id ? { ...plan, ...patch } : plan)))
  }

  return (
    <section className="panel inputs-panel">
      <h2>Inputs</h2>

      <label className="field">
        <span className="field-label">Previous provider</span>
        <input
          type="text"
          placeholder="Stripe"
          value={previousProvider}
          onChange={(event) => onChange({ ...inputs, previousProvider: event.target.value })}
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
            value={gmv}
            onChange={handleNumberChange('gmv')}
          />
        </div>
      </label>

      <label className="field">
        <span className="field-label">
          Migratable volume
          <strong className="field-value">
            {' '}
            {migratablePct}% ({formatCurrency((gmv * migratablePct) / 100, { currency })})
          </strong>
        </span>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={migratablePct}
          onChange={handleNumberChange('migratablePct')}
          className="slider"
        />
        <div className="slider-ticks">
          <span>0%</span>
          <span>50%</span>
          <span>100%</span>
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
              gmv={gmv}
              currency={currency}
              updatePlan={updatePlan}
              updatePlans={updatePlans}
            />
          ))}
        </div>
        <button type="button" className="add-plan" onClick={() => updatePlans(addPlan(plans))}>
          Add plan
        </button>
      </div>

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
          onChange={handleNumberChange('growthPct')}
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
            onChange={handleNumberChange('aov')}
          />
        </div>
      </label>

      <label className="field">
        <span className="field-label">Migration date</span>
        <input
          type="date"
          value={toDateInputValue(migrationDate)}
          onChange={handleDateChange}
        />
      </label>
    </section>
  )
}
