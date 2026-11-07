import AppBar from "@/components/AppBar";

const S = ({ t, children }: { t: string; children: React.ReactNode }) => (
  <section className="surface p-5 sm:p-7">
    <h2 className="text-[17px] font-semibold tracking-tight mb-2">{t}</h2>
    <div className="text-[13px] leading-relaxed text-muted space-y-2">{children}</div>
  </section>
);

export default function Method() {
  return (
    <div className="site-shell">
      <AppBar />
      <div className="page-wrap max-w-[1000px]">
        <div className="eyebrow mb-3">Method & evidence</div>
        <h1 className="page-title mb-3">A model built for a decision.</h1>
        <p className="text-muted text-[14px] leading-relaxed mb-6">The simulation separates battery hardware, what the operator believes, and the rule used to commit power.</p>
        <div className="grid gap-4">
          <S t="The decision">
            <p>Massachusetts municipal light plants pay ISO-NE transmission (RNS, $/kW-yr) on their load at 12 monthly system peaks and capacity on the annual peak.
              Before each forecast peak, the battery operator commits a discharge power over a window. PeakSure commits only what the battery can deliver with 95% confidence:
              P(deliverable energy &ge; power &times; window) &ge; 95%.</p>
          </S>
          <S t="Three modeled operators">
            <p><b className="text-ink">Conventional:</b> fixed series strings (same current through every cell; the first empty cell stops the string; the hottest cell derates it),
              an annual system capacity test as its belief, and the common rule: full power for as many whole hours as the P5 energy allows, centred on the most likely hour.</p>
            <p><b className="text-ink">REON baseline (assumed):</b> per-cell bypass with the same annual pack-test belief and full-power rule. This is a modeled comparison policy, not a verified description of REON&apos;s current control software.</p>
            <p><b className="text-ink">REON + PeakSure:</b> per-cell bypass (an empty or hot cell leaves the path; the string runs while at least N_min cells keep the DC voltage valid),
              a per-cell Kalman twin as its belief, and the chance-constrained commitment. Optional value-of-information probes switch single cells to measure them.</p>
          </S>
          <details className="surface disclosure"><summary>Data sources, assumptions and limitations</summary><div className="p-4 grid gap-4">
          <S t="Research extensions">
            <p><b className="text-ink">Mixed-age cells:</b> a separate paired simulation assigns distinct prior calendar ages within one chemistry. The age history is assumed, not measured from REON hardware.</p>
            <p><b className="text-ink">Lifetime control:</b> a second resting-SOC policy allocates lower standby charge to cells with the fastest fade estimated by the twin. Its value and any negative outcome are reported against the original policy. Independent cell-level standby control and recharge readiness remain unconfirmed.</p>
            <p><b className="text-ink">Model mismatch:</b> the robust commitment uses the lower of the cell twin and an independent annual pack-test belief. A smoothed disagreement signal raises an alert; it does not prove the twin is correct. The added conservatism may reduce savings.</p>
          </S>
          <S t="What runs where">
            <p>Real data: ISO-NE SMD hourly files 2019&ndash;2025 (system monthly peaks, hours, WCMA temperatures), ISO-NE RNS and FCA rates, REON CES rating.</p>
            <p>Python model (repository <code>peaksure/</code>): 15-year cell ageing (calendar Arrhenius &times; SOC stress, DoD-weighted cycling, lognormal cell-to-cell spread
              informed by TUM&apos;s sodium-ion data), the twin, Monte Carlo with paired runs and bootstrap confidence intervals.</p>
            <p>Browser (this site): the same physics re-implemented in TypeScript and tested against the Python model (agreement to 0.001 kWh), minute-by-minute discharge
              of every cell, three operator cases, their beliefs, commitments, and probes, computed live from the exported cell states.</p>
          </S>
          <S t="REON's open questions, answered from public sources">
            <p>From REON&apos;s challenge video, the brief, REON_WHO_WE_ARE, patent US 2023/0341471, inverter datasheets and the TUM sodium-ion paper:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><b className="text-ink">Chemistry:</b> not stated for the CES. REON ships both Na-ion and Li-ion products. We model Na-ion as the base case and LFP as a sensitivity.</li>
              <li><b className="text-ink">Cells per string and N_min (derived):</b> the CES AC side is 480 V three-phase, and a 480 V inverter needs about 750 V DC or more. With 1.5&ndash;3.8 V Na-ion cells, that gives about 240&ndash;300 cells per string, and N_min of about 242 at 3.1 V. The DC window limits deep discharge.</li>
              <li><b className="text-ink">Switch losses (derived, the key number):</b> each cell&apos;s switch carries the full string current, about 420 A for 8 strings. Loss = I&middot;R_on / V_cell: 0.25 m&Omega; gives 3.4%, 1 m&Omega; gives 13.5%. Our 1% base case needs about 80 &micro;&Omega; per cell path. Try the slider in Explore.</li>
              <li><b className="text-ink">Cell temperature spread:</b> vendor practice is about 2&ndash;3 &deg;C cell to cell with liquid cooling and 5&ndash;10 &deg;C with air cooling. The &ldquo;hot cell&rdquo; benefit shrinks with liquid cooling.</li>
              <li><b className="text-ink">Probing:</b> supported. The brief lets us switch any cell in or out, and the patent lists per-cell voltage, current, temperature and impedance sensors. Probe accuracy is our assumption.</li>
            </ul>
            <p>The two numbers that matter most and are still unknown: the switch R_on per cell path (with the number of parallel columns), and the CES DC window.</p>
          </S>
          <S t="What it does not show">
            <p>Ground truth is a simulator, not REON hardware. The CES string design (cells per string, N_min, DC window), chemistry, switch losses and thermal spread are not public;
              they are assumptions with sensitivity ranges. Probing and per-cell resting SOC are capabilities stated in the hackathon brief; their accuracy is unconfirmed.
              Grid CO&#8322; is not claimed. REON&apos;s &ldquo;2&ndash;4&times;&rdquo; is a company claim, not our result.</p>
            <p>Full method, evidence audit and change log: <code>PeakSure-Science-Addendum.md</code>; results: <code>RESULTS.md</code> in the repository.</p>
          </S>
          </div></details>
        </div>
      </div>
    </div>
  );
}
