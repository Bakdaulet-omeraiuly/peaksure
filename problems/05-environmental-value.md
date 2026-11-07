# Problem 5 — Quantifying Environmental Value (CO₂e)

## The problem
The challenge explicitly asks for **environmental** value. The main lever is: **fewer new cells manufactured**, through longer life and second-life reuse. Pitfalls:
- Manufacturing-emission numbers vary widely by study, boundary, and production region.
- Claiming "grid CO₂ avoided" from peak shaving is hard to defend, because it depends on which generator is displaced. Treat it as secondary and optional.

## Data (literature)
| Quantity | Value | Source |
|---|---|---|
| Li-ion cell production, current (all types) | ~58–92 kg CO₂e/kWh_cell | J. Industrial Ecology, 2025 (cradle-to-gate) |
| LFP, optimized production | ~37 kg CO₂e/kWh_cell | same |
| LFP, typical range | 31–71 kg CO₂e/kWh | industry summary (batterydesign.net), secondary source |
| LFP in a 2026 Frontiers perspective | ~52 kg CO₂e/kWh (**text extraction garbled; verify**) | Frontiers in Env. Sci. 2026 |
| Regional effect | EU ~69 vs China ~87 kg CO₂e/kWh (all cells) | batterydesign.net |

**Default:** LFP = 50 kg CO₂e/kWh (central), with a sensitivity range of **31–92**. Always show the band.

## Our solution
### Metric 1 — Avoided manufacturing emissions
```
ΔCO₂e_life = (kWh of new cells avoided over the project horizon) × EF_manufacturing
```
where "kWh avoided" comes from two sources:
- **Life extension:** strategy C delays replacement, so fewer replacement cells are built over 15 years.
- **Second-life reuse:** each kWh of second-life cells used directly (no sorting) replaces a new kWh.

### Metric 2 — Carbon intensity per delivered MWh
```
gCO₂e per kWh delivered = embodied CO₂e of cells / lifetime kWh delivered
```
Literature puts LFP at 7–33 gCO₂e/kWh of throughput (3,000–6,000+ cycles). Cell-level control should lower this number **because the denominator grows**. This is a clean, defensible metric.

### Metric 3 (optional, labelled) — Grid emissions
Peak shaving might displace peaker plants. Use the ISO-NE marginal emission rate and show it **separately** as a scenario, not mixed into the headline.

### Accounting rules
- Avoid double counting: second-life cells' original manufacturing emissions belong to their first life (the EV). We count only the **new** cells avoided.
- Report the extra electronics' embodied emissions as a penalty if a number can be found; otherwise say it is excluded.

## How we prove it
- Show CO₂e for A, B, and C with the full 31–92 band.
- Show results as a function of second-life share (Problem 3).

## Sources
- [Cradle-to-gate LCA of Li-ion cells — J. Industrial Ecology 2025](https://ideas.repec.org/a/bla/inecol/v29y2025i1p113-128.html)
- [Fraunhofer publication](https://publica.fraunhofer.de/handle/publica/480983)
- [Frontiers in Env. Sci. 2026](https://www.frontiersin.org/articles/10.3389/fenvs.2026.1630913/full)
- [Carbon footprint vs cell chemistry — batterydesign.net](https://www.batterydesign.net/carbon-footprint-vs-cell-chemistry/)
- [Carbon footprint is a 2-axis problem — batterydesign.net](https://www.batterydesign.net/carbon-footprint-is-a-2-axis-problem/)
- [LithiumWerks LCA overview](https://lithiumwerks.com/battery-sustainability-and-life-cycle-assessment/)
