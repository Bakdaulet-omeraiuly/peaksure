"use client";
// Product facts vs model inputs, each with its evidence status (exported from peaksure/products.py).
import { useEffect, useState } from "react";
import { fetchJson } from "@/engine/data";
import { ProductsFile, PARAM_LABELS, specText } from "@/engine/products";

const COLOR: Record<string, string> = {
  CONFIRMED: "#2f9a6a", "REON CLAIM": "#b07a1f", DERIVED: "#4f7f9b", LITERATURE: "#6b6bb0",
  ASSUMED: "#8a6d3b", UNKNOWN: "#a33a30", "MODEL OUTPUT": "#5b6575",
};

export default function EvidencePanel() {
  const [d, setD] = useState<ProductsFile | null>(null);
  useEffect(() => { fetchJson<ProductsFile>("/data/products.json").then(setD).catch(() => setD(null)); }, []);
  if (!d) return null;
  const cols = [...d.products, d.model];
  const keys = Object.keys(PARAM_LABELS);
  return (
    <details className="surface disclosure mt-4">
      <summary>Product facts vs model assumptions (sources checked {d.checked})</summary>
      <div className="p-3 text-[11.5px] text-muted leading-relaxed">
        <p className="mb-2"><b className="text-ink">Use case (modelled, not a deployment):</b> {d.use_case.modelled}. {d.use_case.note} Not modelled: {d.use_case.not_modelled.join(", ")}.</p>
        <p className="mb-2">REON says CESS and OES are white-label; EBS carries its cell-level BMS. The CESS rating is used only as the comparison size. The REON-style bypass batteries (B, C) are a schematic model: none of the cell counts, N_min, efficiency or switch values below are REON specifications unless marked CONFIRMED.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] border-collapse min-w-[760px]">
            <thead><tr className="text-faint text-left"><th className="py-1 pr-2">Parameter</th>{cols.map((p) => <th key={p.key} className="py-1 pr-2">{p.name}</th>)}</tr></thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k} className="border-t border-line align-top">
                  <td className="py-1 pr-2 text-ink">{PARAM_LABELS[k]}</td>
                  {cols.map((p) => {
                    const s = p.specs[k];
                    return <td key={p.key} className="py-1 pr-2" title={[s?.note, s?.source].filter(Boolean).join(" · ")}>
                      <span className="inline-block rounded px-1 mr-1 text-[9.5px] font-semibold text-white" style={{ background: COLOR[s?.status ?? "UNKNOWN"] }}>{s?.status ?? "UNKNOWN"}</span>
                      {specText(s)}
                    </td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-faint">Hover a cell for the note and source. Status meanings: CONFIRMED primary source · REON CLAIM stated by REON, unverified · DERIVED calculated from sourced values · LITERATURE published research · ASSUMED model choice · UNKNOWN no reliable source · MODEL OUTPUT computed by PeakSure.</p>
      </div>
    </details>
  );
}
