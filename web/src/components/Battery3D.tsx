"use client";
import { Canvas, useFrame, useThree, ThreeEvent } from "@react-three/fiber";
import { Line, OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Scenario, OperatorResult } from "@/engine/scenario";
import { DischargeResult } from "@/engine/discharge";
import { cellDiffers, cellState, frameOf } from "@/engine/cellview";
import { BATTERY_NAMES } from "@/engine/labels";
import { useStudio, ColorMode } from "@/state/store";

// Schematic container: 8 racks (strings) in 4 columns x 2 tiers, all facing the viewer.
const COLS = 12, ROWS = 20, P = 0.07, CELL: [number, number, number] = [0.058, 0.058, 0.16];
const RACK_X = [-1.44, -0.48, 0.48, 1.44];
const TIER_Y = [1.78, 0.18];                       // strings 0-3 top tier, 4-7 bottom tier
const SHELL = { w: 4.15, h: 3.42, d: 0.62 };
const GAP = 0.55;
type AssemblyView = "assembled" | "exploded" | "cutaway";

export type Slot = "A" | "B" | "C";
export const slotsFor = (view: "peak" | "drain"): Slot[] => (view === "peak" ? ["A", "B", "C"] : ["A", "B"]);

function cellPos(s: number, j: number) {
  const rack = s % 4, tier = s < 4 ? 0 : 1;
  const col = j % COLS, row = Math.floor(j / COLS);
  return new THREE.Vector3(RACK_X[rack] + (col - (COLS - 1) / 2) * P, TIER_Y[tier] + row * P, 0);
}

function rackOffset(s: number, view: AssemblyView) {
  if (view !== "exploded") return new THREE.Vector3();
  const rack = s % 4, tier = s < 4 ? 0 : 1;
  return new THREE.Vector3((rack - 1.5) * 0.12, tier === 0 ? 0.14 : -0.14, 0.24 + Math.abs(rack - 1.5) * 0.035);
}

const ramp = (stops: [number, string][], v: number, out: THREE.Color) => {
  const x = Math.min(1, Math.max(0, v));
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i][0]) {
      const [a, ca] = stops[i - 1], [b, cb] = stops[i];
      return out.set(ca).lerp(new THREE.Color(cb), (x - a) / Math.max(b - a, 1e-9));
    }
  }
  return out.set(stops[stops.length - 1][1]);
};
// Charge: green fades towards slate as it is used. Low charge is not an alarm, so no red here;
// red is reserved for the empty cell that stops a fixed string, amber for stranded charge.
export const SOC_STOPS: [number, string][] = [[0, "#1f2a2d"], [0.25, "#24564a"], [0.6, "#2f9a6a"], [1, "#7ee2a0"]];
export const STATE_COLORS = { culprit: "#ef4a3c", stranded: "#e9a23b", bypassed: "#68737c", empty: "#151a1f" };
const STRANDED_STOPS: [number, string][] = [[0, "#3a2a12"], [1, "#e9a23b"]];
const SOH: [number, string][] = [[0, "#a33a30"], [0.5, "#d39a35"], [1, "#4fbf85"]];
const TEMP: [number, string][] = [[0, "#2b5d9a"], [0.45, "#58a6a6"], [0.7, "#e0a53a"], [1, "#ef5a50"]];
const SD: [number, string][] = [[0, "#262b31"], [0.35, "#5a4b8a"], [1, "#c49cf2"]];
export const DIFF_COLORS = { same: "#1c2126", moreCharge: "#4fc3f7", lessCharge: "#e9a23b", inPath: "#7ee2a0", outOfPath: "#c86cf0" };
interface Partner { run: DischargeResult; tier: "fixed" | "bypass" }

