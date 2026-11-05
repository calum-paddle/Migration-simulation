import { useState } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatCompactCurrency, formatCurrency, formatDate, formatPercent } from '../utils/format'

const CHART_HEIGHT = 420
const CHART_MARGIN = { top: 8, right: 16, left: 0, bottom: 4 }
const PROVIDER_COLORS = ['#3f6f6a', '#8d4e3b', '#3d5a80', '#7a5b8a', '#6b7c3a', '#9a6b2f']

/** Snap a positive value onto a 1/2/5 × 10^n step. */
function niceNum(value, round) {
  const exponent = Math.floor(Math.log10(value))
  const fraction = value / 10 ** exponent
  let niceFraction
  if (round) {
    if (fraction < 1.5) niceFraction = 1
    else if (fraction < 3) niceFraction = 2
    else if (fraction < 7) niceFraction = 5
    else niceFraction = 10
  } else if (fraction <= 1) niceFraction = 1
  else if (fraction <= 2) niceFraction = 2
  else if (fraction <= 5) niceFraction = 5
  else niceFraction = 10
  return niceFraction * 10 ** exponent
}

/** Axis top and ticks on round 1/2/5 steps, never below `maxValue`. */
function roundedAxis(maxValue) {
  if (!(maxValue > 0)) return { yMax: 1, yTicks: [0, 1] }
  const range = niceNum(maxValue, false)
  const step = niceNum(range / 4, true)
  const count = Math.ceil(maxValue / step - 1e-9)
  const yTicks = Array.from({ length: count + 1 }, (_, index) => Math.round(index * step))
  return { yMax: yTicks[yTicks.length - 1], yTicks }
}

function CustomTooltip({ active, payload, label, currency }) {
  if (!active || !payload?.length) return null
  const rows = payload.filter((entry) => entry.color !== 'transparent')
  const main = rows.filter((entry) => entry.dataKey === 'paddle' || entry.dataKey === 'old')
  const extras = rows.filter((entry) => entry.dataKey !== 'paddle' && entry.dataKey !== 'old')
  const total = main.reduce((sum, entry) => sum + (entry.value || 0), 0)
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-date">{formatDate(label)}</p>
      {[...main, ...extras].map((entry) => (
        <p key={entry.dataKey} style={{ color: entry.color }}>
          {entry.name}: {formatCurrency(entry.value, { currency })}
          {total > 0 && (
            <span className="chart-tooltip-share">
              {' '}
              ({formatPercent(entry.value / total, { maximumFractionDigits: 0 })})
            </span>
          )}
        </p>
      ))}
    </div>
  )
}

export default function RevenueChart({ result, currency, title }) {
  const { points, migrationDate, gmv, providers = [], marks = [], providerLabel } = result
  const [shown, setShown] = useState({})
  const showProviders = providers.length > 1
  const heading = title?.trim() || 'Revenue over time'

  const data = points.map((point) => ({
    date: point.date.getTime(),
    old: Math.round(point.old),
    paddle: Math.round(point.paddle),
    ...Object.fromEntries(
      Object.entries(point.byProvider || {}).map(([key, value]) => [key, Math.round(value)]),
    ),
  }))

  const peak = data.reduce((max, point) => Math.max(max, point.old, point.paddle), 0)
  const { yMax, yTicks } = roundedAxis(Math.max(gmv, peak))
  const referenceMarks = marks.length > 0
    ? marks
    : [{ time: migrationDate.getTime(), label: 'Migration' }]

  return (
    <section className="panel chart-panel">
      <div className="chart-heading">
        <h2>{heading}</h2>
      </div>
      <div className="chart-wrapper">
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <LineChart data={data} margin={CHART_MARGIN}>
            <CartesianGrid stroke="#ebe7df" vertical={false} />
            <XAxis
              dataKey="date"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={formatDate}
              stroke="#ebe7df"
              tick={{ fill: '#7e765d', fontSize: 12 }}
              tickMargin={8}
              padding={{ left: 8, right: 16 }}
            />
            <YAxis
              domain={[0, yMax]}
              ticks={yTicks}
              tickFormatter={(value) => formatCompactCurrency(value, currency)}
              stroke="#ebe7df"
              tick={{ fill: '#7e765d', fontSize: 12 }}
              width={70}
            />
            <Tooltip content={<CustomTooltip currency={currency} />} />
            <Legend
              verticalAlign="bottom"
              align="left"
              wrapperStyle={{ fontSize: 13, color: '#1c1a15', paddingTop: 12 }}
            />
            {referenceMarks.map((mark, index) => {
              const row = referenceMarks.slice(0, index).reduce((count, earlier) => {
                const gapMonths = (mark.time - earlier.time) / (1000 * 60 * 60 * 24 * 30.44)
                const close = gapMonths < Math.max(8, (result.horizonMonths || 1) * 0.1)
                return close ? count + 1 : count
              }, 0)
              return (
                <ReferenceLine
                  key={mark.time}
                  x={mark.time}
                  stroke="#cc903d"
                  strokeDasharray="4 4"
                  label={({ viewBox }) => (
                    <text
                      x={(viewBox?.x ?? 0) + 6}
                      y={(viewBox?.y ?? 0) + 14 + row * 14}
                      fill="#cc903d"
                      fontSize={12}
                    >
                      {mark.label}
                    </text>
                  )}
                />
              )
            })}
            <Line
              type="monotone"
              dataKey="paddle"
              name="Paddle"
              stroke="#ffd400"
              strokeWidth={2.5}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="old"
              name={providerLabel || 'Previous provider'}
              stroke="#7e765d"
              strokeWidth={2.5}
              dot={false}
            />
            {showProviders && providers.map((provider, index) => (
              <Line
                key={provider.key}
                type="monotone"
                dataKey={provider.key}
                name={provider.label}
                stroke={shown[provider.key] ? PROVIDER_COLORS[index % PROVIDER_COLORS.length] : 'transparent'}
                strokeDasharray="5 4"
                strokeWidth={1.75}
                dot={false}
                legendType="none"
                activeDot={shown[provider.key] ? undefined : false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
        {showProviders && (
          <div className="chart-provider-toggles">
            {providers.map((provider, index) => {
              const color = PROVIDER_COLORS[index % PROVIDER_COLORS.length]
              return (
                <label key={provider.key}>
                  <input
                    type="checkbox"
                    checked={Boolean(shown[provider.key])}
                    onChange={() => setShown((current) => ({
                      ...current,
                      [provider.key]: !current[provider.key],
                    }))}
                  />
                  <span className="provider-swatch" style={{ borderTopColor: color }} />
                  {provider.label}
                </label>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
