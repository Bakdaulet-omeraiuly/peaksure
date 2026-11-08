"use client";
// Assumptions per case and per battery type. Values come from the exported model config (constants.json,
// strategy.json); statuses follow peaksure/products.py and config.SYSTEM_FLAGS.
import { useEffect, useState } from "react";
import AppBar from "@/components/AppBar";
import { Constants, fetchJson } from "@/engine/data";

type Strategy = { assumptions: { premium: { low: number; high: number }; retrofit_cost: { low: number; central: number; high: number }; discount_rate: number; life_years: number };
  chemistries: { name: string; price: { low: number; central: number; high: number } }[] };
const COLOR: Record<string, string> = { CONFIRMED: "#2f9a6a", "REON CLAIM": "#b07a1f", DERIVED: "#4f7f9b", LITERATURE: "#6b6bb0", ASSUMED: "#8a6d3b", UNKNOWN: "#a33a30" };
const B = ({ s }: { s: string }) => <span className="inline-block rounded px-1.5 py-[1px] text-[10px] font-semibold text-white whitespace-nowrap" style={{ background: COLOR[s] }}>{s}</span>;

export default function Assumptions() {
  const [c, setC] = useState<Constants | null>(null);
  const [s, setS] = useState<Strategy | null>(null);
  useEffect(() => { fetchJson<Constants>("/data/constants.json").then(setC); fetchJson<Strategy>("/data/strategy.json").then(setS); }, []);
  if (!c || !s) return <div className="site-shell"><AppBar /><main className="page-wrap text-muted text-[13px]">Loading…</main></div>;
  const nMin = Math.round(c.n_series * (1 - c.headroom));
  const blocks = Math.round(c.p_max_kw / 30);
  const a = s.assumptions;

  // [assumption, A conventional, B REON EBS bypass, C REON EBS + PeakSure, status]
  const rows: [string, string, string, string, string][] = [
    ["Wiring", "Fixed series strings: first empty cell stops its string", "Per-cell bypass: string runs while ≥ N_min cells", "Same as B", "ASSUMED"],
    ["What the operator knows", "Annual whole-battery capacity test", "Annual whole-battery capacity test", `Per-cell twin (±${Math.round(c.sigma_meas * 100)}% cell estimate)`, "ASSUMED"],
    ["How it commits", "Full power for as many hours as P5 allows", "Same as A", `Best expected saving with ${Math.round((1 - c.alpha) * 100)}% delivery confidence`, "ASSUMED"],
    ["Cells", "Identical cells in all three cases (same seed and draws)", "", "", "ASSUMED"],
    ["Layout (simulation abstraction)", `${c.n_strings} strings × ${c.n_series} cells`, `${c.n_strings} × ${c.n_series}, N_min ${nMin} (${Math.round(c.headroom * 100)}% headroom)`, "Same as B", "ASSUMED"],
    ["Switch loss", "None", `${(c.switch_loss * 100).toFixed(1)}% (≈ I·R_on / V_cell)`, "Same as B", "ASSUMED"],
    ["Inverter efficiency", `${Math.round(c.eta * 100)}%`, `${Math.round(c.eta * 100)}%`, `${Math.round(c.eta * 100)}%`, "ASSUMED"],
    ["Cooling", `Container ${c.t_hvac_set} °C setpoint, k = ${c.k_hvac}; cell spread σ ${c.sigma_t_cell} °C`, "Same", "Same", "ASSUMED"],
  ];
  const shared: [string, string, string][] = [
    ["Plant size", `${c.p_max_kw / 1000} MW / ${c.durations["2h"] / 1000} MWh (≈ ${blocks} EBS blocks of 30 kW / 60 kWh); 1-h and 4-h sizes are hypothetical`, "ASSUMED"],
    ["EBS block rating", "30 kW / 60 kWh (REON hardware page; AC/DC basis not stated)", "CONFIRMED"],
    ["Chemistry", `Base: ${c.chemistry}, ageing fitted to TUM sodium-ion lab data. Option: LFP (lithium iron phosphate) with literature parameters`, "LITERATURE"],
    ["Prices by chemistry", s.chemistries.map((x) => `${x.name} $${Math.round(x.price.low)}–${Math.round(x.price.high)}/kWh`).join(" · "), "ASSUMED"],
    ["Use case", "Massachusetts municipal light plant shaving ISO-NE monthly and annual peaks", "ASSUMED"],
    ["Peak charges", `ISO-NE RNS $${c.rns_2026}/kW-yr (2026); FCA $${c.fca_kw_month}/kW-month`, "CONFIRMED"],
    ["Peak events", "Real ISO-NE system peaks 2019–2025; peak day assumed known, hour uncertain", "DERIVED"],
    ["Horizon", `${c.years} years from ${c.start_year}; cells added when usable energy falls below ${Math.round(c.eol_retention * 100)}% of nameplate`, "ASSUMED"],
  ];
  const stages: [string, string, string][] = [
    ["Stage 1 · retrofit cost", `$${a.retrofit_cost.low}–${a.retrofit_cost.high}/kWh (central $${a.retrofit_cost.central}); no battery cost`, "ASSUMED"],
    ["Stage 1 · compatibility", "REON BMS works on another vendor's battery without voiding warranty or UL 9540 listing", "UNKNOWN"],
    ["Stage 2 · EBS price", `${Math.round(a.premium.low * 100)}% to +${Math.round(a.premium.high * 100)}% vs a conventional battery`, "ASSUMED"],
    ["Stage 2 · installed price", s.chemistries.map((x) => `${x.name} central $${Math.round(x.price.central)}/kWh`).join(" · "), "ASSUMED"],
    ["Finance", `${Math.round(a.discount_rate * 100)}% discount rate, ${a.life_years}-year life`, "ASSUMED"],
  ];
  const T = ({ rows: rr }: { rows: [string, string, string][] }) => <table className="w-full text-[12.5px]"><tbody>
    {rr.map(([k, v, st]) => <tr key={k} className="border-t border-line align-top"><td className="py-2 pr-3 font-medium text-ink w-[30%]">{k}</td><td className="py-2 pr-3 text-muted">{v}</td><td className="py-2 text-right"><B s={st} /></td></tr>)}
  </tbody></table>;

  return <div className="site-shell"><AppBar />
    <main className="page-wrap max-w-[1100px]">
      <div className="eyebrow mb-3">Assumptions</div>
      <h1 className="page-title mb-5">What we assume, case by case.</h1>

      <div className="grid md:grid-cols-3 gap-3 mb-4">
        {[["Conventional battery", "Case A", "Same Na-ion cells as REON EBS, fixed series strings, conventional BMS, no bypass.", "ASSUMED"],
          ["REON EBS Na+", "Cases B, C", "Sodium-ion EBS with REON's cell-level BMS. Rating from REON; cells, wiring and switches are our assumptions.", "REON CLAIM"],
          ["Lithium-ion (LFP)", "Cases A, B, C · chemistry option", "Same three cases rerun with LFP cells: cheaper, flat voltage curve. Represents the EBS Li+ option.", "LITERATURE"]]
          .map(([t, k, d, st]) => <div key={t} className="surface p-4"><div className="flex justify-between items-center mb-1"><span className="font-semibold">{t}</span><B s={st} /></div>
            <div className="micro mb-1">{k}</div><p className="text-[12.5px] text-muted leading-relaxed">{d}</p></div>)}
      </div>

      <section className="surface p-5 mb-4 overflow-x-auto">
        <div className="eyebrow mb-2">By case</div>
        <table className="w-full text-[12.5px] min-w-[760px]"><thead><tr className="text-left text-faint"><th className="py-1 pr-3 w-[18%]"></th><th className="py-1 pr-3">A · Conventional</th><th className="py-1 pr-3">B · REON EBS (bypass)</th><th className="py-1 pr-3">C · REON EBS + PeakSure</th><th></th></tr></thead>
          <tbody>{rows.map(([k, x, y, z, st]) => <tr key={k} className="border-t border-line align-top">
            <td className="py-2 pr-3 font-medium text-ink">{k}</td>
            {y === "" ? <td className="py-2 pr-3 text-muted" colSpan={3}>{x}</td> : <><td className="py-2 pr-3 text-muted">{x}</td><td className="py-2 pr-3 text-muted">{y}</td><td className="py-2 pr-3 text-muted">{z}</td></>}
            <td className="py-2 text-right"><B s={st} /></td></tr>)}</tbody></table>
      </section>

      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <section className="surface p-5"><div className="eyebrow mb-2">Shared by all cases</div><T rows={shared} /></section>
        <section className="surface p-5"><div className="eyebrow mb-2">Two-stage plan</div><T rows={stages} /></section>
      </div>
      <p className="text-[11.5px] text-faint leading-relaxed">CONFIRMED: primary source · REON CLAIM: stated by REON, not verified · DERIVED: calculated from sourced data · LITERATURE: published research · ASSUMED: our choice · UNKNOWN: no reliable source. Everything here is a simulation input, not REON hardware validation.</p>
    </main></div>;
}
