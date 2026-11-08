"use client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Line, OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

interface Frame { soc_b64: string; active_b64: string; block_online: boolean }
interface Props { fixed: Frame; bypass: Frame; weakCell: number; minute: number }
type AssemblyView = "assembled" | "exploded" | "xray";
type DetailLayer = "all" | "cells" | "switching" | "cooling" | "control";

const DETAIL_LAYERS: { id: DetailLayer; label: string; description: string }[] = [
  { id: "all", label: "Complete", description: "Full assumed block assembly" },
  { id: "cells", label: "Cells", description: "Prismatic cells, poles and capacity state" },
  { id: "switching", label: "Switching", description: "Per-cell switch, fuse, busbar and bypass path" },
  { id: "cooling", label: "Thermal", description: "Cold plate, coolant channels and temperature sensors" },
  { id: "control", label: "BMS", description: "Monitoring boards, sense harness and main contactors" },
];

const N = 120, COLS = 12, STEP_X = 0.19, STEP_Y = 0.21;
const cellPosition = (i: number, ox = 0) => {
  const row = Math.floor(i / COLS), col = i % COLS;
  return new THREE.Vector3(ox + (col - 5.5) * STEP_X, 0.38 + row * STEP_Y, 0.12);
};
const decode = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

function SvgBlock({ frame, weakCell, left, bypass }: { frame: Frame; weakCell: number; left: number; bypass: boolean }) {
  const soc = decode(frame.soc_b64), active = decode(frame.active_b64);
  const weakX = left + 32 + (weakCell % COLS) * 34;
  const weakY = 72 + Math.floor(weakCell / COLS) * 23;
  const switched = bypass && !active[weakCell] && frame.block_online;
  const path = switched
    ? `M${weakX - 21},${weakY + 9} L${weakX - 12},${weakY - 20} L${weakX + 36},${weakY - 20} L${weakX + 45},${weakY + 9}`
    : `M${weakX - 21},${weakY + 9} H${weakX + 45}`;
  return <g>
    <rect x={left + 12} y="51" width="444" height="254" rx="14" fill="#112028" stroke={bypass ? "#3f9b62" : "#657d88"} strokeWidth="3" />
    {Array.from({ length: N }, (_, i) => {
      const x = left + 32 + (i % COLS) * 34;
      const y = 72 + Math.floor(i / COLS) * 23;
      const charge = soc[i] / 255;
      let color = charge > 0.35 ? "#3fbf7f" : "#28604d";
      if (bypass && !active[i] && frame.block_online) color = "#68737c";
      else if (!frame.block_online && i === weakCell && charge < 0.03) color = "#ef4a3c";
      else if (!frame.block_online && charge > 0.03) color = "#e9a23b";
      else if (i === weakCell) color = charge < 0.2 ? "#ef4a3c" : "#e9a23b";
      return <g key={i}>
        <polygon points={`${x},${y} ${x + 5},${y - 5} ${x + 29},${y - 5} ${x + 24},${y}`} fill="#9ab1aa" opacity="0.55" />
        <rect x={x} y={y} width="24" height="15" rx="2" fill={color} />
        <polygon points={`${x + 24},${y} ${x + 29},${y - 5} ${x + 29},${y + 10} ${x + 24},${y + 15}`} fill="#122925" />
        {i === weakCell && <rect x={x - 2} y={y - 2} width="28" height="19" rx="3" fill="none" stroke="#f9d383" strokeWidth="2" />}
      </g>;
    })}
    <path d={path} stroke={frame.block_online ? "#5fbcf4" : "#53616b"} strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    {frame.block_online && <path d={path} stroke="#c5edff" strokeWidth="5" fill="none" strokeDasharray="4 20" className="current-flow" />}
  </g>;
}

function CurrentPath({ pos, online, bypassed }: { pos: THREE.Vector3; online: boolean; bypassed: boolean }) {
  const points = useMemo(() => bypassed ? [
    new THREE.Vector3(pos.x - 0.28, pos.y, pos.z + 0.2),
    new THREE.Vector3(pos.x - 0.2, pos.y + 0.24, pos.z + 0.2),
    new THREE.Vector3(pos.x + 0.2, pos.y + 0.24, pos.z + 0.2),
    new THREE.Vector3(pos.x + 0.28, pos.y, pos.z + 0.2),
  ] : [new THREE.Vector3(pos.x - 0.28, pos.y, pos.z + 0.2), new THREE.Vector3(pos.x + 0.28, pos.y, pos.z + 0.2)], [pos.x, pos.y, pos.z, bypassed]);
  const curve = useMemo(() => new THREE.CatmullRomCurve3(points), [points]);
  const dots = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(({ clock }) => {
    if (!online) return;
    const t = clock.getElapsedTime() * 0.42;
    dots.current.forEach((dot, i) => { if (dot) dot.position.copy(curve.getPoint((t + i / 3) % 1)); });
  });
  return <>
    <Line points={points} color={online ? "#5fbcf4" : "#53616b"} lineWidth={3} />
    {online && Array.from({ length: 3 }, (_, i) => <mesh key={i} ref={(el) => { dots.current[i] = el; }}><sphereGeometry args={[0.045, 10, 10]} /><meshBasicMaterial color="#bceaff" /></mesh>)}
  </>;
}

