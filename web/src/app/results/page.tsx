"use client";
import { useEffect, useState } from "react";
import AppBar from "@/components/AppBar";
import { fetchJson } from "@/engine/data";

type CI = [number, number, number];
interface R {
  manifest: { config_hash: string; git_commit: string; n_main: number; n_side: number; seconds: number; finished: string };
  t1: { cond: string; savings: CI; npv: CI; capture: number; delivered: number; annual: number; p5miss: number | null; p5lo: number | null; p5hi: number | null; premium_same: CI; aug: number; d_true: number }[];
  dec: { component: string; mean: number; lo: number; hi: number }[];
  dec4: { component: string; mean: number; lo: number; hi: number }[];
  sens: { tag: string; v1: number; v2: number; rule: number; prem_c: number; prem_c_lo: number; prem_c_hi: number; e_nom: number }[];
  cal: { mode: string; eps: number; cond: string; miss: number; lo: number; hi: number; width: number }[];
  probe: { tag: string; cond: string; budget: number | null; gain?: number; gain_lo?: number; gain_hi?: number; probes: number }[];
  bands: { cond: string; sim_year: number; p5: number; p50: number; p95: number }[];
  research?: { study: string; baseline: string; candidate: string; n_runs: number; savings_yr: CI; end_energy_kwh: CI; p5_miss_baseline: number; p5_miss_candidate: number; guard_alert_rate: number }[];
}

const usd = (x: number) => (Math.abs(x) >= 1e6 ? `$${(x / 1e6).toFixed(2)}M` : Math.abs(x) >= 1e3 ? `$${(x / 1e3).toFixed(1)}K` : `$${x.toFixed(0)}`);
const NAMES: Record<string, string> = { A: "A Conventional", B: "B REON bypass", C: "C PeakSure", D: "D PeakSure + VoI", C_T3: "C + Tier 3 resting SOC" };
const COL: Record<string, string> = { A: "#9aa6b8", B: "#79b0ff", C: "#7bd88f", D: "#3fb6a8", C_T3: "#c49cf2" };
const LAB: Record<string, string> = {
  fault_scenario: "Cell faults 0.2%/yr (scenario)", hvac_failing: "Failing HVAC", duration_1h: "1-h system", hvac_weak: "Weak HVAC",
  duration_4h: "4-h system", duration_3h: "3-h system", aging_sigma_high: "High ageing spread", dispatch_high: "Many dispatch days",
  switch_loss_0_005: "Switch loss 0.5%", "switch_loss_0.005": "Switch loss 0.5%", "discount_0.05": "Discount 5%", "headroom_0.20": "DC headroom 20%",
  "sigma_meas_0.04": "Cell estimate noise 4%", "discount_0.10": "Discount 10%", "headroom_0.05": "DC headroom 5%",
  "switch_loss_0.02": "Switch loss 2%", "sigma_meas_0.01": "Cell estimate noise 1%", chem_LFP: "LFP chemistry",
  "headroom_0.02": "DC headroom 2%", dispatch_low: "Few dispatch days", aging_sigma_low: "Low ageing spread",
  "switch_loss_0.034": "Switch loss 3.4% (0.25 mΩ, derived)", liquid_cooling: "Liquid cooling (~3 C spread)",
};

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="surface overflow-hidden">
      <div className="panel-h"><span className="micro">{title}</span>{sub && <span className="text-[11px] text-faint">{sub}</span>}</div>
      <div className="p-4 chart-scroll">{children}</div>
    </section>
  );
}

