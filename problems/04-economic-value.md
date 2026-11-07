# Problem 4 — Quantifying Economic Value ($)

## The problem
REON's challenge requires $ value "in a specific real-world application". Two traps:
1. **Vague value:** "saves money" without an application, tariff, or time horizon.
2. **Wrong degradation cost:** treating aging as simple depreciation ($/kWh ÷ cycle life). This is "a poor proxy for revenue lost to aging", and using it can cut profit by **30–50%** (arXiv 2403.10617).

## What already exists
- **Rainflow-based cycle-aging cost** that is provably **convex**, so it fits inside optimization (Shi, Xu, Tan, Zhang, arXiv 1703.07968; IEEE TAC version arXiv 1709.05715).
- **Market bids must cover cycle-aging cost.** When price spreads are small, cycling loses money once aging is counted (Xu et al., arXiv 1707.04567).
- **Moving-average filter estimate of degradation cost** as a better proxy (arXiv 2403.10617).

We reuse these. They are established, and judges will trust them.

## Our solution
### Application
A **1 MWh / 0.5 MW commercial BESS doing peak shaving** at a commercial building in New England. Revenue = demand-charge reduction ($/kW-month × peak kW avoided). Optionally add energy arbitrage on ISO-NE prices.

### Model
```
NPV = Σ_t [ DemandSavings_t + ArbitrageRevenue_t − O&M_t ] / (1+r)^t
      − CAPEX_cells − CAPEX_cell_electronics
      − ReplacementCost × (replacement in year t_EOL) / (1+r)^t_EOL
      + SortingCostAvoided   (Problem 3)
```
- Cell-level control changes **t_EOL** (when replacement happens), **usable kWh** (how much peak can be shaved), and efficiency (switching losses).
- Degradation cost inside the controller: value lost capacity as **lost future revenue**, following arXiv 2403.10617, not as depreciation.

### Parameters (all editable sliders; every default needs a source in the final deck)
| Parameter | Note |
|---|---|
| Demand charge $/kW-month | Take from a published New England commercial tariff |
| ISO-NE prices | Public historical LMP data |
| LFP cell cost $/kWh | Recent public market reports |
| Second-life cell cost $/kWh | Usually below new; give a range |
| Cell-electronics cost $/kWh | REON will not publish it; use a **break-even** framing (see below) |
| Switching efficiency loss | 1–2% (our assumption) |
| Discount rate r | 7–8% (typical; label it) |

### Break-even framing (strong pitch move)
We do not know REON's hardware cost, so we compute: **"Cell-level control is worth up to $X/kWh of electronics before it stops paying off."** This is honest and directly useful to REON's pricing.

## How we prove it
- NPV for A, B, and C under identical assumptions.
- **Tornado chart:** which parameter moves NPV most.
- Results across all mix and twin-error scenarios from Problems 2 and 3.

## Risks
- Demand charges vary a lot by utility, so show a range.
- Overclaiming: always show NPV **net of** the extra electronics and losses.

## Sources
- [Convex cycle-based degradation model — arXiv 1703.07968](https://arxiv.org/pdf/1703.07968)
- [Pay-for-performance battery control with rainflow — arXiv 1709.05715](https://www.arxiv.org/abs/1709.05715)
- [Factoring the cycle aging cost of batteries — arXiv 1707.04567](https://ar5iv.arxiv.org/html/1707.04567)
- [Depreciation cost is a poor proxy — arXiv 2403.10617](https://arxiv.org/pdf/2403.10617)
- [Optimal arbitrage with degradation cost — Univ. of Vaasa](https://osuva.uwasa.fi/items/b8b2174c-9508-476b-b829-e15e813fdb86/full)