function cellColor(op: OperatorResult, run: DischargeResult, f: number, i: number, mode: ColorMode, out: THREE.Color,
                   probed: Set<number>, N: number, partner?: Partner, minute?: number) {
  const SN = op.qRel.length;
  const st = cellState(run, op.tier, f, i, N, SN / N);
  if (mode === "diff") {
    if (!partner || minute === undefined || !cellDiffers(run, op.tier, partner.run, partner.tier, minute, i, N, SN / N))
      return out.set(DIFF_COLORS.same);
    const pf = frameOf(partner.run, minute);
    const pst = cellState(partner.run, partner.tier, pf, i, N, SN / N);
    if ((st !== "charged") !== (pst !== "charged"))
      return out.set(st === "charged" ? DIFF_COLORS.inPath : DIFF_COLORS.outOfPath);
    return out.set(run.soc[f * SN + i] > partner.run.soc[pf * SN + i] ? DIFF_COLORS.moreCharge : DIFF_COLORS.lessCharge);
  }
  if (st === "bypassed") return out.set(STATE_COLORS.bypassed);
  if (probed.has(i)) return out.set("#f2b84b");
  if (mode === "soc") {
    if (st === "charged") return ramp(SOC_STOPS, run.soc[f * SN + i], out);
    if (st === "stranded") return ramp(STRANDED_STOPS, run.soc[f * SN + i] / 0.3, out);   // brighter = more charge left behind
    return out.set(STATE_COLORS[st]);
  }
  if (mode === "soh") return ramp(SOH, (op.qRel[i] - 0.5) / 0.5, out);
  if (mode === "temp") return ramp(TEMP, (run.temp[f * SN + i] - 10) / 40, out);
  return op.twinSd ? ramp(SD, op.twinSd[i] / 0.03, out) : out.set("#262b31");
}

function Container({ op, run, which, ox, minuteRef, hoverable, assemblyView, partner }: {
  op: OperatorResult; run: DischargeResult; which: Slot; ox: number; minuteRef: React.MutableRefObject<number>; hoverable: boolean; assemblyView: AssemblyView;
  partner?: Partner;
}) {
  const S = 8, N = op.qRel.length / S, SN = op.qRel.length;
  const mesh = useRef<THREE.InstancedMesh>(null);
  const terminals = useRef<THREE.InstancedMesh>(null);
  const flow = useRef<THREE.InstancedMesh>(null);
  const colorMode = useStudio((s) => s.colorMode);
  const set = useStudio((s) => s.set);
  const probed = useMemo(() => (run === op.run ? new Set(op.probes.map((p) => p.string * N + p.cell)) : new Set<number>()), [op, run, N]);
  const pos = useMemo(() => Array.from({ length: SN }, (_, i) => cellPos(Math.floor(i / N), i % N)), [SN, N]);
  const last = useRef<{ f: number; mode: string; run: DischargeResult | null; view: AssemblyView }>({ f: -1, mode: "", run: null, view: "assembled" });
  const tmp = useMemo(() => new THREE.Object3D(), []);
  const col = useMemo(() => new THREE.Color(), []);

  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m) return;
    const f = frameOf(run, minuteRef.current);
    const partnerFrame = colorMode === "diff" && partner ? frameOf(partner.run, minuteRef.current) * 100000 : 0;
    if (last.current.f !== f + partnerFrame || last.current.mode !== colorMode || last.current.run !== run || last.current.view !== assemblyView) {
      for (let i = 0; i < SN; i++) {
        const st = cellState(run, op.tier, f, i, N, S);
        const out = st !== "charged";
        const big = probed.has(i) ? 1.35 : st === "culprit" ? 1.6 : 1;
        const ro = rackOffset(Math.floor(i / N), assemblyView);
        tmp.position.set(pos[i].x + ox + ro.x, pos[i].y + ro.y, ro.z + (st === "culprit" ? 0.06 : out ? -0.05 : 0));
        const depthScale = st === "culprit" ? 1.6 : out ? 0.45 : big;
        tmp.scale.set(big, big, depthScale);
        tmp.updateMatrix();
        m.setMatrixAt(i, tmp.matrix);
        m.setColorAt(i, cellColor(op, run, f, i, colorMode, col, probed, N, partner, minuteRef.current));
        const tm = terminals.current;
        if (tm) {
          for (let pole = 0; pole < 2; pole++) {
            tmp.position.set(pos[i].x + ox + ro.x + (pole ? 0.015 : -0.015), pos[i].y + ro.y + 0.018 * big, ro.z + 0.087 * Math.max(0.45, depthScale));
            tmp.rotation.set(Math.PI / 2, 0, 0);
            tmp.scale.setScalar(out ? 0.55 : big);
            tmp.updateMatrix();
            tm.setMatrixAt(i * 2 + pole, tmp.matrix);
            tm.setColorAt(i * 2 + pole, col.set(pole ? "#b9c6ca" : "#e05d46"));
          }
        }
      }
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      if (terminals.current) {
        terminals.current.instanceMatrix.needsUpdate = true;
        if (terminals.current.instanceColor) terminals.current.instanceColor.needsUpdate = true;
      }
      last.current = { f: f + partnerFrame, mode: colorMode, run, view: assemblyView };
    }
    const fl = flow.current;
    if (fl) {
      const t = clock.getElapsedTime();
      const pw = run.powerKw[Math.min(Math.max(Math.floor(minuteRef.current), 0), 1439)] ?? 0;
      let k = 0;
      for (let s = 0; s < S; s++) {
        const on = run.stringsOnline[f * S + s] === 1 && pw > 0;
        for (let n = 0; n < 5; n++) {
          const u = (t * (0.35 + pw / 4000) + n / 5) % 1;
          tmp.position.set(ox + RACK_X[s % 4] + (COLS / 2 + 0.6) * P, TIER_Y[s < 4 ? 0 : 1] + u * ROWS * P, 0.06);
          const sc = on ? 1 : 0.0001;
          tmp.scale.set(sc, sc, sc);
          tmp.updateMatrix();
          fl.setMatrixAt(k++, tmp.matrix);
        }
      }
      fl.instanceMatrix.needsUpdate = true;
    }
  });

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (hoverable && e.instanceId != null) set({ hover: { op: which, string: Math.floor(e.instanceId / N), cell: e.instanceId % N } });
  };
  const accent = which === "A" ? "#5b6575" : which === "B" ? "#4f7f9b" : "#3f9b62";

  return (
    <group>
      <instancedMesh ref={mesh} args={[undefined, undefined, SN]} onPointerMove={onMove} onPointerOut={() => set({ hover: null })}>
        <boxGeometry args={CELL} />
        <meshStandardMaterial roughness={0.36} metalness={0.18} />
      </instancedMesh>
      <instancedMesh ref={terminals} args={[undefined, undefined, SN * 2]}>
        <cylinderGeometry args={[0.006, 0.007, 0.008, 8]} />
        <meshStandardMaterial roughness={0.24} metalness={0.82} vertexColors />
      </instancedMesh>
      <instancedMesh ref={flow} args={[undefined, undefined, S * 5]}>
        <sphereGeometry args={[0.022, 10, 10]} />
        <meshBasicMaterial color={which === "A" ? "#d5ddea" : "#a6f2b9"} />
      </instancedMesh>
      <CabinetFrame ox={ox} accent={accent} assemblyView={assemblyView} />
      {Array.from({ length: 8 }, (_, s) => <RackHardware key={s} ox={ox} string={s} assemblyView={assemblyView} />)}
    </group>
  );
}

