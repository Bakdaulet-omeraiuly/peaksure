"use client";
import { useEffect, useRef, useState } from "react";
import { Scenario } from "@/engine/scenario";
import { Constants } from "@/engine/data";
import { useStudio } from "@/state/store";

const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(Math.floor(m % 60)).padStart(2, "0")}`;

export default function Timeline({ scenario, c }: { scenario: Scenario; c: Constants }) {
  const { minute, playing, speed, town, set } = useStudio();
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(900);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((e) => setW(e[0].contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  // playback loop
  useEffect(() => {
    if (!playing) return;
    let raf = 0, prev = performance.now();
    const tick = (t: number) => {
      const dt = (t - prev) / 1000; prev = t;
      const m = useStudio.getState().minute + dt * speed * 10;
      const A = scenario.ops.A, C = scenario.ops.C;
      const end = Math.max(A.run.startMin + A.run.nFrames, C.run.startMin + C.run.nFrames) + 45;
      if (m >= Math.min(end, 1439)) { set({ minute: Math.min(end, 1439), playing: false }); return; }
      set({ minute: m });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, scenario, set]);

  const ev = scenario.event;
  const peakMw = c.towns[town]?.peak_mw ?? 13.6;
  const mx = Math.max(...ev.load);
  const townLoad = ev.load.map((v) => (v / mx) * peakMw);         // hourly, MW (HE 1..24)
  const H = 150, padL = 44, padR = 12, padT = 14, padB = 22;
  const iw = w - padL - padR, ih = H - padT - padB;
  const minL = Math.min(...townLoad) * 0.8 - 2.5, maxL = peakMw * 1.04;
  const X = (min: number) => padL + (min / 1440) * iw;
  const Y = (mw: number) => padT + ih - ((mw - minL) / (maxL - minL)) * ih;
  const loadAt = (min: number) => {               // piecewise-linear between hour midpoints
    const h = min / 60 - 0.5;
    const i = Math.max(0, Math.min(22, Math.floor(h)));
    const t = Math.min(1, Math.max(0, h - i));
    return townLoad[i] * (1 - t) + townLoad[i + 1] * t;
  };
  const path = (fn: (m: number) => number) => {
    let d = "";
    for (let m = 0; m <= 1440; m += 5) d += `${m ? "L" : "M"}${X(m).toFixed(1)},${Y(fn(m)).toFixed(1)}`;
    return d;
  };
  const net = (key: "A" | "C") => (m: number) => loadAt(m) - (scenario.ops[key].run.powerKw[Math.min(1439, Math.floor(m))] ?? 0) / 1000;
  const onDrag = (e: React.PointerEvent) => {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    const m = ((e.clientX - r.left - padL) / iw) * 1440;
    set({ minute: Math.max(0, Math.min(1439, m)), playing: false });
  };
  const winRect = (key: "A" | "C", y: number, color: string) => {
    const d = scenario.ops[key].decision;
    if (d.powerKw <= 0) return null;
    return <rect x={X((d.startHe - 1) * 60)} width={X((d.startHe - 1 + d.windowH) * 60) - X((d.startHe - 1) * 60)} y={y} height={5} fill={color} rx={1.5} />;
  };
  const jump = () => {
    const s = Math.min(scenario.ops.A.decision.startHe, scenario.ops.C.decision.startHe);
    set({ minute: (s - 1) * 60 - 20, playing: true });
  };

  return (
    <div className="flex flex-col pt-2">
      <div className="flex flex-wrap items-center justify-between gap-2 px-2 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="micro">Peak day</span>
          <span className="text-[11px] text-muted">{ev.date} · {town} · {peakMw} MW peak</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-accent" onClick={jump}>Run the peak</button>
          <button className="btn" onClick={() => set({ playing: !playing })}>{playing ? "Pause" : "Play"}</button>
          <div className="seg">
            {[1, 4, 12].map((s) => <button key={s} data-on={speed === s} onClick={() => set({ speed: s })}>{s}x</button>)}
          </div>
          <span className="num text-[13px] w-12 text-right">{fmt(minute)}</span>
        </div>
      </div>
      <div ref={ref} className="px-0 min-w-0 overflow-hidden">
        <svg width={w} height={H} onPointerDown={onDrag} onPointerMove={(e) => e.buttons && onDrag(e)} style={{ cursor: "ew-resize", display: "block" }}>
          {(w < 540 ? [0, 6, 12, 18, 24] : [0, 3, 6, 9, 12, 15, 18, 21, 24]).map((h) => (
            <g key={h}>
              <line x1={X(h * 60)} x2={X(h * 60)} y1={padT} y2={padT + ih} stroke="#161b20" />
              <text x={X(h * 60)} y={H - 6} fill="#7f8996" fontSize={10.5} textAnchor="middle" className="num">{String(h).padStart(2, "0")}:00</text>
            </g>
          ))}
          {[Math.ceil(minL / 2) * 2, Math.round((minL + maxL) / 4) * 2, Math.floor(maxL / 2) * 2].map((v) => (
            <g key={v}><line x1={padL} x2={padL + iw} y1={Y(v)} y2={Y(v)} stroke="#12161a" />
              <text x={padL - 6} y={Y(v) + 3} fill="#7f8996" fontSize={10.5} textAnchor="end" className="num">{v} MW</text></g>
          ))}
          <rect x={X((ev.he - 1) * 60)} width={X(ev.he * 60) - X((ev.he - 1) * 60)} y={padT} height={ih} fill="#f0736a" opacity={0.1} />
          <text x={X((ev.he - 0.5) * 60)} y={padT + 10} fill="#f0736a" fontSize={10.5} textAnchor="middle">actual peak HE{ev.he}</text>
          <path d={path(loadAt)} stroke="#e8eaed" strokeWidth={1.6} fill="none" />
          <path d={path(net("A"))} stroke="#9aa6b8" strokeWidth={1.4} fill="none" strokeDasharray="4 3" />
          <path d={path(net("C"))} stroke="#7bd88f" strokeWidth={1.8} fill="none" />
          {winRect("A", padT + ih - 14, "#9aa6b8")}
          {winRect("C", padT + ih - 7, "#7bd88f")}
          <line x1={X(minute)} x2={X(minute)} y1={padT - 4} y2={padT + ih} stroke="#79b0ff" strokeWidth={1.5} />
          {w >= 540 && <g transform={`translate(${padL + 8},${padT + 4})`} fontSize={10.5}>
            <line x1={0} x2={14} y1={0} y2={0} stroke="#e8eaed" strokeWidth={1.6} /><text x={18} y={3} fill="#a2aab5">town load</text>
            <line x1={80} x2={94} y1={0} y2={0} stroke="#9aa6b8" strokeDasharray="4 3" /><text x={98} y={3} fill="#a2aab5">net, conventional</text>
            <line x1={200} x2={214} y1={0} y2={0} stroke="#7bd88f" strokeWidth={1.8} /><text x={218} y={3} fill="#a2aab5">net, REON + PeakSure</text>
          </g>}
        </svg>
      </div>
    </div>
  );
}