function Bars({ rows, w = 560 }: { rows: { label: string; v: number; lo: number; hi: number; color?: string }[]; w?: number }) {
  const mx = Math.max(...rows.map((r) => Math.max(Math.abs(r.hi), Math.abs(r.lo), Math.abs(r.v)))) * 1.05;
  const lw = 190, bw = w - lw - 70, rh = 22, x0 = lw + bw * (rows.some((r) => r.lo < 0) ? 0.25 : 0);
  const X = (v: number) => x0 + (v / mx) * (rows.some((r) => r.lo < 0) ? bw * 0.75 : bw);
  return (
    <svg width={w} height={rows.length * rh + 8} className="block">
      <line x1={X(0)} x2={X(0)} y1={0} y2={rows.length * rh} stroke="#2e353d" />
      {rows.map((r, i) => (
        <g key={r.label} transform={`translate(0,${i * rh + 4})`}>
          <text x={lw - 8} y={13} fill="#a2aab5" fontSize={11.5} textAnchor="end">{r.label}</text>
          <rect x={Math.min(X(0), X(r.v))} y={3} width={Math.abs(X(r.v) - X(0))} height={13} fill={r.color ?? (r.v >= 0 ? "#7bd88f" : "#f0736a")} opacity={0.85} rx={2} />
          <line x1={X(r.lo)} x2={X(r.hi)} y1={9.5} y2={9.5} stroke="#e8eaed" strokeWidth={1} opacity={0.6} />
          <text x={Math.max(X(r.v), X(r.hi)) + 6} y={13} fill="#e8eaed" fontSize={11} className="num">{r.v.toFixed(1)}</text>
        </g>
      ))}
    </svg>
  );
}

function Waterfall({ d, title }: { d: R["dec"]; title: string }) {
  const parts = d.filter((x) => x.component !== "Total");
  const tot = d.find((x) => x.component === "Total")!;
  let run = 0;
  const steps = parts.map((p) => { const s = { ...p, from: run, to: run + p.mean }; run += p.mean; return s; });
  const vals = [0, ...steps.flatMap((s) => [s.from, s.to]), tot.mean];
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const W = 520, H = 220, pad = 40, bw = (W - pad * 2) / (steps.length + 1) - 14;
  const Y = (v: number) => 20 + (H - 70) * (1 - (v - lo) / Math.max(hi - lo, 1));
  const short = (c: string) => c.replace(" (optimized commitment)", "").replace(" (bypass)", "").replace(" (cell twin)", "").replace(" (VoI probes)", "");
  return (
    <div>
      <div className="text-[12px] text-muted mb-1">{title}</div>
      <svg width={W} height={H}>
        <line x1={pad} x2={W - pad} y1={Y(0)} y2={Y(0)} stroke="#2e353d" />
        {steps.map((s, i) => {
          const x = pad + i * (bw + 14);
          return (
            <g key={s.component}>
              <rect x={x} y={Math.min(Y(s.from), Y(s.to))} width={bw} height={Math.max(1, Math.abs(Y(s.to) - Y(s.from)))} fill={s.mean >= 0 ? "#7bd88f" : "#f0736a"} opacity={0.85} />
              <text x={x + bw / 2} y={Math.min(Y(s.from), Y(s.to)) - 5} fill="#e8eaed" fontSize={11} textAnchor="middle" className="num">{usd(s.mean)}</text>
              <text x={x + bw / 2} y={H - 30} fill="#a2aab5" fontSize={10.5} textAnchor="middle">{short(s.component).split(" ").slice(0, 2).join(" ")}</text>
              <text x={x + bw / 2} y={H - 17} fill="#7f8996" fontSize={10} textAnchor="middle">{short(s.component).split(" ").slice(2).join(" ")}</text>
            </g>
          );
        })}
        <rect x={pad + steps.length * (bw + 14)} y={Math.min(Y(0), Y(tot.mean))} width={bw} height={Math.max(1, Math.abs(Y(tot.mean) - Y(0)))} fill="#e8eaed" opacity={0.85} />
        <text x={pad + steps.length * (bw + 14) + bw / 2} y={Math.min(Y(0), Y(tot.mean)) - 5} fill="#e8eaed" fontSize={11} textAnchor="middle" className="num">{usd(tot.mean)}</text>
        <text x={pad + steps.length * (bw + 14) + bw / 2} y={H - 30} fill="#a2aab5" fontSize={10.5} textAnchor="middle">Total</text>
      </svg>
    </div>
  );
}

