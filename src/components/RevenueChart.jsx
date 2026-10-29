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
  const total = payload.reduce((sum, entry) => sum + (entry.value || 0), 0)
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-date">{formatDate(label)}</p>
      {payload.map((entry) => (
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

export default function RevenueChart({ result, providerName, currency }) {
  const { points, migrationDate, gmv } = result
  const providerLabel = providerName?.trim() || 'Previous provider'

  const data = points.map((p) => ({
    date: p.date.getTime(),
    old: Math.round(p.old),
    paddle: Math.round(p.paddle),
  }))

  // Round the top up to a 1/2/5 step so every label is a clean number.
  // A round monthly GMV, such as $500K, still lands exactly on the top tick.
  // Guide lines stay pinned to the original GMV.
  const peak = data.reduce((max, point) => Math.max(max, point.old, point.paddle), 0)
  const { yMax, yTicks } = roundedAxis(Math.max(gmv, peak))

  return (
    <section className="panel chart-panel">
      <div className="chart-heading">
        <h2>Revenue over time</h2>
      </div>
      <div className="chart-wrapper">
        <ResponsiveContainer width="100%" height={420}>
          <LineChart data={data} margin={{ top: 8, right: 48, left: 0, bottom: 4 }}>
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
            <ReferenceLine
              x={migrationDate.getTime()}
              stroke="#cc903d"
              strokeDasharray="4 4"
              label={{ value: 'Migration', position: 'insideTopLeft', fill: '#cc903d', fontSize: 12 }}
            />
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
              name={providerLabel}
              stroke="#7e765d"
              strokeWidth={2.5}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
