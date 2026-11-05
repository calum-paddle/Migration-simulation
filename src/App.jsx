import { useMemo, useState } from 'react'
import InputsPanel from './components/InputsPanel'
import StatsSummary from './components/StatsSummary'
import RevenueChart from './components/RevenueChart'
import { simulatePortfolio } from './simulation'
import './App.css'

const DEFAULT_INPUTS = {
  sellerName: '',
  currency: 'USD',
  growthPct: 0,
  aov: 50,
  plans: [{ id: 1, period: 'monthly', customLabel: '', sharePct: 100, lifespanMonths: 24 }],
  migrations: [
    {
      id: 1,
      previousProvider: '',
      gmv: 500000,
      migratablePct: 70,
      migrationDate: new Date(),
    },
  ],
  buyerLed: null,
}

export default function App() {
  const [inputs, setInputs] = useState(DEFAULT_INPUTS)

  const result = useMemo(
    () => simulatePortfolio({
      aov: inputs.aov,
      plans: inputs.plans,
      growthPct: inputs.growthPct,
      migrations: inputs.migrations,
      buyerLed: inputs.buyerLed,
    }),
    [inputs],
  )

  return (
    <>
      <header className="topbar">
        <div className="wordmark">
          <span className="wordmark-name">Solutions</span>
        </div>
      </header>
      <div className="app">
        <header className="app-header">
          <h1>Migration simulator</h1>
          <p className="app-subtitle">
            Model how revenue shifts from your previous provider to Paddle after migration.
          </p>
        </header>

        <main className="app-grid">
          <div className="app-sidebar">
            <InputsPanel
              inputs={inputs}
              onChange={setInputs}
              buyerLedPool={result.buyerLedPool}
            />
            <StatsSummary result={result} currency={inputs.currency} />
          </div>
          <div className="app-main">
            <RevenueChart
              result={result}
              currency={inputs.currency}
              title={inputs.sellerName}
            />
          </div>
        </main>
      </div>
    </>
  )
}
