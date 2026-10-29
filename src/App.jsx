import { useMemo, useState } from 'react'
import InputsPanel from './components/InputsPanel'
import StatsSummary from './components/StatsSummary'
import RevenueChart from './components/RevenueChart'
import { simulate } from './simulation'
import './App.css'

const DEFAULT_INPUTS = {
  previousProvider: '',
  currency: 'USD',
  gmv: 500000,
  migratablePct: 70,
  growthPct: 0,
  aov: 50,
  migrationDate: new Date(),
  plans: [{ id: 1, period: 'monthly', customLabel: '', sharePct: 100, lifespanMonths: 24 }],
}

export default function App() {
  const [inputs, setInputs] = useState(DEFAULT_INPUTS)

  const result = useMemo(() => {
    const gmv = Number(inputs.gmv) || 0
    const aov = Number(inputs.aov) || 0
    const migratablePct = Number(inputs.migratablePct) || 0
    const growthPct = Number(inputs.growthPct) || 0

    return simulate({
      gmv,
      migratablePct,
      aov,
      plans: inputs.plans,
      growthPct,
      migrationDate: inputs.migrationDate,
    })
  }, [inputs])

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
            <InputsPanel inputs={inputs} onChange={setInputs} />
            <StatsSummary
              result={result}
              providerName={inputs.previousProvider}
              currency={inputs.currency}
            />
          </div>
          <div className="app-main">
            <RevenueChart
              result={result}
              providerName={inputs.previousProvider}
              currency={inputs.currency}
            />
          </div>
        </main>
      </div>
    </>
  )
}