function Beam({ position, scale, color = "#59656b" }: { position: [number, number, number]; scale: [number, number, number]; color?: string }) {
  return <mesh position={position}><boxGeometry args={scale} /><meshStandardMaterial color={color} roughness={0.34} metalness={0.72} /></mesh>;
}

function CabinetFrame({ ox, accent, assemblyView }: { ox: number; accent: string; assemblyView: AssemblyView }) {
  const x = SHELL.w / 2 - 0.055, y = SHELL.h / 2 - 0.05, z = 0.31;
  const panelOpacity = assemblyView === "assembled" ? 0.2 : 0.06;
  return <group>
    <mesh position={[ox, y, -0.31]}><boxGeometry args={[SHELL.w, SHELL.h, 0.035]} /><meshStandardMaterial color="#0a0f12" roughness={0.72} metalness={0.35} /></mesh>
    {[-1, 1].map((sx) => [-1, 1].map((sz) => <Beam key={`${sx}-${sz}`} position={[ox + sx * x, y, sz * z - 0.02]} scale={[0.065, SHELL.h, 0.065]} />))}
    {[-1, 1].map((sy) => [-1, 1].map((sz) => <Beam key={`${sy}-${sz}`} position={[ox, sy < 0 ? -0.01 : SHELL.h - 0.09, sz * z - 0.02]} scale={[SHELL.w, 0.075, 0.075]} />))}
    <Beam position={[ox, 1.63, 0.29]} scale={[SHELL.w, 0.055, 0.055]} color="#465258" />
    <mesh position={[ox, SHELL.h - 0.035, -0.02]}><boxGeometry args={[SHELL.w, 0.055, 0.68]} /><meshStandardMaterial color="#273238" metalness={0.72} roughness={0.35} /></mesh>
    <mesh position={[ox - x - (assemblyView === "cutaway" ? 0.22 : 0), y, assemblyView === "cutaway" ? 0.42 : -0.02]} rotation={[0, assemblyView === "cutaway" ? -0.7 : 0, 0]}>
      <boxGeometry args={[0.035, SHELL.h - 0.16, 0.58]} /><meshStandardMaterial color="#243037" transparent opacity={panelOpacity} metalness={0.55} roughness={0.42} />
    </mesh>
    <mesh position={[ox + x, y, -0.02]}><boxGeometry args={[0.035, SHELL.h - 0.16, 0.58]} /><meshStandardMaterial color="#243037" transparent opacity={panelOpacity} metalness={0.55} roughness={0.42} /></mesh>
    <mesh position={[ox, 3.27, 0.345]}><boxGeometry args={[1.05, 0.13, 0.05]} /><meshStandardMaterial color="#10171a" metalness={0.45} /></mesh>
    <mesh position={[ox - 0.37, 3.27, 0.375]}><boxGeometry args={[0.18, 0.035, 0.018]} /><meshBasicMaterial color={accent} /></mesh>
    {[0, 1, 2].map((i) => <mesh key={i} position={[ox + 0.12 + i * 0.13, 3.27, 0.378]}><sphereGeometry args={[0.026, 10, 10]} /><meshBasicMaterial color={i === 0 ? "#77e49f" : i === 1 ? "#f0c35c" : "#6ca9e8"} /></mesh>)}
    {[-1.65, 1.65].map((fx) => <group key={fx}><Beam position={[ox + fx, -0.1, 0]} scale={[0.34, 0.17, 0.5]} color="#313c41" /><mesh position={[ox + fx, -0.19, 0]}><cylinderGeometry args={[0.09, 0.11, 0.08, 16]} /><meshStandardMaterial color="#111719" metalness={0.5} /></mesh></group>)}
    {/* HVAC fans and rear plenum */}
    {[-1.52, 1.52].map((fx) => <group key={fx} position={[ox + fx, 2.92, -0.265]} rotation={[Math.PI / 2, 0, 0]}>
      <mesh><torusGeometry args={[0.23, 0.025, 10, 28]} /><meshStandardMaterial color="#4c5a60" metalness={0.78} /></mesh>
      <mesh><cylinderGeometry args={[0.055, 0.055, 0.07, 14]} /><meshStandardMaterial color="#a9b4b5" metalness={0.82} /></mesh>
      {[0, 1, 2, 3, 4, 5].map((i) => <mesh key={i} rotation={[0, i * Math.PI / 3, 0]} position={[0.11 * Math.sin(i * Math.PI / 3), 0, 0.11 * Math.cos(i * Math.PI / 3)]}><boxGeometry args={[0.055, 0.025, 0.19]} /><meshStandardMaterial color="#29353a" metalness={0.58} /></mesh>)}
    </group>)}
    {/* Main contactors, service disconnect and pre-charge hardware */}
    <group position={[ox, 0.25, 0.285]}>
      {[-0.48, 0, 0.48].map((cx, i) => <group key={cx} position={[cx, 0, 0]}><mesh><boxGeometry args={[0.32, 0.28, 0.2]} /><meshStandardMaterial color={i === 1 ? "#48322d" : "#26343a"} metalness={0.5} roughness={0.4} /></mesh><mesh position={[0, 0.17, 0]}><cylinderGeometry args={[0.045, 0.045, 0.06, 12]} /><meshStandardMaterial color="#c48a4e" metalness={0.88} /></mesh></group>)}
      <mesh position={[0.92, 0.02, 0.08]} rotation={[0, 0, -0.35]}><boxGeometry args={[0.08, 0.34, 0.08]} /><meshStandardMaterial color="#d95b43" roughness={0.45} /></mesh>
      <mesh position={[0.92, -0.13, 0]}><boxGeometry args={[0.24, 0.2, 0.16]} /><meshStandardMaterial color="#202b2f" metalness={0.5} /></mesh>
    </group>
    {/* Coolant manifolds and insulated high-voltage trunk cables */}
    {[-1.94, 1.94].map((mx) => <group key={mx}><mesh position={[ox + mx, 1.58, 0.24]}><cylinderGeometry args={[0.045, 0.045, 2.65, 12]} /><meshStandardMaterial color="#437d91" metalness={0.65} /></mesh>{[0.55, 1.45, 2.35].map((my) => <mesh key={my} position={[ox + mx, my, 0.31]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.075, 0.018, 8, 16, Math.PI]} /><meshStandardMaterial color="#6aa4b6" metalness={0.55} /></mesh>)}</group>)}
    <Line points={[[ox - 1.82, 0.38, 0.35], [ox - 1.82, 3.05, 0.35], [ox - 0.72, 3.05, 0.35]]} color="#bd4d3e" lineWidth={3.4} />
    <Line points={[[ox + 1.82, 0.38, 0.35], [ox + 1.82, 3.05, 0.35], [ox + 0.72, 3.05, 0.35]]} color="#20272a" lineWidth={3.4} />
  </group>;
}

