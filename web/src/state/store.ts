"use client";
import { create } from "zustand";

export type ColorMode = "soc" | "soh" | "temp" | "sd" | "diff";

export interface HoverCell { op: "A" | "B" | "C"; string: number; cell: number }

interface StudioState {
  eventIdx: number; age: number; duration: "1h" | "2h" | "4h"; seed: number;
  kHvac: number; sigmaT: number; probeBudget: number; reportBias: number; switchLoss: number; sameCells: boolean;
  colorMode: ColorMode; town: string;
  baseline: "A" | "B";
  view: "peak" | "drain"; drainMin: number; drainPlaying: boolean;
  minute: number; playing: boolean; speed: number;
  hover: HoverCell | null;
  set: (p: Partial<StudioState>) => void;
}

export const useStudio = create<StudioState>((set) => ({
  eventIdx: -1, age: 9, duration: "2h", seed: 0,
  kHvac: 0.25, sigmaT: 2.5, probeBudget: 0, reportBias: 0, switchLoss: 0.01, sameCells: false,
  colorMode: "soc", town: "Sterling",
  baseline: "B",
  view: "peak", drainMin: 0, drainPlaying: false,
  minute: 16 * 60, playing: false, speed: 4,
  hover: null,
  set: (p) => set(p),
}));
