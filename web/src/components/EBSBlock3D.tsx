"use client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Line, OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

interface Frame { soc_b64: string; active_b64: string; block_online: boolean }
interface Props { fixed: Frame; bypass: Frame; weakCell: number; minute: number }

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
    new THREE.Vector3(pos.x - 0.28, pos.y, 0.35),
    new THREE.Vector3(pos.x - 0.2, pos.y + 0.24, 0.35),
    new THREE.Vector3(pos.x + 0.2, pos.y + 0.24, 0.35),
    new THREE.Vector3(pos.x + 0.28, pos.y, 0.35),
  ] : [new THREE.Vector3(pos.x - 0.28, pos.y, 0.35), new THREE.Vector3(pos.x + 0.28, pos.y, 0.35)], [pos.x, pos.y, bypassed]);
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

function Block({ frame, weakCell, ox, bypass }: { frame: Frame; weakCell: number; ox: number; bypass: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const obj = useMemo(() => new THREE.Object3D(), []);
  const green = useMemo(() => new THREE.Color("#3fbf7f"), []);
  const dark = useMemo(() => new THREE.Color("#1b3532"), []);
  const weakPos = useMemo(() => cellPosition(weakCell, ox), [weakCell, ox]);
  const soc = useMemo(() => decode(frame.soc_b64), [frame.soc_b64]);
  const active = useMemo(() => decode(frame.active_b64), [frame.active_b64]);
  const weakBypassed = bypass && !active[weakCell] && frame.block_online;

  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    for (let i = 0; i < N; i++) {
      const p = cellPosition(i, ox);
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
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [frame.block_online, soc, active, bypass, weakCell, ox, obj, dark, green]);

  return <group>
    <mesh position={[ox, 1.34, -0.08]}><boxGeometry args={[2.75, 2.5, 0.22]} /><meshStandardMaterial color="#132027" roughness={0.85} /></mesh>
    <mesh position={[ox, 1.34, -0.08]}><boxGeometry args={[2.78, 2.53, 0.24]} /><meshBasicMaterial color={bypass ? "#3f9b62" : "#657d88"} wireframe /></mesh>
    <instancedMesh ref={mesh} args={[undefined, undefined, N]}><boxGeometry args={[0.14, 0.15, 0.14]} /><meshStandardMaterial roughness={0.5} metalness={0.08} /></instancedMesh>
    <mesh position={[weakPos.x, weakPos.y, 0.23]}><torusGeometry args={[0.13, 0.015, 8, 28]} /><meshBasicMaterial color={weakBypassed ? "#9aa6b0" : "#f4c76d"} /></mesh>
    <CurrentPath pos={weakPos} online={frame.block_online} bypassed={weakBypassed} />
  </group>;
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
  useEffect(() => {
    try {
      const canvas = document.createElement("canvas");
      setWebgl(!!(canvas.getContext("webgl2") || canvas.getContext("webgl")));
    } catch { setWebgl(false); }
  }, []);
  return <div className="relative h-[340px] sm:h-[410px] rounded-lg overflow-hidden bg-[#061013]">
    <div className="absolute top-3 left-3 right-3 z-10 grid grid-cols-2 gap-2 text-center text-[11px] sm:text-[13px] font-semibold text-white pointer-events-none"><span>A · Conventional BMS<br /><small className="font-normal text-[#a8bac0]">EBS-sized comparison cells</small></span><span>B · REON EBS<br /><small className="font-normal text-[#a8bac0]">modeled cell bypass</small></span></div>
    {webgl ? <Canvas camera={{ position: [0, 1.45, 10], fov: 38 }} dpr={[1, 2]}>
      <FitCamera />
      <color attach="background" args={["#061013"]} />
      <hemisphereLight args={["#d9e7ec", "#0b1519", 1.1]} />
      <directionalLight position={[-2, 4, 7]} intensity={1.5} />
      <Block frame={fixed} weakCell={weakCell} ox={-1.65} bypass={false} />
      <Block frame={bypass} weakCell={weakCell} ox={1.65} bypass />
      <OrbitControls target={[0, 1.32, 0]} enablePan={false} minDistance={4} maxDistance={17} />
    </Canvas> : <svg viewBox="0 0 1000 340" className="absolute inset-0 w-full h-full" role="img" aria-label="Isometric view of conventional and REON EBS battery cells">
      <SvgBlock frame={fixed} weakCell={weakCell} left={32} bypass={false} />
      <SvgBlock frame={bypass} weakCell={weakCell} left={525} bypass />
    </svg>}
    <div className="absolute bottom-3 left-3 right-3 z-10 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[10px] text-[#c4d6da] pointer-events-none"><span>t+{minute} min</span><span>🟢 active</span><span>🟡 weak / stranded</span><span>🔴 empty</span><span>⚪ bypassed</span><span>🔵 current path</span></div>
  </div>;
}
