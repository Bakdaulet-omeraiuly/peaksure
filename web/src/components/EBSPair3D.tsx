"use client";
// Two EBS-size blocks side by side: conventional fixed string (A) and REON-style bypass (B).
// Cell states come from the simulation frames (engine/ebsScenario.cellStates). Layout is schematic:
// REON has not published EBS cell count, series/parallel arrangement or wiring.
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { DIAGNOSIS_COLOR, EBS_STATE_COLOR, EBS_STATE_LABEL, EbsCellState, EbsFrame, cellStates, countStates, decode, diffMask } from "@/engine/ebsScenario";

const COLS = 12, SX = 0.19, SY = 0.21;
const pos = (i: number, ox: number) => new THREE.Vector3(ox + ((i % COLS) - (COLS - 1) / 2) * SX, 0.38 + Math.floor(i / COLS) * SY, 0.12);

interface Side { frame: EbsFrame; bypass: boolean; title: string; sub: string; status: string }
interface Props { a: Side; b: Side; started: boolean; diagnosisCell: number | null; difference: boolean;
  onHover?: (h: { side: "A" | "B"; cell: number } | null) => void }

function Block({ side, ox, started, diagnosisCell, mask, which, onHover }: { side: Side; ox: number; started: boolean; diagnosisCell: number | null;
  mask: boolean[] | null; which: "A" | "B"; onHover?: Props["onHover"] }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const states = useMemo(() => cellStates(side.frame, side.bypass, started), [side.frame, side.bypass, started]);
  const soc = useMemo(() => decode(side.frame.soc_b64), [side.frame.soc_b64]);
  const n = states.length;
  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const o = new THREE.Object3D(), c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const st = states[i];
      const p = pos(i, ox);
      // shape cues: limiting = enlarged and forward; bypassed / idle = recessed and thin
      o.position.set(p.x, p.y, st === "limiting" ? 0.22 : st === "bypassed" || st === "idle" ? 0.02 : p.z);
      const sc = st === "limiting" ? 1.3 : 1;
      o.scale.set(sc, sc, st === "bypassed" || st === "idle" ? 0.4 : sc);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      if (mask) c.set(mask[i] ? "#f2f5f7" : "#1c2126");
      else {
        c.set(EBS_STATE_COLOR[st]);
        if (st === "normal") c.lerp(new THREE.Color("#18352b"), 1 - soc[i] / 255);   // darker green = less charge
      }
      m.setColorAt(i, c);
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [states, soc, n, ox, mask]);
  const ring = diagnosisCell !== null ? pos(diagnosisCell, ox) : null;
  return <group>
    <mesh position={[ox, 1.34, -0.08]}><boxGeometry args={[2.75, 2.5, 0.22]} /><meshStandardMaterial color="#132027" roughness={0.85} /></mesh>
    <mesh position={[ox, 1.34, -0.08]}><boxGeometry args={[2.78, 2.53, 0.24]} /><meshBasicMaterial color={side.frame.block_online || !started ? (side.bypass ? "#3f9b62" : "#657d88") : "#ef4a3c"} wireframe /></mesh>
    <instancedMesh ref={mesh} args={[undefined, undefined, n]}
      onPointerMove={(e) => { e.stopPropagation(); if (e.instanceId != null) onHover?.({ side: which, cell: e.instanceId }); }}
      onPointerOut={() => onHover?.(null)}>
      <boxGeometry args={[0.14, 0.15, 0.14]} /><meshStandardMaterial roughness={0.5} metalness={0.08} />
    </instancedMesh>
    {ring && <mesh position={[ring.x, ring.y, 0.3]}><torusGeometry args={[0.12, 0.016, 8, 28]} /><meshBasicMaterial color={DIAGNOSIS_COLOR} /></mesh>}
  </group>;
}

function Fit() {
  const { camera, size } = useThree();
  useEffect(() => {
    const t = Math.tan(19 * Math.PI / 180);
    camera.position.set(0, 1.45, Math.max(3.6 / (t * (size.width / size.height)), 1.8 / t));
    camera.lookAt(0, 1.32, 0);
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height]);
  return null;
}

function SvgSide({ side, left, started, diagnosisCell, mask, which, onHover }: { side: Side; left: number; started: boolean; diagnosisCell: number | null;
  mask: boolean[] | null; which: "A" | "B"; onHover?: Props["onHover"] }) {
  const states = cellStates(side.frame, side.bypass, started);
  const soc = decode(side.frame.soc_b64);
  return <g>
    <rect x={left + 12} y="51" width="444" height="254" rx="14" fill="#112028" stroke={side.frame.block_online || !started ? (side.bypass ? "#3f9b62" : "#657d88") : "#ef4a3c"} strokeWidth="3" />
    {states.map((st, i) => {
      const x = left + 32 + (i % COLS) * 34, y = 72 + Math.floor(i / COLS) * 23;
      const fill = mask ? (mask[i] ? "#f2f5f7" : "#1c2126") : st === "normal" ? new THREE.Color(EBS_STATE_COLOR.normal).lerp(new THREE.Color("#18352b"), 1 - soc[i] / 255).getStyle() : EBS_STATE_COLOR[st];
      return <g key={i} onMouseEnter={() => onHover?.({ side: which, cell: i })} onMouseLeave={() => onHover?.(null)}>
        <rect x={x} y={y} width="24" height="15" rx="2" fill={fill} opacity={st === "bypassed" || st === "idle" ? 0.7 : 1} />
        {st === "limiting" && <text x={x + 12} y={y + 12} textAnchor="middle" fontSize="11" fontWeight="bold" fill="#fff">!</text>}
        {st === "bypassed" && <line x1={x + 2} y1={y + 13} x2={x + 22} y2={y + 2} stroke="#1c2126" strokeWidth="2" />}
        {i === diagnosisCell && <rect x={x - 3} y={y - 3} width="30" height="21" rx="4" fill="none" stroke={DIAGNOSIS_COLOR} strokeWidth="2.5" />}
      </g>;
    })}
  </g>;
}

