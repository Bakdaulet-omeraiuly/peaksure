import AppBar from "@/components/AppBar";
import { bypassString } from "@/engine/physics";

const S = ({ n, t, children }: { n: string; t: string; children: React.ReactNode }) => (
  <section className="surface p-5 sm:p-6">
    <div className="flex items-center gap-2 mb-2"><span className="w-6 h-6 rounded-full bg-[#153b2f] text-white grid place-items-center text-[12px] font-semibold">{n}</span>
      <h2 className="text-[16px] font-semibold tracking-tight">{t}</h2></div>
    <div className="text-[13px] leading-relaxed text-muted space-y-2">{children}</div>
  </section>
);

const STEPS: [string, string][] = [
  ["Peaks", "Real ISO-NE system peaks and temperatures, 2019–2025"],
  ["Cells", "Every simulated cell ages over 15 years (TUM sodium-ion fit)"],
  ["Belief", "Pack test (A, B) or per-cell twin (C), never the true cell state"],
  ["Decision", "Commit power × hours before each peak"],
  ["Discharge", "Minute by minute, per cell, with bypass where allowed"],
  ["Savings", "kW actually delivered in the peak hour × RNS / FCA rate"],
];

// The challenge brief's example, computed with the simulator's own bypass function.
const CELLS = [...Array(15).fill(85), 70];
const FIXED = Math.min(...CELLS) * 16;
const AVG = CELLS.reduce((a, b) => a + b, 0);
const EXAMPLE: [string, number][] = [
  ["Fixed series string", FIXED],
  ["Bypass, N_min = 16 (no headroom)", bypassString(CELLS, 0, 16, 16).cellAh],
  ["Bypass, N_min = 15 (one cell may leave)", bypassString(CELLS, 0, 16, 15).cellAh],
];

const CHECKLIST: [string, string][] = [
  ["A specific real-world application", "Massachusetts municipal light plant shaving ISO-NE peaks (Proposal, Compare)"],
  ["A clearly defined fixed-string baseline", "Case A: fixed series strings, same cells (Compare, Assumptions)"],
  ["Cell-level monitoring and selective bypass", "Cases B and C: bypass within N_min; per-cell twin in C (Compare)"],
  ["Usable capacity or energy recovered", "Stranded energy and energy recovered (Compare cards and lifetime panel)"],
  ["Capacity retention vs a 70% threshold, service life", "15-year retention chart and top-up cells avoided (Compare)"],
  ["Economic value for one stakeholder", "Utility peak savings per year and NPV (Proposal, Compare)"],
  ["Environmental value", "Cell-manufacturing CO₂ avoided by fewer top-ups (Compare)"],
  ["Sensitivity to uncertain assumptions", "Duration, cooling, faults, chemistry, switch loss (Proposal, Assumptions, Compare panel)"],
  ["Delivered kWh and kW at a defined boundary", "Commitment power × hours = energy, AC side after inverter and switch losses"],
];

// Every figure below is taken from RESULTS.md (paired Monte Carlo, ISO-NE peaks 2019–2025).
const PROBLEMS: [string, string, string][] = [
  ["Lifetime-aware cell control", "Tier 3 control parks each cell at a gentler resting charge between peaks, using the TUM sodium-ion calendar-ageing fit.", "+167 to +229 kWh more energy left at year 15; +$3,214/yr on a mixed-age plant"],
  ["Real-time cell reconfiguration", "Minute-by-minute per-cell discharge; an empty or hot cell is bypassed while enough cells keep the DC voltage valid.", "Deliverable energy +8% over 15 years (3,879 → 4,196 kWh); top-up cells needed 141 kWh → 0"],
  ["Mixed-age and mixed-chemistry batteries", "Cohorts aged 0, 5 and 10 years share one plant; sodium-ion and LFP chemistries run through the same engine.", "+$10,905/yr, 117 kWh more end-of-life energy and 208 kWh fewer replacement cells vs the conventional plant"],
  ["Digital-twin uncertainty", "A per-cell twin feeds a 95% commitment; a safety envelope takes the lower of twin and pack-test belief before every peak.", "0.0% missed commitments, even when the twin is systematically biased; peak capture 65.5% → 75.2%"],
  ["Faults and failing cooling", "Stress scenarios with faulty cells and degraded HVAC, run on the same paired cells as the base case.", "Cell-level value $168,299/yr with faults and $98,248/yr with failing HVAC; break-even premium up to $377/kWh"],
];

const IMPACT: [string, string][] = [
  ["Lower bills for local communities", "Massachusetts municipal light plants are publicly owned and non-profit, so money saved on ISO-NE peak charges goes back to local ratepayers. The modelled 2.5 MW plant cuts about $455,000 a year of peak charges."],
  ["Fewer batteries manufactured", "Bypass removes the need for 141 kWh of top-up cells per plant (208 kWh on a mixed-age plant). At 31–92 kg CO₂e per kWh of cell manufacturing, that is about 4–13 t CO₂e avoided per plant."],
  ["A more reliable grid at its hardest hour", "Coincident peaks are the hours when the grid is most stressed. PeakSure only promises energy it can deliver with 95% confidence, and held a 0.0% miss rate across every twin-error test."],
  ["Safer, longer-lived storage", "Hot or exhausted cells leave the current path instead of being pushed, and a gentler resting charge keeps more capacity at year 15, delaying replacement and recycling."],
];

