# Migration simulator

How the chart is calculated.

## Token migration

Total monthly GMV is one number, set in General. Each token takes a share of it. Shares do not have to add up to 100%.

On that token's migration date, its migratable share of its own slice moves to Paddle immediately. A 70% share with 70% migratable takes 49% of the total. The rest of that token's slice stays with the previous provider and gets no new subscribers. Before that date, the whole slice stays with the previous provider and does not decay. GMV no token claims stays with previous providers.

Subscribers leave at a constant monthly rate of `1 / lifespan`. A 24-month lifespan is about 4.2% churn a month, so the retained slice is multiplied by `23/24` every month. Plans split that GMV. The billing period is only a label. Each plan's lifespan drives its own slice, and the summary's blended churn is the GMV-weighted average.

With no growth, Paddle plus the previous provider stays flat at the original GMV. Churn on the old book is refilled by new subscribers on Paddle:

```
old(t)    = retained GMV × retention^t
paddle(t) = GMV − old(t)
```

The subscription count is optional and is not used for revenue. When it is set, migrated subscribers are that count times the share of total GMV that token migrations actually take. Average order value is total GMV divided by the subscription count, rounded to the nearest dollar.

## Growth

Annual growth applies only to Paddle, and only to new traffic above the flat refill. 0% matches the flat model. The annual rate is turned into a compound monthly rate, `(1 + annual) ^ (1/12) − 1`. The previous-provider line is unchanged.

## Several tokens

Tokens share one plan mix, one growth rate, and one subscription count. Each is simulated on its own, then added up by calendar month. The chart starts at the earliest migration date.

The previous-provider line is the sum. If the providers have different names, that line is labeled "Previous providers". With two or more tokens, each provider can also be drawn as its own dashed line.

## Buyer-led migration

This asks the customers token migration did not take. They have to move themselves.

The pool is total GMV minus what the tokens actually take. That is the GMV no token was given, plus the non-migratable part of every token's share. The box shows this as Monthly GMV Remaining. The campaign date defaults to the latest token migration, and it can be set earlier. A token's own leftover only joins once that token has migrated. Unallocated GMV is available from the campaign date.

The success rate is the share of that pool that will eventually move. They do not move on day one. The response is front-loaded: most of those who will act do so soon after being asked. "Months to complete" is when about 90% of the eventual movers have moved. The default is 30% success over 3 months.

Anyone who churns before they act never moves. After someone moves, that monthly revenue is on Paddle and follows the same refill rules as the rest of the Paddle book. A success rate of 0% leaves the chart unchanged.

The summary's buyer-led target is `success rate × pool`. It is the volume the campaign is aimed at, not a single month's reading on the chart.

## Where the chart stops

The chart ends in the month the last token's previous-provider revenue falls to 1% of that token's original GMV. Growth is not part of the threshold. Buyer-led migration can only bring the date forward, because it shrinks what is left on the old provider.

## Summary figures

- **Moves to Paddle** is what the tokens actually take, `share × migratable` of total GMV, added across tokens. It moves on each token's own date.
- **Stays with the previous provider** is the rest. That is the buyer-led pool, before anyone responds.
- **Subscribers** appear when a subscription count is entered. The migrated count is that number times the share of GMV that moves to Paddle.
- **Fully migrated by** is the end of the chart, counted from the first migration date.