function Block({ frame, weakCell, ox, bypass, assemblyView, detailLayer }: { frame: Frame; weakCell: number; ox: number; bypass: boolean; assemblyView: AssemblyView; detailLayer: DetailLayer }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const terminals = useRef<THREE.InstancedMesh>(null);
  const obj = useMemo(() => new THREE.Object3D(), []);
  const green = useMemo(() => new THREE.Color("#3fbf7f"), []);
  const dark = useMemo(() => new THREE.Color("#1b3532"), []);
  const cellZ = assemblyView === "exploded" ? 0.52 : 0.16;
  const weakPos = useMemo(() => {
    const p = cellPosition(weakCell, ox);
    p.z = cellZ;
    return p;
  }, [weakCell, ox, cellZ]);
  const soc = useMemo(() => decode(frame.soc_b64), [frame.soc_b64]);
  const active = useMemo(() => decode(frame.active_b64), [frame.active_b64]);
  const weakBypassed = bypass && !active[weakCell] && frame.block_online;
  const cellsFocused = detailLayer === "all" || detailLayer === "cells";

  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    for (let i = 0; i < N; i++) {
      const p = cellPosition(i, ox);
      p.z = cellZ;
      obj.position.copy(p);
      obj.scale.setScalar(i === weakCell ? 1.12 : 1);
      obj.updateMatrix();
      m.setMatrixAt(i, obj.matrix);
      const charge = soc[i] / 255;
      const c = new THREE.Color();
      if (bypass && !active[i] && frame.block_online) c.set("#68737c");
      else if (!frame.block_online && i === weakCell && charge < 0.03) c.set("#ef4a3c");
      else if (!frame.block_online && charge > 0.03) c.set("#e9a23b");
      else if (i === weakCell) c.set(charge < 0.2 ? "#ef4a3c" : "#e9a23b");
      else c.copy(dark).lerp(green, charge);
      m.setColorAt(i, c);
      const tm = terminals.current;
      if (tm) {
        for (let pole = 0; pole < 2; pole++) {
          obj.position.set(p.x + (pole ? 0.035 : -0.035), p.y + 0.072, p.z + 0.078);
          obj.rotation.set(Math.PI / 2, 0, 0);
          obj.scale.setScalar(i === weakCell ? 1.12 : 1);
          obj.updateMatrix();
          tm.setMatrixAt(i * 2 + pole, obj.matrix);
          tm.setColorAt(i * 2 + pole, c.set(pole ? "#c4ccce" : "#db5c42"));
        }
      }
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    if (terminals.current) {
      terminals.current.instanceMatrix.needsUpdate = true;
      if (terminals.current.instanceColor) terminals.current.instanceColor.needsUpdate = true;
    }
  }, [frame.block_online, soc, active, bypass, weakCell, ox, obj, dark, green, cellZ]);

  return <group>
    <ModuleHardware ox={ox} bypass={bypass} assemblyView={assemblyView} detailLayer={detailLayer} />
    <SwitchMatrix ox={ox} bypass={bypass} assemblyView={assemblyView} detailLayer={detailLayer} weakCell={weakCell} active={active} />
    <instancedMesh ref={mesh} args={[undefined, undefined, N]}><boxGeometry args={[0.14, 0.15, 0.14]} /><meshStandardMaterial roughness={0.38} metalness={0.16} transparent opacity={cellsFocused ? 1 : 0.12} depthWrite={cellsFocused} /></instancedMesh>
    <instancedMesh ref={terminals} args={[undefined, undefined, N * 2]}><cylinderGeometry args={[0.014, 0.016, 0.018, 10]} /><meshStandardMaterial roughness={0.2} metalness={0.9} vertexColors transparent opacity={cellsFocused ? 1 : 0.18} /></instancedMesh>
    {(detailLayer === "all" || detailLayer === "switching" || detailLayer === "cells") && <mesh position={[weakPos.x, weakPos.y, weakPos.z + 0.11]}><torusGeometry args={[0.13, 0.015, 8, 28]} /><meshBasicMaterial color={weakBypassed ? "#9aa6b0" : "#f4c76d"} /></mesh>}
    {(detailLayer === "all" || detailLayer === "switching") && <CurrentPath pos={weakPos} online={frame.block_online} bypassed={weakBypassed} />}
  </group>;
}

