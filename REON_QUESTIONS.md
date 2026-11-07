# Two numbers we need from REON (message draft for the mentors / Discord)

Hi REON team, we are the PeakSure team (cell-level commitment for municipal utilities on ISO-NE peaks).
Our model of the 2.5 MW CES depends heavily on two numbers we could not find in public material. Approximate values or ranges are fine.

**1. Switch resistance per cell path (R_on), and how many parallel strings (columns) share the 2.5 MW.**
Each cell's switch carries the full string current, so the loss is roughly I x R_on / V_cell. With 240 cells in series and 8 strings, the current at 2.5 MW is about 440 A:

| R_on per cell path | 8 strings | 16 strings | 32 strings |
|---|---|---|---|
| 0.1 mOhm | 1.4% | 0.7% | 0.35% |
| 0.5 mOhm | 7.1% | 3.5% | 1.8% |
| 1.0 mOhm | 14.1% | 7.1% | 3.5% |

On the same aged cells, bypass only beats a fixed string while the switch loss stays below a break-even value, which grows with age (see `results/switching.json`). So R_on and the number of columns decide whether bypass pays in the early years.

**2. The DC window: minimum DC voltage of the PCS and cells per string, which sets N_min.**
We assume 240 cells per string and N_min = 216 (10% headroom). With 480 Vac, PCS units we found need about 750 Vdc or more, which leaves little headroom for a sodium-ion voltage curve.

Optional third question: is bypass make-before-break, and what are the commutation time and dead time? From published half-bridge measurements (Hanzl et al. 2021), we model one cell leaving a 240-cell string as a 0.44% DC step that settles within about 1.3 ms. That is negligible for our 1-minute model, but we want to confirm it.
