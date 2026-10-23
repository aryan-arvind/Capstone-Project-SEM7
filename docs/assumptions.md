# Modelling assumptions

Everything here is a modelling choice for an illustrative auto-components MSME (about Rs 6 crore of
turnover a year). None of it is measured data. Every number lives in `msme/config/params.json`, and the
effect of each action in `msme/actions.mjs`; change them and the results change.

## The company (per week, in rupees)

| Item | Value |
|---|---|
| Price / landed unit cost | Rs 1,200 / Rs 700 per unit |
| Expected demand | 1,150 units a week (seasonal amplitude 8%, noise sd 12%) |
| Payroll + fixed costs | Rs 3.2 lakh + Rs 1.8 lakh |
| Customers | all sales on credit, 4 weeks, paid 0-2 weeks late (random) |
| Suppliers | 6 weeks of credit; 60% of supplier invoices are to MSME suppliers |
| Reorder lead time / warehouse | 2 weeks / 6,000 units |
| Overdraft | Rs 25 lakh limit at 14% a year; unauthorised overdraft 24% |
| GST | 4% of sales accrues and is paid every 4th week |
| Other current liabilities | Rs 25 lakh (term-loan instalments and similar) |
| Opening position | Rs 16 lakh cash, 2,600 units, four weeks of receivables and payables |

## The five hard constraints

| Constraint | Rule | Source of the number |
|---|---|---|
| Minimum cash buffer | cash at every week end >= Rs 3 lakh | modelling choice (about 0.6 of a week of fixed outflows) |
| Overdraft limit | drawn <= limit | the facility; a scenario can halve it |
| Covenant | current ratio >= 1.33 | the Tandon-committee norm banks apply to working-capital limits |
| Payment term | no MSME supplier invoice unpaid beyond 45 days | MSMED Act 2006 s.15 (interest under s.16 at three times the bank rate) |
| Inventory capacity | units held + on order <= 6,000 | modelling choice |

The 45-day figure is configurable (`constraints.payment_term_days`).

## What each action does (all configurable under `effects`)

| Action | Effect in the books |
|---|---|
| accept_bulk_order | sells units from stock on 30-day credit |
| extend_credit_terms | pushes receipts out 2 weeks; 3% extra sales from retained customers |
| clear_stock_discount | sells stock for cash at a 15% discount |
| place_reorder | buys on supplier credit, arrives in 2 weeks |
| prepay_supplier_discount | pays cash now for a 3% discount, arrives in 2 weeks |
| schedule_overtime | cash out now, units next week at 60% of unit cost |
| schedule_maintenance | cash out now; resets the breakdown clock |
| send_dunning | 60% of the overdue amount collected this week, 1% cost |
| early_payment_discount | 70% of the invoices offered (not yet due) are paid at once at a 2% discount |
| factor_invoices | sells invoices for cash at a 4% fee |
| draw_overdraft / repay_overdraft | moves cash and debt one for one |
| delay_payables | pushes supplier invoices out 2 weeks (oldest due first, MSME or not) |
| pay_payables_early | pays early for a 1.5% discount |
| settle_msme_overdue | pays the oldest MSME invoices |
| pay_gst_dues | pays accrued GST early |

## The scenarios (injected in week 3, invisible to every look-ahead until they happen)

| Scenario | Shock |
|---|---|
| delayed_receivable | the largest unpaid invoice is paid 6 weeks later than forecast |
| supplier_price_spike | landed cost +25% for 6 weeks |
| demand_surge | demand x1.5 for 4 weeks |
| credit_limit_tightened | overdraft limit halved |

## The objective the Arbiter maximises

`J(S) = w_profit * sum(confidence_i * profit_i) + w_risk * sum(confidence_i * risk_reduction_i) + w_liquidity * min(min_headroom(S), liquidity_target)`

subject to the five constraints holding over a 4-week look-ahead. `profit_i` and `risk_reduction_i` are the
expected values the effect models in `actions.mjs` give for the proposal at its (possibly reduced)
amount; `min_headroom` is the lowest projected cash above the buffer. Weights: 1, 1, 0.25; liquidity
target Rs 5 lakh.