function ModuleHardware({ ox, bypass, assemblyView, detailLayer }: { ox: number; bypass: boolean; assemblyView: AssemblyView; detailLayer: DetailLayer }) {
  const exploded = assemblyView === "exploded";
  const xray = assemblyView === "xray";
  const coolingZ = exploded ? -0.62 : -0.18;
  const busZ = exploded ? 0.76 : 0.27;
  const shellOpacity = xray ? 0.08 : exploded ? 0.18 : 0.42;
  const structureOpacity = detailLayer === "all" ? shellOpacity : 0.035;
  const electricalOpacity = detailLayer === "all" || detailLayer === "switching" ? 1 : 0.09;
  const thermalOpacity = detailLayer === "all" || detailLayer === "cooling" ? 1 : 0.08;
  const controlOpacity = detailLayer === "all" || detailLayer === "control" ? 1 : 0.08;
  return <group>
    <mesh position={[ox, 1.34, -0.13]}><boxGeometry args={[2.82, 2.58, 0.34]} /><meshStandardMaterial color="#101b20" transparent opacity={structureOpacity} metalness={0.48} roughness={0.48} depthWrite={detailLayer === "all"} /></mesh>
    <mesh position={[ox, 1.34, -0.12]}><boxGeometry args={[2.86, 2.62, 0.38]} /><meshBasicMaterial color={bypass ? "#3f9b62" : "#657d88"} transparent opacity={detailLayer === "all" ? (xray ? 0.2 : 0.48) : 0.08} wireframe /></mesh>
    <group>{/* liquid cold plate and parallel channels */}
      <mesh position={[ox, 1.34, coolingZ]}><boxGeometry args={[2.62, 2.36, 0.08]} /><meshStandardMaterial color="#315464" metalness={0.72} roughness={0.3} transparent opacity={thermalOpacity} /></mesh>
      {Array.from({ length: 7 }, (_, i) => <mesh key={i} position={[ox - 1.08 + i * 0.36, 1.34, coolingZ - 0.055]}><boxGeometry args={[0.05, 2.2, 0.045]} /><meshStandardMaterial color="#4d7b8e" metalness={0.76} roughness={0.28} transparent opacity={thermalOpacity} /></mesh>)}
      <mesh position={[ox, 0.01, coolingZ]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.055, 0.055, 2.35, 16]} /><meshStandardMaterial color="#b06b39" metalness={0.75} transparent opacity={thermalOpacity} /></mesh>
      {[-1.1, 1.1].map((x) => <mesh key={x} position={[ox + x, 0.02, coolingZ - 0.03]}><torusGeometry args={[0.1, 0.025, 8, 20, Math.PI]} /><meshStandardMaterial color="#5f94aa" metalness={0.62} transparent opacity={thermalOpacity} /></mesh>)}
    </group>
    {Array.from({ length: 10 }, (_, row) => <mesh key={row} position={[ox, 0.475 + row * STEP_Y, busZ]}><boxGeometry args={[2.18, 0.025, 0.035]} /><meshStandardMaterial color={row % 2 ? "#b97942" : "#c99055"} metalness={0.84} roughness={0.22} transparent opacity={electricalOpacity} /></mesh>)}
    {[-1, 1].map((sx) => <mesh key={sx} position={[ox + sx * 1.31, 1.34, 0.12]}><boxGeometry args={[0.055, 2.5, 0.18]} /><meshStandardMaterial color="#65747b" metalness={0.76} transparent opacity={structureOpacity} /></mesh>)}
    {[-1, 1].map((sy) => <mesh key={sy} position={[ox, 1.34 + sy * 1.22, 0.12]}><boxGeometry args={[2.67, 0.055, 0.18]} /><meshStandardMaterial color="#65747b" metalness={0.76} transparent opacity={structureOpacity} /></mesh>)}
    {[-1, 1].flatMap((sx) => [-1, 1].map((sy) => <mesh key={`${sx}-${sy}`} position={[ox + sx * 1.27, 1.34 + sy * 1.18, 0.25]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.04, 0.04, 0.025, 12]} /><meshStandardMaterial color="#cbd4d5" metalness={0.92} roughness={0.18} /></mesh>))}
    <group position={[ox + 1.18, 1.37, exploded ? 0.9 : 0.34]}>
      <mesh><boxGeometry args={[0.19, 1.55, 0.05]} /><meshStandardMaterial color="#164d3f" roughness={0.62} transparent opacity={controlOpacity} /></mesh>
      {Array.from({ length: 8 }, (_, i) => <mesh key={i} position={[0, -0.64 + i * 0.18, 0.032]}><boxGeometry args={[0.11, 0.055, 0.018]} /><meshStandardMaterial color={i % 3 === 0 ? "#d2ac58" : "#8fa99f"} metalness={0.58} transparent opacity={controlOpacity} /></mesh>)}
    </group>
    {[-0.92, 0.92].map((x, i) => <group key={x} position={[ox + x, 2.69, exploded ? 0.7 : 0.18]}><mesh><cylinderGeometry args={[0.105, 0.12, 0.13, 20]} /><meshStandardMaterial color={i ? "#313b3f" : "#b94938"} metalness={0.68} roughness={0.3} /></mesh><mesh position={[0, 0.08, 0]}><cylinderGeometry args={[0.05, 0.05, 0.04, 12]} /><meshStandardMaterial color="#d6dede" metalness={0.9} /></mesh></group>)}
    <mesh position={[ox - 1.18, 1.34, exploded ? 0.88 : 0.36]}><boxGeometry args={[0.13, 1.6, 0.055]} /><meshStandardMaterial color="#182326" transparent opacity={controlOpacity} /></mesh>
    {[0, 1, 2, 3].map((i) => <mesh key={i} position={[ox - 1.18, 0.82 + i * 0.35, exploded ? 0.92 : 0.4]}><sphereGeometry args={[0.035, 10, 10]} /><meshBasicMaterial color={i === 0 ? "#69db91" : i === 1 ? "#f2c563" : "#6aaee5"} /></mesh>)}
    <group position={[ox, 0.15, exploded ? 0.78 : 0.22]}>
      {[-0.38, 0.38].map((x, i) => <group key={x} position={[x, 0, 0]}><mesh><cylinderGeometry args={[0.16, 0.16, 0.16, 20]} /><meshStandardMaterial color={i ? "#392f2b" : "#26383d"} metalness={0.58} transparent opacity={controlOpacity} /></mesh><mesh position={[0, 0.1, 0]}><cylinderGeometry args={[0.07, 0.07, 0.04, 12]} /><meshStandardMaterial color="#c89155" metalness={0.85} transparent opacity={controlOpacity} /></mesh></group>)}
      <mesh position={[0, 0, 0.02]}><boxGeometry args={[0.42, 0.15, 0.12]} /><meshStandardMaterial color="#1f2b2f" metalness={0.5} transparent opacity={controlOpacity} /></mesh>
    </group>
  </group>;
}

