# PeakSure: Demo Guide (2 minutes)

```bash
pip install numpy pandas scipy plotly streamlit pyarrow openpyxl pytest
pytest -q                                   # 18 tests, incl. the brief's 16-cell example
python -m peaksure.experiments              # full suite (about 20 min on 8 cores); --quick for a smoke run
streamlit run app/app.py
```

Every number in the app is computed: either read from `results/` (seeded Monte Carlo with 95% CIs, `manifest.json` gives the config hash and commit) or simulated live in the **Peak day** tab. Nothing is hardcoded.

## Script
| Time | Tab | What to show | Line |
|---|---|---|---|
| 0:00 | Overview | The decision callout + KPI cards | "Towns save money on 13 ISO-NE peaks a year. The question is what the battery can really deliver in that hour." |
| 0:20 | Peak day (live) | Select **2025-06-24 HE18, 34.4 C, annual peak**, battery age 9, 4-h system | Real ISO-NE load curve; each operator's committed window |
| 0:40 | Peak day | Cell maps: the conventional string limited by one cell (X) vs REON cells leaving the path | "One weak cell sets the limit of the whole string." |
| 0:55 | Peak day | Belief boxes: pack estimate (wide) vs cell twin (narrow), red = truth | "PeakSure commits only what it can deliver with 95% confidence." |
| 1:10 | Where it pays | Duration and scenario chart | "Cell-level value is near zero for a 2-h CES on this duty; it is material at 1 h and 4 h. That is a specification for REON, not a sales slogan." |
| 1:30 | Twin calibration | Miss rate vs model mismatch | "We break our own twin on purpose; the fallback triggers when calibration fails." |
| 1:45 | Economics | Per-household value + Holden reality check | "Here is what each household's battery is worth." |

## Fallback
If live computation is slow, every other tab reads precomputed results. The Peak day tab caches each selection after the first run. Keep a screen recording as backup.