function RackHardware({ ox, string, assemblyView }: { ox: number; string: number; assemblyView: AssemblyView }) {
  const rack = string % 4, tier = string < 4 ? 0 : 1;
  const ro = rackOffset(string, assemblyView), x = ox + RACK_X[rack] + ro.x;
  const cy = TIER_Y[tier] + (ROWS * P) / 2 - P / 2 + ro.y;
  const w = COLS * P + 0.12, h = ROWS * P + 0.13, z = ro.z;
  const busColor = string % 2 ? "#b7773f" : "#c18b52";
  return <group>
    <mesh position={[x, cy, z - 0.115]}><boxGeometry args={[w, h, 0.035]} /><meshStandardMaterial color="#11191d" metalness={0.38} roughness={0.52} /></mesh>
    {[-1, 1].map((sx) => <Beam key={sx} position={[x + sx * (w / 2), cy, z - 0.045]} scale={[0.035, h, 0.08]} color="#68747a" />)}
    {[-1, 1].map((sy) => <Beam key={sy} position={[x, cy + sy * (h / 2), z - 0.045]} scale={[w, 0.035, 0.08]} color="#68747a" />)}
    <Beam position={[x, cy + h / 2 - 0.08, z + 0.025]} scale={[w - 0.08, 0.025, 0.025]} color={busColor} />
    <Beam position={[x, cy - h / 2 + 0.08, z + 0.025]} scale={[w - 0.08, 0.025, 0.025]} color={busColor} />
    {[0.22, 0.5, 0.78].map((f) => <Beam key={f} position={[x - w / 2 + w * f, cy, z - 0.075]} scale={[0.012, h - 0.08, 0.03]} color="#344147" />)}
    <mesh position={[x, cy + h / 2 + 0.055, z + 0.005]}><boxGeometry args={[0.25, 0.055, 0.035]} /><meshStandardMaterial color="#d7e0dc" roughness={0.75} /></mesh>
    <Line points={[[x - w / 2 + 0.03, cy - h / 2, z + 0.08], [x - w / 2 - 0.035, cy, z + 0.11], [x - w / 2 + 0.03, cy + h / 2, z + 0.08]]} color="#4e8fb2" lineWidth={1.1} />
    {/* Rack BMS board, daisy-chain harness and fuse row */}
    <mesh position={[x + w / 2 - 0.055, cy, z + 0.07]}><boxGeometry args={[0.07, h - 0.2, 0.035]} /><meshStandardMaterial color="#15513f" roughness={0.58} /></mesh>
    {Array.from({ length: 6 }, (_, i) => <mesh key={i} position={[x - w / 2 + 0.12 + i * (w - 0.24) / 5, cy + h / 2 - 0.045, z + 0.065]}><boxGeometry args={[0.075, 0.035, 0.035]} /><meshStandardMaterial color="#ded4b3" metalness={0.18} /></mesh>)}
    {[0.28, 0.58].map((f) => <Line key={f} points={[[x - w / 2 + 0.06, cy - h / 2 + h * f, z + 0.09], [x + w / 2 - 0.08, cy - h / 2 + h * f, z + 0.09]]} color="#5c9fb0" lineWidth={0.75} />)}
    {[0, 1, 2].map((i) => <mesh key={i} position={[x + w / 2 - 0.052, cy - 0.22 + i * 0.22, z + 0.095]}><sphereGeometry args={[0.016, 8, 8]} /><meshBasicMaterial color={i === 0 ? "#6fe39a" : i === 1 ? "#efc65d" : "#67aee8"} /></mesh>)}
    {/* Rack cold plate feed/return */}
    {[-0.22, 0.22].map((dx, i) => <mesh key={dx} position={[x + dx, cy - h / 2 - 0.035, z - 0.04]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.018, 0.018, w - 0.18, 10]} /><meshStandardMaterial color={i ? "#477f91" : "#b16a3b"} metalness={0.62} /></mesh>)}
    {[-1, 1].flatMap((sx) => [-1, 1].map((sy) => <mesh key={`${sx}-${sy}`} position={[x + sx * (w / 2 - 0.025), cy + sy * (h / 2 - 0.025), z + 0.015]}><cylinderGeometry args={[0.018, 0.018, 0.012, 10]} /><meshStandardMaterial color="#bac4c6" metalness={0.9} roughness={0.2} /></mesh>))}
  </group>;
}