export default function Results() {
  const [r, setR] = useState<R | null>(null);
  useEffect(() => { fetchJson<R>("/data/results.json").then(setR); }, []);
  if (!r) return <div className="site-shell"><AppBar /><div className="page-wrap text-faint">Loading…</div></div>;
  const sens = [...r.sens].sort((a, b) => b.prem_c - a.prem_c);
  const calRows = (mode: string) => r.cal.filter((x) => x.mode === mode).sort((a, b) => a.eps - b.eps);
  const probes = r.probe.filter((p) => p.budget != null && p.budget > 0 && p.gain !== undefined);
  const c0 = r.cal.find((x) => x.mode === "sys" && x.eps === 0 && x.cond === "C");
  const a0 = r.cal.find((x) => x.mode === "sys" && x.eps === 0 && x.cond === "A_opt");
  const narrow = c0 && a0 ? a0.width / c0.width : NaN;
  const v4 = r.probe.find((p) => p.cond === "D" && p.budget === 4), rr4 = r.probe.find((p) => p.cond === "D_rr" && p.budget === 4);
  const fewer = v4 && rr4 && v4.probes > 0 ? rr4.probes / v4.probes : NaN;
  const life = r.research?.find((x) => x.study === "lifetime" && x.candidate === "C_LC");
  const guarded = r.research?.find((x) => x.study === "guard_bias" && x.candidate === "C_G");
  const mixed = r.research?.find((x) => x.study === "mixed" && x.candidate === "C");
  return (
    <div className="site-shell">
      <AppBar />
      <div className="page-wrap max-w-[1280px]">
        <div className="eyebrow mb-3">Research findings</div>
        <h1 className="page-title mb-3">Where cell intelligence matters.</h1>
        <p className="text-muted text-[14px] max-w-[760px] leading-relaxed mb-6">A 15-year paired simulation of conventional strings, REON bypass, and PeakSure decision logic. Figures are model results, not hardware validation.</p>
        <div className="surface p-5 sm:p-7 text-[14px] leading-relaxed text-muted mb-5">
            <span className="eyebrow block mb-2">Main finding</span> On the modeled 2-hour EBS-equivalent plant doing coincident-peak duty, cell-level intelligence adds little
            (V1 + V2 = {usd(r.dec[1].mean + r.dec[2].mean)}/yr): energy rarely limits the decision, and peak-hour timing dominates. It pays where energy or
            cells bind: 1-h and 4-h systems, weak cooling, and cell faults.
        </div>
        <div className="grid sm:grid-cols-3 gap-3 mb-5">
          <div className="surface p-5"><div className="micro mb-2">Lifetime control</div><p className="text-[13px] text-muted leading-relaxed">{life ? `${Math.abs(Math.round(life.end_energy_kwh[0])).toLocaleString()} kWh ${life.end_energy_kwh[0] >= 0 ? "more" : "less"} deliverable energy at the horizon; ${usd(life.savings_yr[0])}/yr change in peak savings.` : "Exploratory resting-charge policy."}</p></div>
          <div className="surface p-5"><div className="micro mb-2">Twin uncertainty</div><p className="text-[13px] text-muted leading-relaxed">{guarded ? `Under injected bias, P5 miss: ${(guarded.p5_miss_baseline * 100).toFixed(1)}% → ${(guarded.p5_miss_candidate * 100).toFixed(1)}% with the pack-test envelope.` : "Independent pack-test safety envelope."}</p></div>
          <div className="surface p-5"><div className="micro mb-2">Mixed-age cells</div><p className="text-[13px] text-muted leading-relaxed">{mixed ? `${usd(mixed.savings_yr[0])}/yr for combined bypass and twin vs optimized conventional control, across ${mixed.n_runs} paired synthetic runs.` : "Synthetic same-chemistry cohorts."}</p></div>
        </div>
        <details className="surface disclosure"><summary>Explore the evidence</summary>
        <div className="results-grid p-4">

          <Card title="Where cell-level intelligence pays" sub="break-even premium, $/kWh nameplate (NPV C minus A_opt, 95% CI)">
            <Bars rows={sens.map((s) => ({ label: LAB[s.tag] ?? s.tag, v: s.prem_c, lo: s.prem_c_lo, hi: s.prem_c_hi }))} />
            <div className="text-[11.5px] text-faint mt-2">One change at a time from base (2-h EBS-equivalent plant, Na-ion, k_HVAC 0.25). Same optimized rule on both sides, so the rule effect is excluded.</div>
          </Card>

          <Card title="Main benchmark: 2-h modeled plant, 15 years" sub="mean of paired runs">
            <table className="w-full text-[12px] num">
              <thead className="text-faint"><tr><td className="font-sans">Condition</td><td className="text-right">Savings/yr</td><td className="text-right">Capture</td><td className="text-right">P5 miss</td><td className="text-right">Premium $/kWh</td></tr></thead>
              <tbody>
                {r.t1.map((t) => (
                  <tr key={t.cond} className="border-t border-line">
                    <td className="py-1.5 font-sans" style={{ color: COL[t.cond] }}>{NAMES[t.cond]}</td>
                    <td className="text-right">{usd(t.savings[0])}</td>
                    <td className="text-right">{(t.capture * 100).toFixed(1)}%</td>
                    <td className="text-right">{t.p5miss == null || t.cond === "A" || t.cond === "B" ? "–" : `${(t.p5miss * 100).toFixed(1)}%`}</td>
                    <td className="text-right">{t.cond === "A" ? "base" : `${t.premium_same[0].toFixed(1)} [${t.premium_same[1].toFixed(1)}, ${t.premium_same[2].toFixed(1)}]`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-[11.5px] text-faint mt-2">Capture = shaved kW at the actual peak hour. P5 miss = share of peaks where true energy fell below the predicted 5th percentile (target 5%).</div>
          </Card>

          {r.research?.length ? <Card title="Research extensions" sub="paired simulation · assumed mixed-age cohorts">
            <table className="w-full min-w-[540px] text-[12px] num">
              <thead className="text-faint"><tr><td className="font-sans">Study · comparison</td><td className="text-right">Δ savings/yr</td><td className="text-right">Δ end energy</td><td className="text-right">P5 miss</td></tr></thead>
              <tbody>{r.research.map((x) => <tr key={`${x.study}-${x.candidate}`} className="border-t border-line">
                <td className="py-2 font-sans">{x.study.replaceAll("_", " ")} · {x.candidate} vs {x.baseline}</td>
                <td className="text-right">{usd(x.savings_yr[0])}</td><td className="text-right">{Math.round(x.end_energy_kwh[0]).toLocaleString()} kWh</td>
                <td className="text-right">{(x.p5_miss_baseline * 100).toFixed(1)}% → {(x.p5_miss_candidate * 100).toFixed(1)}%</td>
              </tr>)}</tbody>
            </table>
            <p className="text-[11px] text-faint mt-3">Exploratory model results. Per-cell resting SOC and initial mixed-age history are assumed; independent hardware validation remains open.</p>
          </Card> : null}

          <Card title="Where the value comes from" sub="$/yr, Shapley over hardware x information">
            <Waterfall d={r.dec} title="2-h modeled plant (base), A to D" />
            <Waterfall d={r.dec4} title="4-h system, A to C" />
          </Card>

          <Card title="Twin calibration under model mismatch" sub="P5 miss rate, target 5%">
            {(["sys", "rnd"] as const).map((mode) => (
              <div key={mode} className="mb-3">
                <div className="text-[12px] text-muted mb-1">{mode === "sys" ? "Systematic: twin underestimates fade by eps, cell reports +eps/10" : "Random: cell estimate noise x (1 + 10 eps)"}</div>
                <table className="w-full text-[12px] num">
                  <thead className="text-faint"><tr><td>eps</td><td className="text-right">Pack-level</td><td className="text-right">Cell twin</td></tr></thead>
                  <tbody>
                    {Array.from(new Set(calRows(mode).map((x) => x.eps))).map((e) => {
                      const a = calRows(mode).find((x) => x.eps === e && x.cond === "A_opt")!;
                      const c = calRows(mode).find((x) => x.eps === e && x.cond === "C")!;
                      const bad = c.miss > 0.07 || c.miss < 0.03;
                      return (
                        <tr key={e} className="border-t border-line">
                          <td className="py-1">{(e * 100).toFixed(0)}%</td>
                          <td className="text-right">{(a.miss * 100).toFixed(1)}% <span className="text-faint">w {(a.width * 100).toFixed(1)}%</span></td>
                          <td className="text-right" style={{ color: bad ? "var(--error)" : "var(--ok)" }}>{(c.miss * 100).toFixed(1)}% <span className="text-faint">w {(c.width * 100).toFixed(1)}%</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
            <div className="text-[11.5px] text-faint">The cell twin is calibrated and {narrow.toFixed(0)}x narrower at zero mismatch, but systematic bias makes it confidently wrong. The separate research study tests a conservative pack-test envelope and a diagnostic mismatch alert.</div>
          </Card>

          <Card title="VoI probing (4-h system)" sub="extra $/yr vs no probing, paired">
            <table className="w-full text-[12px] num">
              <thead className="text-faint"><tr><td className="font-sans">Policy</td><td className="text-right">Budget</td><td className="text-right">Probes used</td><td className="text-right">Gain [95% CI]</td></tr></thead>
              <tbody>
                {probes.sort((a, b) => (a.budget! - b.budget!) || a.cond.localeCompare(b.cond)).map((p, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className="py-1 font-sans">{p.cond === "D" ? "VoI (PeakSure)" : p.cond === "D_rr" ? "Round-robin" : "Random"}</td>
                    <td className="text-right">{p.budget}</td><td className="text-right">{p.probes.toFixed(2)}</td>
                    <td className="text-right">{usd(p.gain!)} [{usd(p.gain_lo!)}, {usd(p.gain_hi!)}]</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-[11.5px] text-faint mt-2">Small. At budget 4, VoI used {fewer.toFixed(0)}x fewer probes than round-robin for a comparable gain ({usd(v4?.gain ?? NaN)} vs {usd(rr4?.gain ?? NaN)}), because it declines probes that would not change the commitment.</div>
          </Card>

          <Card title="Lifetime: deliverable energy at 25 C" sub="median over runs, kWh">
            <Lifetime bands={r.bands} />
          </Card>
        </div></details>
      </div>
    </div>
  );
}

function Lifetime({ bands }: { bands: R["bands"] }) {
  const W = 540, H = 220, pad = 44;
  const all = bands.map((b) => b.p50);
  const lo = Math.min(...all) * 0.97, hi = Math.max(...all) * 1.02;
  const X = (y: number) => pad + (y / 14) * (W - pad - 12), Y = (v: number) => 12 + (H - 40) * (1 - (v - lo) / (hi - lo));
  return (
    <svg width={W} height={H}>
      {[0, 4, 9, 14].map((y) => <text key={y} x={X(y)} y={H - 8} fill="#7f8996" fontSize={10.5} textAnchor="middle">yr {y + 1}</text>)}
      {[lo, (lo + hi) / 2, hi].map((v) => <text key={v} x={pad - 6} y={Y(v) + 3} fill="#7f8996" fontSize={10.5} textAnchor="end" className="num">{Math.round(v)}</text>)}
      {["A", "B", "C", "C_T3"].map((c) => {
        const b = bands.filter((x) => x.cond === c).sort((a, z) => a.sim_year - z.sim_year);
        return <path key={c} d={b.map((x, i) => `${i ? "L" : "M"}${X(x.sim_year)},${Y(x.p50)}`).join("")} stroke={COL[c]} strokeWidth={2} fill="none" />;
      })}
      {["A", "B", "C", "C_T3"].map((c, i) => <text key={c} x={pad + 8 + i * 120} y={14} fill={COL[c]} fontSize={11}>{NAMES[c]}</text>)}
    </svg>
  );
}