function SwitchMatrix({ ox, bypass, assemblyView, detailLayer, weakCell, active }: { ox: number; bypass: boolean; assemblyView: AssemblyView; detailLayer: DetailLayer; weakCell: number; active: Uint8Array }) {
  const boards = useRef<THREE.InstancedMesh>(null);
  const mosfets = useRef<THREE.InstancedMesh>(null);
  const fuses = useRef<THREE.InstancedMesh>(null);
  const sensors = useRef<THREE.InstancedMesh>(null);
  const obj = useMemo(() => new THREE.Object3D(), []);
  const c = useMemo(() => new THREE.Color(), []);
  const z = assemblyView === "exploded" ? 1.03 : 0.36;
  const focused = detailLayer === "all" || detailLayer === "switching" || detailLayer === "control" || detailLayer === "cooling";
  useEffect(() => {
    if (!boards.current || !mosfets.current || !fuses.current || !sensors.current) return;
    for (let i = 0; i < N; i++) {
      const p = cellPosition(i, ox), scale = i === weakCell ? 1.18 : 1;
      obj.position.set(p.x, p.y - 0.058, z); obj.rotation.set(0, 0, 0); obj.scale.setScalar(scale); obj.updateMatrix(); boards.current.setMatrixAt(i, obj.matrix);
      boards.current.setColorAt(i, c.set(bypass ? (active[i] ? "#1d7358" : "#586269") : "#425059"));
      obj.position.set(p.x - 0.025, p.y - 0.058, z + 0.027); obj.scale.setScalar(scale); obj.updateMatrix(); mosfets.current.setMatrixAt(i, obj.matrix);
      obj.position.set(p.x + 0.037, p.y - 0.058, z + 0.028); obj.updateMatrix(); fuses.current.setMatrixAt(i, obj.matrix);
      obj.position.set(p.x - 0.052, p.y + 0.048, z + 0.02); obj.updateMatrix(); sensors.current.setMatrixAt(i, obj.matrix);
    }
    for (const mesh of [boards.current, mosfets.current, fuses.current, sensors.current]) { mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
  }, [active, assemblyView, bypass, c, obj, ox, weakCell, z]);
  const opacity = focused ? (detailLayer === "all" ? 0.9 : 1) : 0.06;
  return <group>
    <instancedMesh ref={boards} args={[undefined, undefined, N]}><boxGeometry args={[0.112, 0.03, 0.035]} /><meshStandardMaterial roughness={0.55} metalness={0.22} vertexColors transparent opacity={opacity} /></instancedMesh>
    <instancedMesh ref={mosfets} args={[undefined, undefined, N]}><boxGeometry args={[0.027, 0.019, 0.017]} /><meshStandardMaterial color={bypass ? "#11171a" : "#59646a"} metalness={0.52} transparent opacity={opacity} /></instancedMesh>
    <instancedMesh ref={fuses} args={[undefined, undefined, N]}><boxGeometry args={[0.025, 0.014, 0.015]} /><meshStandardMaterial color="#e0d6b5" metalness={0.2} transparent opacity={opacity} /></instancedMesh>
    <instancedMesh ref={sensors} args={[undefined, undefined, N]}><sphereGeometry args={[0.012, 8, 8]} /><meshStandardMaterial color="#e89045" emissive="#5a2108" emissiveIntensity={0.35} transparent opacity={detailLayer === "all" || detailLayer === "cooling" ? 1 : 0.08} /></instancedMesh>
    {Array.from({ length: 10 }, (_, row) => {
      const y = 0.38 + row * STEP_Y + 0.047;
      return <Line key={row} points={[[ox - 1.08, y, z + 0.05], [ox + 1.08, y, z + 0.05], [ox + 1.22, 1.34, z + 0.05]]} color={bypass ? "#62b9c8" : "#82969e"} lineWidth={0.7} transparent opacity={detailLayer === "all" || detailLayer === "control" ? 0.85 : 0.06} />;
    })}
  </group>;
}

function Telemetry({ frame, weakCell, side, title }: { frame: Frame; weakCell: number; side: "left" | "right"; title: string }) {
  const soc = decode(frame.soc_b64), active = decode(frame.active_b64);
  const activeCount = Array.from(active).filter(Boolean).length;
  const avg = Math.round(Array.from(soc).reduce((sum, v) => sum + v, 0) / soc.length / 255 * 100);
  return <div className={`absolute z-10 top-[78px] ${side === "left" ? "left-3" : "right-3"} w-[132px] rounded-md border border-[#456069]/70 bg-[#071216]/88 p-2.5 text-[9px] text-[#b9cbd0] pointer-events-none hidden sm:block`}>
    <div className="text-[10px] font-bold tracking-wide text-white mb-2">{title}</div>
    <div className="flex justify-between py-0.5"><span>STATUS</span><b className={frame.block_online ? "text-[#79d69d]" : "text-[#ef8b77]"}>{frame.block_online ? "ONLINE" : "STOPPED"}</b></div>
    <div className="flex justify-between py-0.5"><span>ACTIVE</span><b>{activeCount}/{N}</b></div>
    <div className="flex justify-between py-0.5"><span>AVG SOC</span><b>{avg}%</b></div>
    <div className="flex justify-between py-0.5"><span>WEAK CELL</span><b>#{weakCell + 1}</b></div>
  </div>;
}

function FitCamera() {
  const { camera, size } = useThree();
  useEffect(() => {
    const aspect = size.width / size.height;
    const t = Math.tan(19 * Math.PI / 180);
    const distance = Math.max(3.6 / (t * aspect), 1.8 / t);
    camera.position.set(0, 1.45, distance);
    camera.lookAt(0, 1.32, 0);
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height]);
  return null;
}

export default function EBSBlock3D({ fixed, bypass, weakCell, minute }: Props) {
  const [webgl, setWebgl] = useState(false);
  const [assemblyView, setAssemblyView] = useState<AssemblyView>("exploded");
  const [detailLayer, setDetailLayer] = useState<DetailLayer>("all");
  useEffect(() => {
    try {
      const canvas = document.createElement("canvas");
      setWebgl(!!(canvas.getContext("webgl2") || canvas.getContext("webgl")));
    } catch { setWebgl(false); }
  }, []);
  const selectedLayer = DETAIL_LAYERS.find((layer) => layer.id === detailLayer)!;
  return <div className="relative h-[390px] sm:h-[500px] rounded-lg overflow-hidden bg-[#061013]">
    <div className="absolute top-3 left-3 right-3 z-10 grid grid-cols-2 gap-2 text-center text-[11px] sm:text-[13px] font-semibold text-white pointer-events-none"><span>A · Conventional BMS<br /><small className="font-normal text-[#a8bac0]">EBS-sized comparison cells</small></span><span>B · REON EBS<br /><small className="font-normal text-[#a8bac0]">modeled cell bypass</small></span></div>
    {webgl && <><div className="absolute z-20 top-[48px] left-1/2 -translate-x-1/2 flex rounded-md overflow-hidden border border-[#456069] bg-[#071216]/95 text-[9px] sm:text-[10px]">
      {(["assembled", "exploded", "xray"] as AssemblyView[]).map((mode) => <button type="button" key={mode} aria-pressed={assemblyView === mode} className={`px-2.5 py-1.5 capitalize ${assemblyView === mode ? "bg-[#dceae5] text-[#0b1713]" : "text-[#c5d3d4] hover:bg-[#17262a]"}`} onClick={() => setAssemblyView(mode)}>{mode}</button>)}
    </div><div className="absolute z-20 top-[80px] left-1/2 -translate-x-1/2 flex rounded-md overflow-hidden border border-[#456069] bg-[#071216]/92 text-[8px] sm:text-[9px]">
      {DETAIL_LAYERS.map((layer) => <button type="button" key={layer.id} aria-pressed={detailLayer === layer.id} title={layer.description} className={`px-2 py-1.5 ${detailLayer === layer.id ? "bg-[#1f7560] text-white" : "text-[#bad0d0] hover:bg-[#17262a]"}`} onClick={() => setDetailLayer(layer.id)}>{layer.label}</button>)}
    </div><Telemetry frame={fixed} weakCell={weakCell} side="left" title="FIXED STRING" /><Telemetry frame={bypass} weakCell={weakCell} side="right" title="CELL BYPASS" /></>}
    {webgl ? <Canvas camera={{ position: [0, 1.45, 10], fov: 38 }} dpr={[1, 2]}>
      <FitCamera />
      <color attach="background" args={["#061013"]} />
      <hemisphereLight args={["#d9e7ec", "#0b1519", 1.1]} />
      <directionalLight position={[-2, 4, 7]} intensity={1.5} />
      <Block frame={fixed} weakCell={weakCell} ox={-1.65} bypass={false} assemblyView={assemblyView} detailLayer={detailLayer} />
      <Block frame={bypass} weakCell={weakCell} ox={1.65} bypass assemblyView={assemblyView} detailLayer={detailLayer} />
      <OrbitControls target={[0, 1.32, 0]} enablePan={false} minDistance={4} maxDistance={17} />
    </Canvas> : <svg viewBox="0 0 1000 340" className="absolute inset-0 w-full h-full" role="img" aria-label="Isometric view of conventional and REON EBS battery cells">
      <SvgBlock frame={fixed} weakCell={weakCell} left={32} bypass={false} />
      <SvgBlock frame={bypass} weakCell={weakCell} left={525} bypass />
    </svg>}
    {webgl && <div className="absolute bottom-9 left-1/2 -translate-x-1/2 z-10 max-w-[420px] rounded border border-[#395158]/70 bg-[#071216]/85 px-3 py-1.5 text-center text-[9px] text-[#c8d7d7] pointer-events-none"><b className="text-white">{selectedLayer.label}</b> · {selectedLayer.description}</div>}
    <div className="absolute bottom-3 left-3 right-3 z-10 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[10px] text-[#c4d6da] pointer-events-none"><span>t+{minute} min</span><span>🟢 active</span><span>🟡 weak / stranded</span><span>🔴 empty</span><span>⚪ bypassed</span><span>🔵 current path</span></div>
    <div className="absolute bottom-3 right-3 z-10 text-[8px] text-[#80979b] pointer-events-none hidden lg:block">ASSUMED INTERNAL ARCHITECTURE · NOT VERIFIED REON CAD</div>
  </div>;
}