function SvgFallback({ scenario, view, slots }: { scenario: Scenario; view: "peak" | "drain"; slots: Slot[] }) {
  const minute = useStudio((s) => Math.floor((view === "drain" ? s.drainMin : s.minute) / 5) * 5);
  const mode = useStudio((s) => s.colorMode);
  const N = scenario.sys.nSeries, S = scenario.sys.nStrings, SN = N * S;
  const shade = new THREE.Color();
  return <svg viewBox={`0 0 ${slots.length * 300} 350`} className="w-full h-full" role="img" aria-label="Battery cells, charge and bypass states for each simulated operator">
    <rect width={slots.length * 300} height="350" fill="#050608" />
    {slots.map((key, block) => {
      const op = scenario.ops[key], run = view === "drain" ? op.drain! : op.run;
      const f = frameOf(run, minute);
      const probed = new Set(run === op.run ? op.probes.map((p) => p.string * N + p.cell) : []);
      const baseX = block * 300 + 10;
      const power = run.powerKw[Math.min(Math.max(minute, 0), 1439)] ?? 0;
      return <g key={key}>
        <rect x={baseX} y="60" width="280" height="245" rx="9" fill="#0c0f12" stroke={key === "A" ? "#5b6575" : key === "B" ? "#4f7f9b" : "#3f9b62"} strokeWidth="2" />
        <text x={baseX + 140} y="39" textAnchor="middle" fill="#e3eae5" fontSize="13" fontWeight="bold">{BATTERY_NAMES[key]}</text>
        {Array.from({ length: S }, (_, s) => {
          const rackX = baseX + 15 + (s % 4) * 67;
          const rackY = 73 + (s < 4 ? 0 : 113);
          const on = run.stringsOnline[f * S + s] === 1 && power > 0;
          return <g key={s}>
            <rect x={rackX - 3} y={rackY - 3} width="57" height="104" rx="3" fill="#14191e" />
            {Array.from({ length: N }, (_, j) => {
              const i = s * N + j;
              return <rect key={j} x={rackX + (j % 12) * 4.25} y={rackY + Math.floor(j / 12) * 4.8} width="3.7" height="4.2" rx="0.6"
                fill={cellColor(op, run, f, i, mode, shade, probed, N).getStyle()} />;
            })}
            <path d={`M${rackX + 55},${rackY} V${rackY + 97}`} fill="none" stroke={on ? "#79cbf5" : "#53616b"} strokeWidth="2" />
            {on && <path d={`M${rackX + 55},${rackY} V${rackY + 97}`} fill="none" stroke="#d3f3ff" strokeWidth="3" strokeDasharray="3 15" className="current-flow" />}
          </g>;
        })}
        <text x={baseX + 140} y="326" textAnchor="middle" fill="#aab8b0" fontSize="11">{SN.toLocaleString()} modeled cells · t+{minute} min</text>
      </g>;
    })}
  </svg>;
}

