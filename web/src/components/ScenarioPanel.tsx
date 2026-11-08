"use client";
import { Constants, PeakEvent } from "@/engine/data";
import { useStudio, ColorMode } from "@/state/store";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="px-3 py-2.5 border-b border-line">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="micro">{label}</span>
        {hint && <span className="text-[11px] text-faint num">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

const PRESETS: { name: string; note: string; date: string; age: number; duration: "1h" | "2h" | "4h"; kHvac: number; sigmaT: number; probeBudget: number }[] = [
  { name: "Base case: 2025 annual peak", note: "base case: 2 h, year 9", date: "2025-06-24", age: 9, duration: "2h", kHvac: 0.25, sigmaT: 2.5, probeBudget: 0 },
  { name: "Hot afternoon, weak cooling", note: "year 12, HVAC k 0.9, spread 6 C", date: "2025-06-24", age: 12, duration: "2h", kHvac: 0.9, sigmaT: 6, probeBudget: 0 },
  { name: "Winter peak, aged 1-h battery", note: "-18 C, year 12", date: "2019-01-21", age: 12, duration: "1h", kHvac: 0.25, sigmaT: 2.5, probeBudget: 0 },
  { name: "VoI diagnostic probes", note: "May 2019 peak, modeled year 6, budget 4", date: "2019-05-20", age: 6, duration: "2h", kHvac: 0.25, sigmaT: 2.5, probeBudget: 4 },
];

export default function ScenarioPanel({ c, events, ms }: { c: Constants; events: PeakEvent[]; ms: number }) {
  const s = useStudio();
  const ev = events[s.eventIdx];
  const apply = (p: (typeof PRESETS)[number]) => {
    const i = events.findIndex((e) => e.date === p.date);
    s.set({ eventIdx: i >= 0 ? i : s.eventIdx, age: p.age, duration: p.duration, kHvac: p.kHvac, sigmaT: p.sigmaT,
            probeBudget: p.probeBudget, reportBias: 0, playing: false, minute: 15 * 60 });
  };
  const years = Array.from(new Set(events.map((e) => e.year)));
  return (
    <aside className="surface min-w-0 overflow-hidden">
      <div className="panel-h"><span className="micro">Set the scenario</span><span className="badge">Live model</span></div>
      <div className="p-3 grid gap-2 border-b border-line">
        <div className="text-[11px] text-muted">Start with a representative peak.</div>
        {PRESETS.map((p) => (
          <button key={p.name} onClick={() => apply(p)} className="text-left rounded-md border border-line bg-panel-2 hover:bg-panel-3 px-3 py-2">
            <div className="text-[12px] font-medium text-ink">{p.name}</div>
          </button>
        ))}
      </div>
      <Row label="ISO-NE peak (real)" hint={ev ? `${ev.t_amb_c.toFixed(1)} C` : ""}>
        <select className="w-full" value={s.eventIdx} onChange={(e) => s.set({ eventIdx: +e.target.value, playing: false })}>
          {years.map((y) => (
            <optgroup key={y} label={String(y)}>
              {events.map((e, i) => e.year === y ? (
                <option key={i} value={i}>{`${MONTHS[e.month - 1]} ${e.date.slice(8)}  HE${e.he}  ${e.t_amb_c > 0 ? "+" : ""}${e.t_amb_c.toFixed(0)} C${e.is_annual ? "  annual" : ""}`}</option>
              ) : null)}
            </optgroup>
          ))}
        </select>
      </Row>
      <Row label="Battery age" hint={`year ${s.age} · ${c.start_year + s.age - 1}`}>
        <input type="range" min={1} max={15} value={s.age} onChange={(e) => s.set({ age: +e.target.value })} />
      </Row>
      <Row label="System rated power / energy" hint={`${c.p_max_kw / 1000} MW rated`}>
        <div className="seg">
          {(["1h", "2h", "4h"] as const).map((d) => (
            <button key={d} data-on={s.duration === d} onClick={() => s.set({ duration: d })}>{d === "2h" ? "2 h · 5 MWh" : d === "1h" ? "1 h · 2.5 MWh*" : "4 h · 10 MWh*"}</button>
          ))}
        </div>
        <div className="text-[11px] text-faint mt-1 leading-snug">Energy ÷ power is a nominal ratio, not a guaranteed discharge time. *1 h and 4 h are hypothetical sizes. The commitment window is chosen separately.</div>
      </Row>
      <Row label="Cells in the conventional battery">
        <div className="seg">
          <button data-on={!s.sameCells} onClick={() => s.set({ sameCells: false })}>Own ageing</button>
          <button data-on={s.sameCells} onClick={() => s.set({ sameCells: true })}>Identical cells</button>
        </div>
        <div className="text-[11px] text-faint mt-1 leading-snug">Own ageing: both start from the same year-0 cells and draws, then each hardware ages them its own way. Identical cells: A uses B&apos;s cells at this age, isolating the wiring difference.</div>
      </Row>
      <details className="disclosure"><summary>Advanced assumptions</summary>
      <Row label="Monte Carlo seed" hint="cell population">
        <div className="seg">{c.seeds.map((k) => <button key={k} data-on={s.seed === k} onClick={() => s.set({ seed: k })}>{k}</button>)}</div>
      </Row>
      <Row label="Town" hint={`${c.towns[s.town]?.customers.toLocaleString()} customers`}>
        <div className="seg">{Object.keys(c.towns).map((t) => <button key={t} data-on={s.town === t} onClick={() => s.set({ town: t })}>{t}</button>)}</div>
      </Row>
      <Row label="Container cooling" hint={`k = ${s.kHvac.toFixed(2)}`}>
        <input type="range" min={0.1} max={1} step={0.05} value={s.kHvac} onChange={(e) => s.set({ kHvac: +e.target.value })} />
        <div className="flex justify-between text-[11px] text-faint mt-0.5"><span>strong HVAC</span><span>failing</span></div>
      </Row>
      <Row label="Cell temperature spread" hint={`sigma ${s.sigmaT.toFixed(1)} C`}>
        <input type="range" min={0.5} max={8} step={0.5} value={s.sigmaT} onChange={(e) => s.set({ sigmaT: +e.target.value })} />
      </Row>
      <Row label="Bypass switch loss" hint={`${(s.switchLoss * 100).toFixed(1)}% · R_on ${((s.switchLoss * c.v_nom) / ((c.p_max_kw * 1000) / (c.n_strings * c.n_series * c.v_nom)) * 1e6).toFixed(0)} µΩ`}>
        <input type="range" min={0.005} max={0.05} step={0.001} value={s.switchLoss} onChange={(e) => s.set({ switchLoss: +e.target.value })} />
        <div className="text-[11px] text-faint mt-0.5 leading-snug">Each cell&apos;s switch carries the full string current (~{Math.round((c.p_max_kw * 1000) / (c.n_strings * c.n_series * c.v_nom))} A): loss = I·R_on / V_cell. Not public; ask REON.</div>
      </Row>
      <Row label="Colour cells by">
        <div className="seg">
          {([["soc", "Charge"], ["diff", "Difference"], ["soh", "Health"], ["temp", "Temp"], ["sd", "Twin unc."]] as [ColorMode, string][]).map(([k, l]) => (
            <button key={k} data-on={s.colorMode === k} onClick={() => s.set({ colorMode: k })}>{l}</button>
          ))}
        </div>
      </Row>
      <div className="px-3 py-3 text-[11.5px] text-faint leading-relaxed">
        <div className="micro mb-1">Provenance</div>
        Peaks, hours and temperatures: ISO-NE SMD 2019&ndash;2025 (real). Cell ageing: PeakSure Python model, {c.chemistry},
        TUM-informed spread. Discharge, beliefs and commitment computed live in your browser ({ms.toFixed(0)} ms).
        Rates: ISO-NE RNS and FCA. Plant: 2.5 MW / 5 MWh, about 84 REON EBS blocks of 30 kW / 60 kWh; the 240 × 8 cell layout, N_min, efficiency and switch loss are model assumptions.
        <div className="mt-2">Independent analysis. Not endorsed by REON.</div>
      </div>
      </details>
    </aside>
  );
}
