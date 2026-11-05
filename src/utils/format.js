const CURRENCIES = ['USD', 'EUR', 'GBP']

function currencyCode(currency) {
  return CURRENCIES.includes(currency) ? currency : 'USD'
}

export function formatCurrency(value, { maximumFractionDigits = 0, minimumFractionDigits, currency = 'USD' } = {}) {
  const amount = Number.isFinite(value) ? value : 0
  const options = {
    style: 'currency',
    currency: currencyCode(currency),
    maximumFractionDigits,
  }
  if (minimumFractionDigits != null) options.minimumFractionDigits = minimumFractionDigits
  return new Intl.NumberFormat('en-US', options).format(amount)
}

export function formatCompactCurrency(value, currency = 'USD') {
  const amount = Number.isFinite(value) ? value : 0
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode(currency),
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(amount)
}

export function formatDate(date) {
  if (!date) return ''
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
  }).format(date instanceof Date ? date : new Date(date))
}

export function formatNumber(value) {
  if (!Number.isFinite(value)) return '0'
  return new Intl.NumberFormat('en-US').format(value)
}

export function formatPercent(value, { maximumFractionDigits = 1 } = {}) {
  if (!Number.isFinite(value)) return '0%'
  return `${(value * 100).toFixed(maximumFractionDigits)}%`
}
