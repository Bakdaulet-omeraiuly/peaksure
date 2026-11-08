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
  const lifeKey = `${duration}_s${seed}`;
  const [loaded, setLoaded] = useState<{ key: string; life: Life } | null>(null);
  useEffect(() => {
    let current = true;
    fetchJson<Life>(`/data/life_${lifeKey}.json`).then((life) => {
      if (current) setLoaded({ key: lifeKey, life });
    });
    return () => { current = false; };
  }, [lifeKey]);
  useEffect(() => {
    if (events && eventIdx < 0) {
      const i = events.findIndex((e) => e.is_annual && e.year === 2025);
      set({ eventIdx: i >= 0 ? i : 0 });
    }
  }, [events, eventIdx, set]);
  return useMemo(() => {
    if (!c || !events || loaded?.key !== lifeKey || eventIdx < 0 || eventIdx >= events.length)
      return { scenario: null, c, events, ms: 0 };
    const t0 = performance.now();
    const scenario = buildScenario(c, loaded.life, events[eventIdx], age, { kHvac, sigmaT, probeBudget, reportBias, switchLoss });
    return { scenario, c, events, ms: performance.now() - t0 };
  }, [c, events, loaded, lifeKey, eventIdx, age, kHvac, sigmaT, probeBudget, reportBias, switchLoss]);
}
