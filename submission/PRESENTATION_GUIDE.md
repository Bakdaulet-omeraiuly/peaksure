# PeakSure: presentation and demo guide

About 5 minutes of slides, 3 minutes of live demo, then questions. Numbers below match the live site
(model run of 8 Nov 2026, 64 paired runs) and the 10-slide deck. Every slide's voice-over line is also in
the PowerPoint speaker notes.

## Before you start (checklist)

- [ ] Open https://peaksure-energy.vercel.app/compare in the **front** Chrome tab, full screen. The 3D view only animates in the visible tab.
- [ ] Click the preset **"Base case: 2025 annual peak"** once so the data is loaded. Close the "Advanced assumptions" panel.
- [ ] Second tab: the deck PDF (or PowerPoint in presenter view with the notes).
- [ ] Third tab: the pitch video on Drive, already loaded, as the **fallback** if the Wi-Fi or the 3D view fails.
- [ ] Browser zoom at 100%, notifications off, laptop on power.
- [ ] Decide who presents slides and who drives the demo; rehearse the hand-off once.

## Slides: talk track (≈ 5 min)

| # | Slide | Say (≈ 30 s each) |
|---|---|---|
| 1 | Cover | "We're PeakSure. We help battery operators know what their battery can really deliver at the peak, using REON's cell-level control." |
| 2 | Problem | "A few summer peak hours set a town's power bill. Massachusetts utilities pay $183.71 per kW-year on each monthly ISO-NE peak, plus capacity on the annual one, and every household pays it. Sterling's battery saved $244,460 at one annual peak. Today operators guess how much to commit: too much and the battery runs dry, too little and savings are lost." |
| 3 | Where REON comes in | "In a normal battery the weakest cell stops the whole string. REON switches that cell out. On the challenge's 16-cell example that's 20% more energy. In our drain test on a 9-year-old plant, fixed strings strand 638 kWh; REON bypass strands 201." |
| 4 | Phase 1 · Retrofit | "We propose two phases. First, retrofit: add REON's cell-level BMS to batteries already installed, for about $25–75 per kWh, no new battery. It pays most where cells limit delivery: +$168K a year with faulty cells, +$98K with failing cooling. Sterling, Reading and Holden are real candidates." |
| 5 | Phase 2 · Scale | "With measured proof, we scale: sell REON EBS with cell control built in, for new town storage and for commercial sites on demand charges like National Grid's G-2 at $15.24 per kW-month." |
| 6 | How the model works | "Real ISO-NE peaks 2019–2025, cells that age for 15 years using sodium-ion lab data, a digital twin that never sees the true cell state, and savings counted only on power actually delivered. Three cases on identical cells." |
| 7 | Results | "On a healthy 2-hour battery the gain is small, +$7.4K a year. Where cells limit delivery it is large. And PeakSure's 95% commitment covers 73% of monthly peaks instead of 66%." |
| 8 | Battery options | "The same control works for lithium and sodium-ion. LFP is cheaper; sodium-ion handles the cold." |
| 9 | Impact | "Over 15 years the conventional battery falls to 72% of nameplate and needs 141 kWh of new cells; REON EBS stays above 81% and needs none: about 7 tonnes of manufacturing CO₂ avoided." |
| 10 | Recommendation | "Our recommendation: a read-only data pilot now, a retrofit on one or two struggling Massachusetts batteries next, then scale with EBS. Our ask to REON: one anonymized battery log." |

**Short on time?** Skip slides 6 and 8 (say "method and chemistry are in the appendix and the live tool").

## Live demo: click by click (≈ 3 min)

Use the **Compare** tab. Say what you are about to show, click, then point at the number.

1. **Base case, peak hour.** Preset **"Base case: 2025 annual peak"** → **Peak day** → **Play**.
   "The real 24 June 2025 peak, 6 PM. All three batteries commit 2.5 MW for an hour and deliver 2,500 kWh. On a healthy battery, the peak looks the same."
