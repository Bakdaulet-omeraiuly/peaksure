"use client";
import { Canvas, useFrame, useThree, ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Scenario, OperatorResult } from "@/engine/scenario";
import { DischargeResult } from "@/engine/discharge";
import { cellState, frameOf } from "@/engine/cellview";
import { useStudio, ColorMode } from "@/state/store";

// Schematic container: 8 racks (strings) in 4 columns x 2 tiers, all facing the viewer.
const COLS = 12, ROWS = 20, P = 0.07, CELL: [number, number, number] = [0.058, 0.058, 0.16];
const RACK_X = [-1.44, -0.48, 0.48, 1.44];
const TIER_Y = [1.78, 0.18];                       // strings 0-3 top tier, 4-7 bottom tier
const SHELL = { w: 4.15, h: 3.42, d: 0.62 };
const GAP = 0.55;

export type Slot = "A" | "B" | "C";
const LABEL: Record<Slot, string> = { A: "Conventional", B: "REON baseline", C: "REON + PeakSure" };
export const slotsFor = (view: "peak" | "drain"): Slot[] => (view === "peak" ? ["A", "B", "C"] : ["A", "B"]);

function cellPos(s: number, j: number) {
  const rack = s % 4, tier = s < 4 ? 0 : 1;
  const col = j % COLS, row = Math.floor(j / COLS);
  return new THREE.Vector3(RACK_X[rack] + (col - (COLS - 1) / 2) * P, TIER_Y[tier] + row * P, 0);
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

function cellColor(op: OperatorResult, run: DischargeResult, f: number, i: number, mode: ColorMode, out: THREE.Color,
                   probed: Set<number>, N: number) {
  const SN = op.qRel.length;
  const st = cellState(run, op.tier, f, i, N, SN / N);
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

function Container({ op, run, which, ox, minuteRef, hoverable }: {
  op: OperatorResult; run: DischargeResult; which: Slot; ox: number; minuteRef: React.MutableRefObject<number>; hoverable: boolean;
}) {
  const S = 8, N = op.qRel.length / S, SN = op.qRel.length;
  const mesh = useRef<THREE.InstancedMesh>(null);
  const flow = useRef<THREE.InstancedMesh>(null);
  const colorMode = useStudio((s) => s.colorMode);
  const set = useStudio((s) => s.set);
  const probed = useMemo(() => (run === op.run ? new Set(op.probes.map((p) => p.string * N + p.cell)) : new Set<number>()), [op, run, N]);
  const pos = useMemo(() => Array.from({ length: SN }, (_, i) => cellPos(Math.floor(i / N), i % N)), [SN, N]);
  const last = useRef<{ f: number; mode: string; run: DischargeResult | null }>({ f: -1, mode: "", run: null });
  const tmp = useMemo(() => new THREE.Object3D(), []);
  const col = useMemo(() => new THREE.Color(), []);

  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m) return;
    const f = frameOf(run, minuteRef.current);
    if (last.current.f !== f || last.current.mode !== colorMode || last.current.run !== run) {
      for (let i = 0; i < SN; i++) {
        const st = cellState(run, op.tier, f, i, N, S);
        const out = st !== "charged";
        const big = probed.has(i) ? 1.35 : st === "culprit" ? 1.6 : 1;
        tmp.position.set(pos[i].x + ox, pos[i].y, st === "culprit" ? 0.06 : out ? -0.05 : 0);
        tmp.scale.set(big, big, st === "culprit" ? 1.6 : out ? 0.45 : big);
        tmp.updateMatrix();
        m.setMatrixAt(i, tmp.matrix);
        m.setColorAt(i, cellColor(op, run, f, i, colorMode, col, probed, N));
      }
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      last.current = { f, mode: colorMode, run };
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
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(SHELL.w, SHELL.h, SHELL.d)), []);
  const accent = which === "A" ? "#5b6575" : which === "B" ? "#4f7f9b" : "#3f9b62";

  return (
    <group>
      <instancedMesh ref={mesh} args={[undefined, undefined, SN]} onPointerMove={onMove} onPointerOut={() => set({ hover: null })}>
        <boxGeometry args={CELL} />
        <meshStandardMaterial roughness={0.5} metalness={0.1} />
      </instancedMesh>
      <instancedMesh ref={flow} args={[undefined, undefined, S * 5]}>
        <sphereGeometry args={[0.022, 10, 10]} />
        <meshBasicMaterial color={which === "A" ? "#d5ddea" : "#a6f2b9"} />
      </instancedMesh>
      <group position={[ox, SHELL.h / 2 - 0.05, -0.12]}>
        <lineSegments geometry={edges}><lineBasicMaterial color={accent} /></lineSegments>
        <mesh position={[0, 0, -SHELL.d / 2 + 0.01]}>
          <planeGeometry args={[SHELL.w, SHELL.h]} />
          <meshStandardMaterial color="#0c0f12" />
        </mesh>
      </group>
      {RACK_X.map((x) => TIER_Y.map((y) => (
        <mesh key={`${x}${y}`} position={[ox + x, y + (ROWS * P) / 2 - P / 2, -0.11]}>
          <boxGeometry args={[COLS * P + 0.05, ROWS * P + 0.05, 0.02]} />
          <meshStandardMaterial color="#14191e" />
        </mesh>
      )))}
    </group>
  );
}

export default function Battery3D({ scenario, view }: { scenario: Scenario; view: "peak" | "drain" }) {
  const minuteRef = useRef(useStudio.getState().minute);
  const drainRef = useRef(useStudio.getState().drainMin);
  useEffect(() => useStudio.subscribe((s) => { minuteRef.current = s.minute; drainRef.current = s.drainMin; }), []);
  const slots = slotsFor(view);
  const span = slots.length * SHELL.w + (slots.length - 1) * GAP;
  const labelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const xs = slots.map((_, idx) => -span / 2 + SHELL.w / 2 + idx * (SHELL.w + GAP));
  return (
    <div className="absolute inset-0">
    {slots.map((k, idx) => (
      <div key={`${view}-${k}`} ref={(el) => { labelRefs.current[idx] = el; }}
           className="absolute z-[1] pointer-events-none -translate-x-1/2 -translate-y-full text-[11px] sm:text-[12px] font-semibold text-[#e3eae5] whitespace-nowrap">
        {view === "drain" ? (k === "A" ? "Conventional fixed strings" : "REON cell bypass") : LABEL[k]}
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
        return <Container key={`${view}-${k}`} op={op} run={run} which={k} ox={ox} hoverable={view === "peak"}
                          minuteRef={view === "drain" ? drainRef : minuteRef} />;
      })}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[20, 6]} />
        <meshStandardMaterial color="#07090b" />
      </mesh>
      <OrbitControls target={[0, 1.62, 0]} maxPolarAngle={Math.PI / 1.95} minDistance={3} maxDistance={24} enablePan={false} />
    </Canvas>
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
    camera.position.set(0, 1.75, Math.max(dW, dH));
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height, span]);
  return null;
}
