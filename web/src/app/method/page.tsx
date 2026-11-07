import AppBar from "@/components/AppBar";

const S = ({ t, children }: { t: string; children: React.ReactNode }) => (
  <section className="panel rounded-lg p-5">
    <div className="micro mb-2">{t}</div>
    <div className="text-[13px] leading-relaxed text-muted space-y-2">{children}</div>
  </section>
);

export default function Method() {
  return (
    <div className="h-screen flex flex-col">
      <AppBar context={<>How the simulation works, and what it does not show</>} />
      <div className="flex-1 overflow-y-auto scroll">
        <div className="max-w-[980px] mx-auto p-5 grid gap-4">
          <S t="The decision">
            <p>Massachusetts municipal light plants pay ISO-NE transmission (RNS, $/kW-yr) on their load at 12 monthly system peaks and capacity on the annual peak.
              Before each forecast peak, the battery operator commits a discharge power over a window. PeakSure commits only what the battery can deliver with 95% confidence:
              P(deliverable energy &ge; power &times; window) &ge; 95%.</p>
          </S>
          <S t="Two operators, same cells">
            <p><b className="text-ink">Conventional:</b> fixed series strings (same current through every cell; the first empty cell stops the string; the hottest cell derates it),
              an annual system capacity test as its belief, and the common rule: full power for as many whole hours as the P5 energy allows, centred on the most likely hour.</p>
            <p><b className="text-ink">REON + PeakSure:</b> per-cell bypass (an empty or hot cell leaves the path; the string runs while at least N_min cells keep the DC voltage valid),
              a per-cell Kalman twin as its belief, and the chance-constrained commitment. Optional value-of-information probes switch single cells to measure them.</p>
          </S>
          <S t="What runs where">
            <p>Real data: ISO-NE SMD hourly files 2019&ndash;2025 (system monthly peaks, hours, WCMA temperatures), ISO-NE RNS and FCA rates, REON CES rating.</p>
            <p>Python model (repository <code>peaksure/</code>): 15-year cell ageing (calendar Arrhenius &times; SOC stress, DoD-weighted cycling, lognormal cell-to-cell spread
              informed by TUM&apos;s sodium-ion data), the twin, Monte Carlo with paired runs and bootstrap confidence intervals.</p>
            <p>Browser (this site): the same physics re-implemented in TypeScript and tested against the Python model (agreement to 0.001 kWh), minute-by-minute discharge
              of every cell, both beliefs, the commitment, and the probes, computed live from the exported cell states.</p>
          </S>
          <S t="What it does not show">
            <p>Ground truth is a simulator, not REON hardware. The CES string design (cells per string, N_min, DC window), chemistry, switch losses and thermal spread are not public;
              they are assumptions with sensitivity ranges. Probing and per-cell resting SOC are capabilities stated in the hackathon brief; their accuracy is unconfirmed.
              Grid CO&#8322; is not claimed. REON&apos;s &ldquo;2&ndash;4&times;&rdquo; is a company claim, not our result.</p>
            <p>Full method, evidence audit and change log: <code>PeakSure-Science-Addendum.md</code>; results: <code>RESULTS.md</code> in the repository.</p>
          </S>
        </div>
      </div>
    </div>
  );
}
