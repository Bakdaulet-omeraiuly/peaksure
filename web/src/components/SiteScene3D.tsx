"use client";
// Schematic C&I site: utility grid -> revenue meter -> facility, with an EBS-size battery and inverter behind the
// meter. Flow widths and numbers come from the recommendation (load and battery discharge at the selected hour).
// Not a REON layout: the EBS cabinet is a labelled box; its interior and wiring are not modelled here.
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

interface Props { loadKw: number; batteryKw: number; gridKw: number; targetKw: number; hourLabel: string; label: string }

function Flow({ from, to, kw, color, scale }: { from: [number, number, number]; to: [number, number, number]; kw: number; color: string; scale: number }) {
  const dots = useRef<(THREE.Mesh | null)[]>([]);
  const a = useMemo(() => new THREE.Vector3(...from), [from]), b = useMemo(() => new THREE.Vector3(...to), [to]);
  const w = Math.max(0.01, Math.min(0.09, (kw / scale) * 0.09));
  useFrame(({ clock }) => {
    dots.current.forEach((d, i) => { if (d) d.position.lerpVectors(a, b, (clock.getElapsedTime() * 0.35 + i / 4) % 1); });
  });
  const mid = a.clone().add(b).multiplyScalar(0.5), len = a.distanceTo(b);
  const rot = new THREE.Euler(0, 0, Math.atan2(b.y - a.y, b.x - a.x));
  return <group>
    <mesh position={mid} rotation={rot}><boxGeometry args={[len, w, w]} /><meshStandardMaterial color={kw > 0.05 ? color : "#59636b"} /></mesh>
    {kw > 0.05 && Array.from({ length: 4 }, (_, i) => <mesh key={i} ref={(el) => { dots.current[i] = el; }}><sphereGeometry args={[w * 0.9 + 0.02, 10, 10]} /><meshBasicMaterial color="#f4fbff" /></mesh>)}
  </group>;
}

const Tag = ({ p, children }: { p: [number, number, number]; children: React.ReactNode }) => (
  <Html position={p} center distanceFactor={6} style={{ pointerEvents: "none" }}>
    <div className="text-[11px] leading-tight whitespace-nowrap rounded bg-[#0b1418]/85 text-[#e6eef0] px-1.5 py-0.5 border border-[#2c3b42] text-center">{children}</div>
  </Html>);

export default function SiteScene3D({ loadKw, batteryKw, gridKw, targetKw, hourLabel, label }: Props) {
  const [webgl, setWebgl] = useState(false);
  useEffect(() => { try { const c = document.createElement("canvas"); setWebgl(!!(c.getContext("webgl2") || c.getContext("webgl"))); } catch { setWebgl(false); } }, []);
  const scale = Math.max(loadKw, 1);
  const over = gridKw > targetKw + 0.05;
  if (!webgl) return <div className="rounded-lg bg-[#0b1418] text-[#dfe8ea] p-4 text-[12px] num">
    <div className="font-semibold mb-1">Site at {hourLabel} ({label})</div>
    Grid → meter {gridKw.toFixed(1)} kW · facility load {loadKw.toFixed(1)} kW · battery discharge {batteryKw.toFixed(1)} kW · demand target {targetKw.toFixed(1)} kW
    <div className="text-[#93a6ab] mt-1">Schematic; 3D graphics unavailable.</div></div>;
  return <div className="relative h-[300px] sm:h-[340px] rounded-lg overflow-hidden bg-[#0b1418]">
    <Canvas camera={{ position: [0, 5.2, 12.5], fov: 40 }} dpr={[1, 2]}>
      <color attach="background" args={["#0b1418"]} />
      <hemisphereLight args={["#e6eef2", "#121a1d", 1.0]} /><directionalLight position={[4, 8, 6]} intensity={1.2} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}><planeGeometry args={[16, 9]} /><meshStandardMaterial color="#1a262b" /></mesh>
      {/* utility pole and line */}
      <mesh position={[-5.6, 1.4, 0]}><cylinderGeometry args={[0.06, 0.08, 2.8, 10]} /><meshStandardMaterial color="#8a7a63" /></mesh>
      <mesh position={[-5.6, 2.7, 0]}><boxGeometry args={[0.9, 0.06, 0.06]} /><meshStandardMaterial color="#8a7a63" /></mesh>
      {/* meter */}
      <mesh position={[-3, 0.6, 0]}><boxGeometry args={[0.5, 0.8, 0.35]} /><meshStandardMaterial color="#c7cfd2" /></mesh>
      {/* facility */}
      <mesh position={[2.6, 1.1, -0.6]}><boxGeometry args={[4.2, 2.2, 2.6]} /><meshStandardMaterial color="#5f7884" /></mesh>
      <mesh position={[2.6, 2.26, -0.6]}><boxGeometry args={[4.3, 0.12, 2.7]} /><meshStandardMaterial color="#3e4f57" /></mesh>
      {Array.from({ length: 5 }, (_, i) => <mesh key={i} position={[1.0 + i * 0.8, 1.2, 0.71]}><planeGeometry args={[0.5, 0.7]} /><meshStandardMaterial color={over ? "#f0c674" : "#9fd3e6"} emissive={over ? "#5a4210" : "#0d3442"} /></mesh>)}
      {/* inverter and EBS cabinet (schematic boxes) */}
      <mesh position={[-1.0, 0.45, 1.9]}><boxGeometry args={[0.6, 0.9, 0.4]} /><meshStandardMaterial color="#7b8b93" /></mesh>
      <mesh position={[0.3, 0.75, 1.9]}><boxGeometry args={[0.9, 1.5, 0.7]} /><meshStandardMaterial color="#2f7d5a" /></mesh>
      <Flow from={[-5.6, 2.6, 0]} to={[-3, 0.9, 0]} kw={gridKw} color="#7fb2ff" scale={scale} />
      <Flow from={[-3, 0.9, 0]} to={[0.5, 0.9, 0]} kw={gridKw} color="#7fb2ff" scale={scale} />
      <Flow from={[0.3, 1.5, 1.9]} to={[-1.0, 0.9, 1.9]} kw={batteryKw} color="#5fd39a" scale={scale} />
      <Flow from={[-1.0, 0.9, 1.9]} to={[0.5, 0.9, 0.1]} kw={batteryKw} color="#5fd39a" scale={scale} />
      <Tag p={[-5.0, 2.85, 0]}>Utility grid<br />{gridKw.toFixed(1)} kW import</Tag>
      <Tag p={[-3.2, 2.1, 0]}>Revenue meter<br />G-2 bills 15-min peak</Tag>
      <Tag p={[2.6, 2.75, -0.6]}>Facility load {loadKw.toFixed(1)} kW<br />target ≤ {targetKw.toFixed(1)} kW</Tag>
      <Tag p={[-1.9, 0.25, 2.9]}>Inverter (schematic)</Tag>
      <Tag p={[1.1, 2.35, 2.4]}>EBS-size block (schematic)<br />discharging {batteryKw.toFixed(1)} kW</Tag>
      <OrbitControls target={[0, 1, 0.5]} enablePan={false} minDistance={6} maxDistance={16} maxPolarAngle={Math.PI / 2.1} />
    </Canvas>
    <div className="absolute bottom-2 left-3 text-[10.5px] text-[#9fb2b7]">{hourLabel} · {label} · schematic site; flows from the advisory dispatch, not measured telemetry</div>
  </div>;
}
