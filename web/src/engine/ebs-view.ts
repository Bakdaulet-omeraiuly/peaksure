interface Frame { minute: number; block_online: boolean; power_kw: number }
interface Row { fixed: { power_trace: Frame[] }; bypass: { power_trace: Frame[] } }

export function differenceMinute(row: Row): number {
  const representative = row.fixed.power_trace.findIndex((frame, i) => !frame.block_online && row.bypass.power_trace[i].block_online);
  const plant = row.fixed.power_trace.findIndex((frame, i) => row.bypass.power_trace[i].power_kw > frame.power_kw);
  const index = representative >= 0 ? representative : plant;
  return index >= 0 ? row.fixed.power_trace[index].minute : 0;
}
