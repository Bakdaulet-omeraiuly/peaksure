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

**EBS questions (after REON said the CESS and OES are white-label and the EBS carries the cell-level BMS):**
- How many cells per EBS block, and what is the block DC voltage?
- Does each block have its own DC/DC or inverter stage, and how are blocks paralleled at MW scale?
- What is the energy per block for the EBS Li+ version?
- Any price, or price premium over a conventional battery of the same size?

**Phase 1 (retrofit) and Phase 2 (new batteries) questions:**
- Can REON's cell-level control be retrofitted to other vendors' batteries already in the field (for example Sterling, Reading, Holden)? What are the compatibility, warranty, safety and certification limits?
- What would a retrofit cost, per kWh or per cell, including installation?
- Can EBS blocks be combined into a MW-scale plant, and how do they connect to a shared inverter?

**Licensing and Massachusetts compliance:**
- Would REON license its cell-control technology per MW, and on what terms (upfront, annual, implementation support)?
- Does adding REON's cell control to a listed battery require new UL 9540 / UL 9540A testing, and does the OEM need to approve it?
- Is the EBS (and a distributed fleet of EBS units) UL 9540 listed, and what fire-code siting limits apply per unit?

**Product facts we could not confirm (checked reoncorp.com, 8 Nov 2026):**
- CESS "2.5MW/5MWh": is 5 MWh DC nameplate, usable DC, or AC energy at the 480 V interface?
- EBS "30kW/60kWh": is this the Na+ rating, the Li+ rating, or both? Cells per block, block DC voltage window, N_min?
- Which certifications (UL 1741 / 1973 / 9540 / 9540A) apply to which product?
- The site now says "2-3X More Usable Capacity"; earlier material said 2–4×. Which figure and baseline should we cite?
