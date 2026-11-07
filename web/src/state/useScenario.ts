"use client";
import { useEffect, useMemo, useState } from "react";
import { Constants, Life, PeakEvent, fetchJson } from "@/engine/data";
import { Scenario, buildScenario } from "@/engine/scenario";
import { useStudio } from "./store";

export function useBaseData() {
  const [c, setC] = useState<Constants | null>(null);
  const [events, setEvents] = useState<PeakEvent[] | null>(null);
  useEffect(() => {
    fetchJson<Constants>("/data/constants.json").then(setC);
    fetchJson<PeakEvent[]>("/data/events.json").then(setEvents);
  }, []);
  return { c, events };
}

export function useScenario(): { scenario: Scenario | null; c: Constants | null; events: PeakEvent[] | null; ms: number } {
  const { c, events } = useBaseData();
  const { eventIdx, age, duration, seed, kHvac, sigmaT, probeBudget, reportBias, switchLoss, set } = useStudio();
  const [life, setLife] = useState<Life | null>(null);
  useEffect(() => {
    setLife(null);
    fetchJson<Life>(`/data/life_${duration}_s${seed}.json`).then(setLife);
  }, [duration, seed]);
  useEffect(() => {
    if (events && eventIdx < 0) {
      const i = events.findIndex((e) => e.is_annual && e.year === 2025);
      set({ eventIdx: i >= 0 ? i : 0 });
    }
  }, [events, eventIdx, set]);
  return useMemo(() => {
    if (!c || !events || !life || eventIdx < 0) return { scenario: null, c, events, ms: 0 };
    const t0 = performance.now();
    const scenario = buildScenario(c, life, events[eventIdx], age, { kHvac, sigmaT, probeBudget, reportBias, switchLoss });
    return { scenario, c, events, ms: performance.now() - t0 };
  }, [c, events, life, eventIdx, age, kHvac, sigmaT, probeBudget, reportBias, switchLoss]);
}
