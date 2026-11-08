"use client";
import { Constants } from "@/engine/data";
import { Scenario } from "@/engine/scenario";

const statusClass = (status: string) => status === "UNKNOWN" ? "text-[#9b5639]" : status === "ASSUMED" ? "text-[#83631e]" : "text-[#147453]";

export default function CESProfile({ c, scenario }: { c: Constants; scenario: Scenario | null }) {
  const p = c.product_profile;
  const duration = scenario ? scenario.eNom / c.p_max_kw : null;
  return <section className="grid md:grid-cols-3 gap-3 mb-5 text-[12px] leading-relaxed" aria-label="Product, use case, and model provenance">
    <div className="surface p-4">
      <div className="micro mb-2">REON product · {p.name}</div>
      <div><b>Up to {(p.rated_power_kw.value / 1000).toFixed(1)} MW / {(p.rated_energy_kwh.value / 1000).toFixed(1)} MWh</b> <span className={statusClass(p.rated_power_kw.status)}>{p.rated_power_kw.status}</span></div>
      <div>{p.ac_interface.value} <span className={statusClass(p.ac_interface.status)}>{p.ac_interface.status}</span> · AC interface, not battery DC voltage</div>
      <div>~{p.rated_duration_h.value} h nameplate ratio <span className={statusClass(p.rated_duration_h.status)}>{p.rated_duration_h.status}</span>; usable AC duration is unconfirmed.</div>
      <div>CES chemistry and cell/DC topology <span className={statusClass(p.chemistry.status)}>UNKNOWN</span>.</div>
      <div className="text-faint mt-1">Current <a className="underline" href="https://www.reoncorp.com/hardware" target="_blank" rel="noreferrer">REON hardware page</a> says CESS; the project-cited REON PDF says CES. The PDF is not stored in this repository.</div>
    </div>
    <div className="surface p-4">
      <div className="micro mb-2">PeakSure use case</div>
      <div>Coincident-peak shaving for a Massachusetts municipal light plant in ISO-NE.</div>
      <div className="text-faint mt-1">Selected research application. No CES installation at a specific MLP is asserted.</div>
      {scenario && <div className="mt-2"><b>Selected battery scenario:</b> {scenario.durationKey} / {(scenario.eNom / 1000).toFixed(1)} MWh nominal model input {duration === p.rated_duration_h.value ? <span className={statusClass("ASSUMED")}>ASSUMED rating boundary</span> : <span className={statusClass("ASSUMED")}>ASSUMED duration scenario</span>}</div>}
    </div>
    <div className="surface p-4">
      <div className="micro mb-2">Physical model · ASSUMED</div>
      <div>{c.chemistry} proxy; {scenario?.sys.nStrings ?? c.n_strings} strings × {scenario?.sys.nSeries ?? c.n_series} model cell units; N_min {scenario?.sys.nMin ?? Math.round(c.n_series * (1 - c.headroom))}.</div>
      <div>{((scenario?.sys.eta ?? c.eta) * 100).toFixed(0)}% assumed cell-to-AC efficiency. CES energy-rating boundary and DC window <span className={statusClass("UNKNOWN")}>UNKNOWN</span>.</div>
      <div>Switch loss {((scenario?.sys.switchLoss ?? c.switch_loss) * 100).toFixed(1)}% <span className={statusClass("ASSUMED")}>ASSUMED</span>; actual CES switch resistance <span className={statusClass("UNKNOWN")}>UNKNOWN</span>.</div>
      <div className="text-faint mt-1">{c.model_boundary}</div>
      <div className="text-faint mt-1">This independent simulation does not validate CES hardware or claim its internal wiring.</div>
    </div>
  </section>;
}