export default function Battery3D({ scenario, view }: { scenario: Scenario; view: "peak" | "drain" }) {
  const [webgl, setWebgl] = useState(false);
  const [assemblyView, setAssemblyView] = useState<AssemblyView>("cutaway");
  useEffect(() => {
    try {
      const canvas = document.createElement("canvas");
      setWebgl(!!(canvas.getContext("webgl2") || canvas.getContext("webgl")));
    } catch { setWebgl(false); }
  }, []);
  const minuteRef = useRef(useStudio.getState().minute);
  const drainRef = useRef(useStudio.getState().drainMin);
  useEffect(() => useStudio.subscribe((s) => { minuteRef.current = s.minute; drainRef.current = s.drainMin; }), []);
  const slots = slotsFor(view);
  const span = slots.length * SHELL.w + (slots.length - 1) * GAP;
  const labelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const xs = slots.map((_, idx) => -span / 2 + SHELL.w / 2 + idx * (SHELL.w + GAP));
  return (
    <div className="absolute inset-0">
    {webgl && <div className="absolute z-[4] bottom-2 left-3 text-[8px] tracking-wide text-[#809296] pointer-events-none">ASSUMED INTERNAL ARCHITECTURE · NOT VERIFIED REON CAD</div>}
    {webgl && <div className="absolute z-[4] top-10 right-3 flex rounded-md overflow-hidden border border-[#435158] bg-[#091013]/90 text-[9px] sm:text-[10px]">
      {(["assembled", "exploded", "cutaway"] as AssemblyView[]).map((mode) => <button type="button" key={mode} aria-pressed={assemblyView === mode} className={`px-2.5 py-1.5 capitalize ${assemblyView === mode ? "bg-[#dfece5] text-[#0b1713]" : "text-[#c2d0d0] hover:bg-[#1b292c]"}`} onClick={() => setAssemblyView(mode)}>{mode}</button>)}
    </div>}
    {!webgl ? <SvgFallback scenario={scenario} view={view} slots={slots} /> : <>
    {slots.map((k, idx) => (
      <div key={`${view}-${k}`} ref={(el) => { labelRefs.current[idx] = el; }}
           className="absolute z-[1] pointer-events-none -translate-x-1/2 -translate-y-full text-[11px] sm:text-[12px] font-semibold text-[#e3eae5] whitespace-nowrap">
        {BATTERY_NAMES[k]}
      </div>
    ))}
    <Canvas camera={{ position: [0, 1.9, 12], fov: 40 }} dpr={[1, 2]} gl={{ antialias: true }}>
      <FitCamera span={span} />
      <Labels xs={xs} refs={labelRefs} />
      <color attach="background" args={["#050608"]} />
      <hemisphereLight args={["#d6dee9", "#0b0d10", 0.75]} />
      <directionalLight position={[-3, 6, 8]} intensity={1.1} />
      <directionalLight position={[4, 3, 5]} intensity={0.35} />
      {slots.map((k, idx) => {
        const op = scenario.ops[k];
        const run = view === "drain" ? op.drain! : op.run;
        const ox = -span / 2 + SHELL.w / 2 + idx * (SHELL.w + GAP);
        const partnerKey: Slot = k === "B" ? "A" : "B";
        const partnerOp = scenario.ops[partnerKey];
        const partner = { run: view === "drain" ? partnerOp.drain! : partnerOp.run, tier: partnerOp.tier };
        return <Container key={`${view}-${k}`} op={op} run={run} which={k} ox={ox} hoverable={view === "peak"}
                          minuteRef={view === "drain" ? drainRef : minuteRef} assemblyView={assemblyView} partner={partner} />;
      })}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[20, 6]} />
        <meshStandardMaterial color="#07090b" />
      </mesh>
      <OrbitControls target={[0, 1.62, 0]} maxPolarAngle={Math.PI / 1.95} minDistance={3} maxDistance={24} enablePan={false} />
    </Canvas>
    </>}
    </div>
  );
}

// Projects each container's top-centre to screen space and moves the HTML label there (no React re-render).
function Labels({ xs, refs }: { xs: number[]; refs: React.MutableRefObject<(HTMLDivElement | null)[]> }) {
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    xs.forEach((x, i) => {
      const el = refs.current[i];
      if (!el) return;
      v.set(x, SHELL.h + 0.05, -0.12).project(camera);
      el.style.left = `${((v.x + 1) / 2) * size.width}px`;
      el.style.top = `${((1 - v.y) / 2) * size.height}px`;
    });
  });
  return null;
}

function FitCamera({ span }: { span: number }) {
  const { camera, size } = useThree();
  useEffect(() => {
    const aspect = size.width / size.height;
    const t = Math.tan((40 / 2) * Math.PI / 180);
    const dW = (span / 2 + 0.3) / (t * aspect);       // fit width
    const dH = (SHELL.h / 2 + 0.85) / t;               // fit height, leaving room for labels
    camera.position.set(0, 2.35, Math.max(dW, dH) + 0.45);
    camera.lookAt(0, 1.55, 0);
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height, span]);
  return null;
}