2. **Drain test (the key visual).** Click **Drain test** → **Play** (or the step buttons **2. Limiting cell** then **4. Result**).
   "Now full power until empty. The conventional strings stop when their weakest cell (red) is empty at about 86 minutes. REON switches those cells out (grey) and keeps going. Result: 3,855 vs 4,221 kWh delivered, 638 vs 201 kWh stranded."
3. **Where it pays.** **Peak day** → preset **"Winter peak, aged 1-h battery"** → **Play**.
   "A cold January peak on an aged 1-hour battery. Conventional can only commit 1.69 MW and delivers 1,648 kWh; REON EBS commits 1.92 MW and delivers 1,815 kWh, 167 kWh more at the peak, and strands 114 instead of 373 kWh."
4. **Lifetime.** Scroll to **"Over the battery's life"**.
   "Over 15 years: 81% vs 72% of nameplate, 141 kWh of top-up cells avoided, about 7 tonnes of CO₂."
5. **Close.** Click **Proposal** → scroll to **Our recommendation**: "Prove it on today's batteries, build it into tomorrow's."

**Optional if there's time:** the **EBS 3D** tab (one 30 kW / 60 kWh block at a commercial site, National Grid G-2 tariff; switch the weakest cell to "stress: 80%" to see the bypass, and the Assembled / Exploded / Xray views).

**Avoid in the demo:** the **drain test on "Hot afternoon, weak cooling"**. There the model rests overheated cells, so REON EBS delivers less in the drain (2,849 vs 3,697 kWh). See the Q&A answer below if a judge goes there.

**If something breaks:** switch to the Drive video tab and play from 1:03 (peak hour; the drain test starts at 1:16), or show slide 3.

## Likely questions and honest answers

- **"Is this validated on REON hardware?"** No. It's a simulation on real ISO-NE peaks and published sodium-ion ageing data; REON's EBS internals (cells per block, minimum active cells, switch resistance) are our assumptions. That's exactly why our first step is a read-only pilot on one real REON battery log.
- **"Why is the gain small on a healthy 2-hour battery?"** Energy rarely runs out on a 2-hour battery during a 1-hour peak; peak *timing* matters more than cell health. Cell control pays when cells limit delivery: 1-hour batteries, heat, faults, ageing. That's why we target struggling batteries first.
- **"Where do the dollar numbers come from?"** Simulated kW actually delivered in the real peak hour × ISO-NE transmission ($183.71/kW-yr) and capacity ($3.58/kW-month) rates, averaged over 15 years and paired random runs.
- **"What about the hot-weather case?"** With failing cooling, cell control is worth +$98K a year on average. In the single hot-day drain test the model deliberately takes overheated cells out of the path to protect them, so the string stops earlier: safety first, and an honest limit of bypass in extreme heat.
- **"Why 95% confidence?"** Committing too much means missing the peak and losing the saving. The 95% rule covers 73% of monthly peaks vs 66% for the conventional rule.
- **"How much does the retrofit cost?"** Our team estimate is $25–75 per kWh; the break-even per case is on the Results slide (e.g. up to $377/kWh with faulty cells, $81/kWh for a 1-hour battery).
- **"Why sodium-ion?"** REON's EBS Na+ is sodium-ion; we also ran LFP. Sodium-ion handles cold well; LFP is cheaper.
- **"Who pays and who benefits?"** Municipal utilities and their ratepayers (lower peak charges), battery owners (more energy from the same cells, fewer replacements), and REON (a clear price target and a pilot path).

## Numbers to remember

638 vs 201 kWh stranded · 3,855 vs 4,221 kWh delivered · 73% vs 66% peaks covered · +$168K faults · +$98K failing cooling · +$7.4K healthy 2-h · 81% vs 72% capacity at year 15 · 141 kWh top-ups avoided · ≈ 7 t CO₂ · $25–75/kWh retrofit · G-2 $15.24/kW-month · $183.71/kW-yr RNS.