export default function EBSPair3D({ a, b, started, diagnosisCell, difference, onHover }: Props) {
  const [webgl, setWebgl] = useState(false);
  useEffect(() => {
    try { const cv = document.createElement("canvas"); setWebgl(!!(cv.getContext("webgl2") || cv.getContext("webgl"))); } catch { setWebgl(false); }
  }, []);
  const mask = difference ? diffMask(a.frame, b.frame) : null;
  const ca = countStates(cellStates(a.frame, a.bypass, started)), cb = countStates(cellStates(b.frame, b.bypass, started));
  const nDiff = mask ? mask.filter(Boolean).length : 0;
  const legend: [string, string][] = difference
    ? [["#f2f5f7", "differs from the other block"], ["#1c2126", "same state and charge (±2%)"]]
    : (Object.keys(EBS_STATE_COLOR) as EbsCellState[]).map((k) => [EBS_STATE_COLOR[k], EBS_STATE_LABEL[k]]);
  return <div>
    <div className="relative h-[340px] sm:h-[410px] rounded-lg overflow-hidden bg-[#061013]">
      <div className="absolute top-2 left-3 right-3 z-10 grid grid-cols-2 gap-2 text-center text-[11px] sm:text-[13px] font-semibold text-white pointer-events-none">
        {[a, b].map((s) => <span key={s.title}>{s.title}<br /><small className="font-normal text-[#a8bac0]">{s.sub}</small><br /><small className="font-normal" style={{ color: s.status.startsWith("STOPPED") ? "#ff8a80" : "#9fe0bd" }}>{s.status}</small></span>)}
      </div>
      {webgl ? <Canvas camera={{ position: [0, 1.45, 10], fov: 38 }} dpr={[1, 2]}>
        <Fit /><color attach="background" args={["#061013"]} />
        <hemisphereLight args={["#d9e7ec", "#0b1519", 1.1]} /><directionalLight position={[-2, 4, 7]} intensity={1.5} />
        <Block side={a} ox={-1.65} started={started} diagnosisCell={diagnosisCell} mask={mask} which="A" onHover={onHover} />
        <Block side={b} ox={1.65} started={started} diagnosisCell={diagnosisCell} mask={mask} which="B" onHover={onHover} />
        <OrbitControls target={[0, 1.32, 0]} enablePan={false} minDistance={4} maxDistance={17} />
      </Canvas> : <svg viewBox="0 0 1000 340" className="absolute inset-0 w-full h-full" role="img" aria-label="Conventional and REON-style EBS block cells and their simulated states">
        <SvgSide side={a} left={32} started={started} diagnosisCell={diagnosisCell} mask={mask} which="A" onHover={onHover} />
        <SvgSide side={b} left={525} started={started} diagnosisCell={diagnosisCell} mask={mask} which="B" onHover={onHover} />
      </svg>}
    </div>
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted mt-2">
      {legend.map(([c, l]) => <span key={l}><i className="inline-block w-2.5 h-2.5 mr-1 rounded-sm align-middle" style={{ background: c }} />{l}</span>)}
      <span><i className="inline-block w-2.5 h-2.5 mr-1 rounded-full align-middle border-2" style={{ borderColor: DIAGNOSIS_COLOR }} />selected for diagnosis (lowest twin estimate)</span>
    </div>
    <p className="text-[11px] text-faint mt-1">Shape cues: limiting cell enlarged and pushed forward (&ldquo;!&rdquo; in 2D); bypassed and idle cells recessed (struck through when bypassed). Red block outline = block stopped.</p>
    <p className="text-[11.5px] text-muted mt-1 num" aria-live="polite">
      A: {ca.normal + ca.approaching} in circuit · {ca.approaching} approaching empty · {ca.limiting} limiting · {ca.idle} idle &nbsp;|&nbsp;
      B: {cb.normal + cb.approaching} in circuit · {cb.approaching} approaching empty · {cb.bypassed} bypassed · {cb.idle} idle
      {difference && <> &nbsp;|&nbsp; {nDiff === 0 ? "no cell differs at this moment" : `${nDiff} cells differ`}</>}
    </p>
    <p className="text-[10.5px] text-faint">REON-style EBS model — schematic topology; internal EBS construction not confirmed. {decode(a.frame.soc_b64).length} cells per block is a model assumption.</p>
  </div>;
}
