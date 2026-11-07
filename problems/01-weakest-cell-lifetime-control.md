# Problem 1 — Lifetime-Aware Cell Control ("Weakest-Link" Problem)

## The problem
In a series string, the same current flows through every cell. Charging stops when the **first** cell hits V_max, and discharging stops when the **first** cell hits V_min. So:
- **Usable capacity ≈ capacity of the weakest cell**, not the average.
- Weak cells also run at the widest relative depth of discharge (DoD), so they **age fastest**. The spread between cells grows over time, and the pack's end of life comes early.

Literature support:
- A field study of a 324-cell second-life system found that lumped models that ignore individual cells **overestimate SoH by up to 31%** (arXiv 2609.04487).
- Cells with different SoH "diverge further apart when cycled evenly" (Atlantis Press study).

## What already exists (prior art)
| Approach | What it does | Limitation |
|---|---|---|
| Passive balancing | Burns excess charge in resistors | Equalizes SoC only; cannot add capacity beyond the weakest cell |
| Active balancing | Moves charge between cells | Limited by balancing current; losses; does not reduce the weak cell's stress |
| Reactive bypass / reconfigurable packs | Switches a cell out when it hits a limit | Uses the extra capacity, but decides only at the limit, not by lifetime |
| Degradation-aware reconfiguration | Selects the configuration by pack SoH (MDPI *Batteries* 9(4):217) | Assumes the SoH estimates are correct |
| Ripple-aware switching control (arXiv 2202.11757) | Reduces aging from switching ripple current | Focuses on electrical stress, not lifetime allocation |
| **Chalmers, Nature Communications (Oct 2026)** | Models reconfigurable EV packs: **>20% longer life**, ~14 months later replacement | EVs, not stationary BESS; modelled, not in production |

Lesson: "bypass weak cells → longer life" is **already shown**. We must not claim it as our discovery. We use it as **strategy B** and as validation that the physics works.

## Our solution
### Control knob
Each cell i gets a **utilization weight u_i ∈ [0, 1]**: the fraction of time it is switched in (duty cycle), or equivalently its share of the string's Ah throughput. Cell-level switching hardware (REON-type) implements this.

### Decision rule (strategy C)
At each control horizon (e.g. 1 day), choose u to:

```
maximize   E_delivered(u)  −  λ · Cost_degradation(u)
subject to every cell's V, T, and SoC within limits
           string output meets the dispatch request (peak-shaving power)
```

Cost_degradation is the predicted capacity loss of each cell, valued in $ (replacement cost per kWh lost). See Problem 4 for why naive depreciation is the wrong proxy.

### Why this beats reactive bypass
Reactive bypass (B) only reacts **at the voltage limit**. It does not ask: "If I work this cell 10% less today, how much longer does the whole string live?" Strategy C plans ahead. It **equalizes the time to end of life** across cells instead of equalizing SoC.

### Simplest working form (hackathon)
A greedy heuristic is enough: weight ∝ (remaining capacity) / (predicted aging rate). Then upgrade to a scipy/cvxpy optimizer if time allows. The degradation model is convex in throughput when z < 1, so the problem stays tractable.

## How we prove it
- Same load, same cells, same seeds: compare A, B, and C.
- Metrics: lifetime MWh delivered, years until the string reaches 80% of initial usable energy, and SoH spread (std) over time.
- **Ablation:** strategy C with perfect knowledge vs C with estimated SoH. This connects directly to Problem 2.

## Risks
- Switching losses and electronics cost can eat the gain (Chalmers coverage lists upfront cost as the main drawback). Model the efficiency penalty as a parameter (1–2%, assumption).
- Bypassing reduces string voltage, so redundancy (spare cells in series) is needed. REON describes this as "dynamic redundancy".

## Sources
- [Chalmers study coverage — electrive](https://electrive.com/2026/10/09/cell-bypass-aims-to-extend-the-usable-life-of-ev-batteries), [EurekAlert](https://eurekalert.org/news-releases/1146902), [Automotive World](https://www.automotiveworld.com/?p=506428)
- [Degradation-conscious reconfigurable control — MDPI Batteries](https://mdpi.com/2313-0105/9/4/217)
- [Degradation-reducing control for reconfigurable batteries — arXiv 2202.11757](https://arxiv.org/pdf/2202.11757)
- [Second-life field data, cell-level SoH — arXiv 2609.04487](https://arxiv.org/pdf/2609.04487)
- [REON technology](https://kelaenderkoe.pages.dev/float-https-reoncorp.com/technology)
