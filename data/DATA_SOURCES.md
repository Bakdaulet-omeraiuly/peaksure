# PeakSure: Battery Data Sources

Compiled on 2026-11-07. Everything here is public. Nothing has been downloaded yet; these are links only.
Put the files you download into the matching folders: `data/tum-naion/`, `data/batteryarchive/`, `data/papers/`.

---

## 1. TUM sodium-ion ageing dataset (MAIN SOURCE, Modules 1–2)

- **What it contains:** Commercial Na-ion 18650 cells with layered-oxide cathodes and hard-carbon anodes.
  - 94 cells received an initial check-up; 70 of them went through calendar and cycle ageing.
  - Ageing ran for about 2 years, or up to 5000 equivalent full cycles.
  - Test variables: SOC, DOD, temperature and C-rate.
  - The data also includes EIS measurements and degradation-mode analysis.
- **Size / format:** 13 GB, 2708 MATLAB `.mat` files. Licence: CC BY 4.0.
- **Dataset page:** https://doi.org/10.14459/2026mp1840745 (redirects to https://mediatum.ub.tum.de/1840745)
- **Paper:** Bahrke, Rehm, Natterer, Wendlandt, Jossen, *EES Batteries* 2 (2026) 1157–1175. https://doi.org/10.1039/d6eb00020g
- **How to download:**
  1. Open the dataset page and click **"View and download"**. You can also use FTP; the link is on the same page.
  2. Alternatively, use rsync. The password is `m1840745`.
     ```
     # list the contents only (downloads nothing):
     rsync --list-only rsync://m1840745@dataserv.ub.tum.de/m1840745/
     # download:
     rsync -av rsync://m1840745@dataserv.ub.tum.de/m1840745/ data/tum-naion/
     ```
  3. **Download only the check-up files first.** You don't need all 13 GB.
  4. Read the paper PDF first. It describes the test matrix and the temperatures.

---

## 2. LFP cell-to-cell variation (Module 1, in case the chemistry is LFP)

- **data.matr.io (Severson / Attia):** 124 + 45 A123 LFP cells. https://data.matr.io/1
- **TUM/Jossen dataset on production cell-to-cell variation over three years (CC BY):** https://data.4tu.nl/datasets/a63325e7-379b-48a7-bfd1-9cf04f323214

## 3. LFP ageing model (Module 2)

- **NREL BLAST-Lite:** https://pypi.org/project/BLAST-Lite/ (GitHub: NREL/BLAST-Lite)
  ```
  pip install blast-lite
  # from blast import models; cell = models.Lfp_Gr_250AhPrismatic()
  ```
  NREL says these models should be treated as qualitative. They cannot capture cell-to-cell spread in ageing rates.

## 4. Battery Archive (LFP, optional)

- https://www.batteryarchive.org: go to Cycling Data and filter for SNL + LFP (the 18650 study). It has no Na-ion data.
- To get the full CSVs, email info@batteryarchive.org. They may take days to reply, so this is only a fallback during the hackathon.

## 5. Low temperature (Module 2 + winter peaks): PARTIAL GAP

- There is no open dataset on Na-ion ageing in the cold. What exists:
  - **Leeds, Applied Energy 2026:** Na-ion cells keep 51–62% of their 25 °C capacity at −40 °C. https://eprints.whiterose.ac.uk/id/eprint/239121
  - **Zenodo:** Na-ion pulse and drive-cycle tests at −5 to 45 °C. These are SOC tests, not ageing tests. https://zenodo.org/records/13836819
  - **Liu & Ciucci, arXiv 2504.00393:** 53 Na-ion cells at 0/25/35/45 °C. We have not confirmed whether the data is public. https://arxiv.org/abs/2504.00393
- **In the presentation, say this openly:** cold-weather capacity is supported by data; cold-weather ageing is an assumption.

## 6. SOC/SOH estimation error (Module 4)

- Use ranges from the literature and label them as an **assumption**.

## 7. Switch losses (Module 3)

- Use MOSFET datasheets: P = I² · R_ds(on). We have not picked a specific transistor yet.

## 8. System cost (Module 6)

- **Lazard LCOE+ 2026 (July 2026):** LCOS for a 100 MW / 4 h system is about **$210–292/MWh**. Costs are rising, partly because of tariffs.
  https://lazard.com/news-announcements/lazard-releases-2026-levelized-cost-of-energyplus-report-pr/
- **NREL Cost Projections for Utility-Scale Battery Storage, 2025 Update (June 2025):** https://docs.nrel.gov/docs/fy25osti/93281.pdf
  There is no 2026 ATB yet.

---

### Chemistry caveat

- If the REON cells are Na-ion, the main source is TUM (§1).
- If they are LFP, use §2–§4.
- Confirm the chemistry with REON before hardcoding anything.