export default function Method() {
  return (
    <div className="site-shell">
      <AppBar />
      <div className="page-wrap max-w-[960px]">
        <div className="eyebrow mb-3">Method</div>
        <h1 className="page-title mb-3">How PeakSure solves cell-level battery problems.</h1>
        <p className="text-[14px] text-muted leading-relaxed max-w-[820px] mb-5">We started from five research problems in REON&apos;s cell-level technology. Each one is built into the simulator and measured on real ISO-NE peaks with paired Monte Carlo runs over 15 years.</p>
        <div className="grid gap-4">
          <S n="1" t="The decision">
            <p>Before each forecast ISO-NE peak (12 monthly transmission peaks and the annual capacity peak), the operator commits a discharge power over a window. Commit too much and the battery runs dry; too little and savings are lost. PeakSure commits only what it can deliver with 95% confidence.</p>
          </S>
          <S n="2" t="Three cases, same cells">
            <p><b className="text-ink">A · Conventional:</b> fixed series strings; the first empty cell stops its string. Belief from an annual pack test; full-power rule.</p>
            <p><b className="text-ink">B · REON EBS:</b> per-cell bypass; an empty or hot cell leaves the path while enough cells keep the DC voltage valid. Same pack test and rule as A, so B − A is the hardware value.</p>
            <p><b className="text-ink">C · REON EBS + PeakSure:</b> B&apos;s hardware with a per-cell twin and the 95% commitment, so C − B adds the information and decision value.</p>
          </S>
          <S n="3" t="Five problems, how we solved them, what we found">
            <div className="overflow-x-auto"><table className="w-full text-[12.5px]"><thead><tr className="text-left text-faint"><th className="py-1 pr-2">#</th><th className="pr-3">Problem</th><th className="pr-3">How PeakSure solves it</th><th>Result</th></tr></thead>
              <tbody>{PROBLEMS.map(([p, how, res], i) => <tr key={p} className="border-t border-line align-top"><td className="py-2 pr-2 text-faint">{i + 1}</td><td className="py-2 pr-3 text-ink font-semibold w-[22%]">{p}</td><td className="py-2 pr-3">{how}</td><td className="py-2 text-[#153b2f] font-semibold w-[32%]">{res}</td></tr>)}</tbody></table></div>
          </S>
          <S n="4" t="Pipeline">
            <ol className="grid sm:grid-cols-3 gap-2">
              {STEPS.map(([k, v], i) => <li key={k} className="rounded-lg border border-line p-3"><div className="micro mb-1">{i + 1} · {k}</div><div className="text-[12.5px]">{v}</div></li>)}
            </ol>
            <p>Python runs the 15-year Monte Carlo with paired random draws; the browser re-runs the same physics in TypeScript, tested against Python.</p>
          </S>
          <S n="5" t="The brief's 16-cell example, run through our bypass model">
            <p>Fifteen cells hold 85 Ah and one holds 70 Ah. A fixed string stops when the 70 Ah cell is empty. With bypass, that cell leaves the path and the string continues while at least N_min cells keep the voltage valid.</p>
            <table className="w-full text-[12.5px] num"><thead><tr className="text-left text-faint"><th className="py-1">Wiring</th><th>Energy in cell-Ah</th><th>Per cell</th><th>vs fixed</th></tr></thead>
              <tbody>{EXAMPLE.map(([label, ah]) => <tr key={label} className="border-t border-line"><td className="py-1.5 font-sans text-ink">{label}</td><td>{ah.toFixed(0)}</td><td>{(ah / 16).toFixed(2)} Ah</td><td>{ah > FIXED + 1e-9 ? `+${((ah / FIXED - 1) * 100).toFixed(1)}%` : "—"}</td></tr>)}</tbody></table>
            <p>Bypass recovers the gap between the weakest cell (70 Ah) and the average cell ({(AVG / 16).toFixed(2)} Ah) only if one cell may leave the string. With no headroom (N_min = 16) it equals the fixed string. Computed live with the simulator&apos;s <code>bypassString</code>.</p>
          </S>
          <S n="6" t="What the challenge asks, and where it is">
            <table className="w-full text-[12.5px]"><tbody>
              {CHECKLIST.map(([ask, where]) => <tr key={ask} className="border-t border-line align-top"><td className="py-1.5 pr-3 text-ink w-[45%]">{ask}</td><td className="py-1.5">{where}</td></tr>)}
            </tbody></table>
          </S>
          <S n="7" t="Impact on society">
            <div className="grid sm:grid-cols-2 gap-3">{IMPACT.map(([t, d]) => <div key={t} className="rounded-lg border border-line p-3"><div className="text-ink font-semibold mb-1">{t}</div><div className="text-[12.5px]">{d}</div></div>)}</div>
          </S>
        </div>
      </div>
    </div>
  );
}
