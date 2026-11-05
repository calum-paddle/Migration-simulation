# Migration simulator

How the chart is calculated.

## Token migration

Each token is a book of monthly subscription GMV on a previous provider.

On that token's migration date, the migratable share moves to Paddle immediately. The rest stays with the previous provider and gets no new subscribers. Before that date, the whole GMV stays with the previous provider and does not decay.

Subscribers leave at a constant monthly rate of `1 / lifespan`. A 24-month lifespan is about 4.2% churn a month, so the retained slice is multiplied by `23/24` every month. Plans split that GMV. The billing period is only a label. Each plan's lifespan drives its own slice, and the summary's blended churn is the GMV-weighted average.

With no growth, Paddle plus the previous provider stays flat at the original GMV. Churn on the old book is refilled by new subscribers on Paddle:

```
old(t)    = retained GMV × retention^t
paddle(t) = GMV − old(t)
```

Average order value is not used for revenue. It only turns GMV into a subscriber count.

## Growth

Annual growth applies only to Paddle, and only to new traffic above the flat refill. 0% matches the flat model. The annual rate is turned into a compound monthly rate, `(1 + annual) ^ (1/12) − 1`. The previous-provider line is unchanged.

## Several tokens

Tokens share one plan mix, one growth rate, and one order value. Each is simulated on its own, then added up by calendar month. The chart starts at the earliest migration date.

The previous-provider line is the sum. If the providers have different names, that line is labeled "Previous providers". With two or more tokens, each provider can also be drawn as its own dashed line.

## Buyer-led migration

This asks the customers token migration did not take. They have to move themselves.

The pool for a token is the retained GMV still active when that token is asked. The campaign date defaults to the latest token migration, and it can be set earlier. A token joins the pool on the later of the campaign date and its own migration date, because the retained slice does not exist before then.

The success rate is the share of that pool that will eventually move. They do not move on day one. The response is front-loaded: most of those who will act do so soon after being asked. "Months to complete" is when about 90% of the eventual movers have moved. The default is 30% success over 3 months.

Anyone who churns before they act never moves. After someone moves, that monthly revenue is on Paddle and follows the same refill rules as the rest of the Paddle book. A success rate of 0% leaves the chart unchanged.

The summary's buyer-led target is `success rate × pool`. It is the volume the campaign is aimed at, not a single month's reading on the chart.

## Where the chart stops

The chart ends in the month the last token's previous-provider revenue falls to 1% of that token's original GMV. Growth is not part of the threshold. Buyer-led migration can only bring the date forward, because it shrinks what is left on the old provider.

## Summary figures

- **Moves to Paddle** is the migratable share of each token, added across tokens. It moves on each token's own date.
- **Stays with the previous provider** is the rest, before buyer-led responses.
- **Subscribers** divide those amounts by the average order value.
- **Fully migrated by** is the end of the chart, counted from the first migration date.
