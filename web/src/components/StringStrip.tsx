"use client";
// One series string, every cell drawn as a bar (the REON "weakest cell" picture, from live model state).
// Bar outline = nominal capacity; grey cap = capacity lost to ageing; fill = charge left.
import { useMemo, useState } from "react";
import { Scenario } from "@/engine/scenario";
import { cellState, frameOf } from "@/engine/cellview";
import { useStudio } from "@/state/store";
import { Slot, STATE_COLORS } from "./Battery3D";
import { BATTERY_NAMES } from "@/engine/labels";

const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(Math.floor(m % 60)).padStart(2, "0")}`;

export default function StringStrip({ scenario, view, slots }: { scenario: Scenario; view: "peak" | "drain"; slots: Slot[] }) {
  const minute = useStudio((s) => (view === "drain" ? s.drainMin : s.minute));
  const c = scenario;
  const S = c.sys.nStrings, N = c.sys.nSeries, SN = S * N;
  const weakest = useMemo(() => {
    const q = c.ops.A.qRel;
    let mi = 0;
    for (let i = 1; i < SN; i++) if (q[i] < q[mi]) mi = i;
    return Math.floor(mi / N);
  }, [c, SN, N]);
  const [pick, setPick] = useState<number | null>(null);
  const s = pick ?? weakest;
  const off = s * N;

  const W = 960, H = 58, LBL = 0, bw = W / N, qMax = 1.12;
  const y = (v: number) => H - (Math.min(v, qMax) / qMax) * H;

  const rows = slots.map((k) => {
    const op = c.ops[k];
    const run = view === "drain" ? op.drain! : op.run;
    const f = frameOf(run, minute);
    const d: Record<string, string> = { lost: "", charged: "", stranded: "", culprit: "", bypassed: "", mark: "" };
    let strandedKwh = 0, charged = 0, bypassed = 0, culpritJ = -1;
    for (let j = 0; j < N; j++) {
      const i = off + j, x = LBL + j * bw, w = Math.max(bw - 0.9, 1);
      const q = op.qRel[i], soc = run.soc[f * SN + i];
      const st = cellState(run, op.tier, f, i, N, S);
      if (q < 1) d.lost += `M${x},${y(1)}h${w}V${y(q)}h${-w}Z`;
      const top = y(q * soc);
      if (st === "culprit") { d.culprit += `M${x - 0.6},${y(1)}h${w + 1.2}V${H}h${-w - 1.2}Z`; culpritJ = j; continue; }
      const key = st === "stranded" ? "stranded" : st === "bypassed" ? "bypassed" : st === "empty" ? "" : "charged";
      if (key && soc > 0.002) d[key] += `M${x},${top}h${w}V${H}h${-w}Z`;
      if (st === "bypassed") { d.mark += `M${x},${H + 3}h${w}v3h${-w}Z`; bypassed++; }
      if (st === "stranded") { strandedKwh += (soc * run.fullAh[i] * c.chem.vNom) / 1000; charged++; }
      else if (st === "charged" && soc > 0.002) charged++;
    }
    const stop = run.events.find((e) => e.kind === "string-stop" && e.string === s && e.minute <= minute);
    return { k, op, run, d, strandedKwh, charged, bypassed, culpritJ, stop };
  });

  const t = (m: number) => (view === "drain" ? `t+${Math.round(m)} min` : clock(m));

  return (
    <div className="px-4 pb-4 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div>
          <div className="micro">Inside one string: {N} cells in series, one shared current</div>
          <div className="text-[11px] text-muted mt-0.5">
            In a fixed string the first cell to empty stops the whole string, and the charge left in the other cells is stranded.
            REON switches that cell out and the string keeps running until fewer than {c.sys.nMin} cells remain.
          </div>
        </div>
        <div className="seg">
          {Array.from({ length: S }, (_, i) => (
            <button key={i} data-on={i === s} onClick={() => setPick(i)} title={i === weakest ? "contains the weakest conventional cell" : undefined}>
              String {i + 1}{i === weakest ? " *" : ""}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {rows.map((r) => (
          <div key={r.k}>
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-[11px] mb-1">
              <span className="font-semibold text-[12px]">{BATTERY_NAMES[r.k]}</span>
              <span className="num text-muted">
                {r.stop
                  ? <>stopped at {t(r.stop.minute)} · <span style={{ color: "#b77712" }}>{r.charged} cells still charged · {r.strandedKwh.toFixed(1)} kWh stranded</span></>
                  : <>running{r.bypassed ? ` · ${r.bypassed} cells switched out` : ""}</>}
              </span>
            </div>
            <svg viewBox={`-2 -14 ${W + 4} ${H + 22}`} className="w-full block" style={{ background: "#0b0f12", borderRadius: 6 }}>
              <line x1={0} x2={W} y1={y(1)} y2={y(1)} stroke="#2c353d" strokeDasharray="3 3" />
              <path d={r.d.lost} fill="#5d646c" opacity={0.55} />
              <path d={r.d.charged} fill="#3fbf7f" />
              <path d={r.d.stranded} fill={STATE_COLORS.stranded} />
              <path d={r.d.bypassed} fill="#53657f" />
              <path d={r.d.mark} fill="#7d93b8" />
              <path d={r.d.culprit} fill={STATE_COLORS.culprit} />
              {r.culpritJ >= 0 && (
                <text x={Math.min(Math.max(r.culpritJ * bw, 60), W - 60)} y={-4} fill="#ff8a7d" fontSize={10.5} textAnchor="middle">
                  cell {s + 1}-{r.culpritJ + 1} empty: whole string stops
                </text>
              )}
            </svg>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10.5px] text-muted mt-2">
        <span><Sw c="#3fbf7f" /> charge left</span>
        <span><Sw c="#5d646c" /> capacity lost to ageing</span>
        <span><Sw c={STATE_COLORS.culprit} /> empty cell that stopped a fixed string</span>
        <span><Sw c={STATE_COLORS.stranded} /> stranded charge (string stopped)</span>
        <span><Sw c="#7d93b8" /> switched out by REON</span>
        <span>dashed line = nominal capacity</span>
      </div>
    </div>
  );
}

const Sw = ({ c }: { c: string }) => <span className="inline-block w-2.5 h-2.5 rounded-[2px] align-[-1px] mr-1" style={{ background: c }} />;
