# Sensitivity of the constraint-aware Arbiter (30 seeds, rule-based agents)

Cells are mean ± half-width of the 95% interval. Violation rate is the share of weeks in which the real books breach a constraint.

## baseline

| Variant | Violation rate | Stock-out units | Operating profit (Rs) | Min cash (Rs) |
|---|---|---|---|---|
| default | 0.03 ± 0.02 | 798 ± 133 | 5,26,353 | 5,28,732 |
| stress margin 2 weeks | 0.03 ± 0.02 | 1774 ± 359 | 37,327 | 5,97,532 |
| stress margin 4 weeks | 0.03 ± 0.02 | 1935 ± 492 | -43,406 | 5,78,382 |
| liquidity weight 1.0 | 0.03 ± 0.02 | 894 ± 131 | 4,78,580 | 5,98,072 |
| liquidity weight 1.0 + target Rs 10 lakh | 0.02 ± 0.02 | 1012 ± 195 | 4,19,795 | 7,24,042 |

## delayed receivable

| Variant | Violation rate | Stock-out units | Operating profit (Rs) | Min cash (Rs) |
|---|---|---|---|---|
| default | 0.14 ± 0.05 | 798 ± 133 | 5,24,373 | -31,736 |
| stress margin 2 weeks | 0.08 ± 0.04 | 1774 ± 359 | 37,012 | 2,98,714 |
| stress margin 4 weeks | 0.08 ± 0.03 | 1941 ± 495 | -46,738 | 3,12,696 |
| liquidity weight 1.0 | 0.14 ± 0.05 | 894 ± 131 | 4,76,864 | 35,135 |
| liquidity weight 1.0 + target Rs 10 lakh | 0.09 ± 0.04 | 1012 ± 195 | 4,19,354 | 3,07,980 |

## supplier price spike

| Variant | Violation rate | Stock-out units | Operating profit (Rs) | Min cash (Rs) |
|---|---|---|---|---|
| default | 0.03 ± 0.02 | 817 ± 139 | 5,17,140 | 5,18,728 |
| stress margin 2 weeks | 0.02 ± 0.01 | 2089 ± 523 | -1,19,986 | 5,72,784 |
| stress margin 4 weeks | 0.02 ± 0.01 | 2240 ± 607 | -1,95,598 | 5,83,566 |
| liquidity weight 1.0 | 0.04 ± 0.02 | 946 ± 126 | 4,52,551 | 5,95,734 |
| liquidity weight 1.0 + target Rs 10 lakh | 0.02 ± 0.02 | 1111 ± 236 | 3,70,171 | 7,42,532 |

## demand surge

| Variant | Violation rate | Stock-out units | Operating profit (Rs) | Min cash (Rs) |
|---|---|---|---|---|
| default | 0.04 ± 0.02 | 2358 ± 222 | 9,59,429 | 4,29,694 |
| stress margin 2 weeks | 0.02 ± 0.02 | 3972 ± 582 | 1,51,609 | 6,33,800 |
| stress margin 4 weeks | 0.01 ± 0.01 | 4108 ± 677 | 83,427 | 6,15,263 |
| liquidity weight 1.0 | 0.04 ± 0.03 | 2620 ± 217 | 8,28,235 | 5,26,324 |
| liquidity weight 1.0 + target Rs 10 lakh | 0.02 ± 0.02 | 2899 ± 313 | 6,89,146 | 7,04,810 |

## credit limit tightened

| Variant | Violation rate | Stock-out units | Operating profit (Rs) | Min cash (Rs) |
|---|---|---|---|---|
| default | 0.03 ± 0.02 | 798 ± 133 | 5,26,353 | 5,28,732 |
| stress margin 2 weeks | 0.03 ± 0.02 | 1774 ± 359 | 37,327 | 5,97,532 |
| stress margin 4 weeks | 0.03 ± 0.02 | 1935 ± 492 | -43,406 | 5,78,382 |
| liquidity weight 1.0 | 0.03 ± 0.02 | 894 ± 131 | 4,78,580 | 5,98,072 |
| liquidity weight 1.0 + target Rs 10 lakh | 0.02 ± 0.02 | 1012 ± 195 | 4,19,795 | 7,24,042 |
