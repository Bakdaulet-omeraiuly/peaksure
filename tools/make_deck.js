// Rebuild: NODE_PATH=<dir with pptxgenjs> PPTX_SKILL=<pptx skill dir> node tools/make_deck.js submission/PeakSure_deck.pptx
// PeakSure pitch deck (updated). Numbers read from the repo's exported model data.
const fs = require("fs");
const path = require("path");
const pptxgen = require("pptxgenjs");
const { applyTheme } = require(process.env.PPTX_SKILL + "/scripts/apply_theme.js");

const REPO = "/Users/riyabhandari/Documents/GitHub/peaksure";
const J = (f) => JSON.parse(fs.readFileSync(path.join(REPO, "web/public/data", f), "utf8"));
const R = J("results.json"), S = J("strategy.json"), EV = J("events.json"), C0 = J("constants.json");
const sens = Object.fromEntries(R.sens.map((x) => [x.tag, x]));
const val = (t) => sens[t].v1 + sens[t].v2;
const t1 = Object.fromEntries(R.t1.map((x) => [x.cond, x]));
const decV = (p) => R.dec.find((d) => d.component.startsWith(p)).mean;
const base = decV("V1") + decV("V2");
const peak = EV.filter((e) => e.is_annual).sort((a, b) => a.year - b.year).pop();
const cfg = S.source.config;
const first = (v) => (Array.isArray(v) ? v[0] : v);
const augA = first(t1.A.aug), augB = first(t1.B.aug);
const lowest = (c) => Math.min(...R.bands.filter((b) => b.cond === c).map((b) => b.p50 / cfg.e_nom_kwh));
const k = (x, d = 0) => `$${(x / 1000).toFixed(d)}K`;
const pct = (x) => `${Math.round(x * 100)}%`;
const fmt = (x) => Math.round(x).toLocaleString("en-US");
// drain test result read from the live Compare page during the video build (tools/make_pitch_video.py)
const DRAIN = { a_del: 3855, a_str: 638, b_del: 4212, b_str: 204 };
const TOWNS = [["Sterling", "2 MW / 3.9 MWh", "2016"], ["Reading", "5 MW / 10 MWh", "2019"], ["Holden", "5 MW / 22 MWh", "2024"]];

const THEME = {
  name: "PeakSure", headFontFace: "Arial", bodyFontFace: "Arial",
  colors: { dk1: "0B241C", lt1: "F0F6F3", dk2: "123429", lt2: "AAC4B9", accent1: "7EE2A0", accent2: "E9A23B",
            accent3: "EF4A3C", accent4: "4F7F9B", accent5: "2E604C", accent6: "687A83", hlink: "7EE2A0", folHlink: "AAC4B9" },
};
const BG = "0B241C", CARD = "123429", LINE = "2E604C", GREEN = "7EE2A0", AMBER = "E9A23B", RED = "EF4A3C", WHITE = "F0F6F3", MUTED = "AAC4B9";

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in
pres.title = "PeakSure × REON EBS";
pres.author = "PeakSure team";
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };

const FOOT = "PeakSure × REON EBS  ·  simulation on real ISO-NE data  ·  independent analysis, not endorsed by REON";
pres.defineSlideMaster({
  title: "CONTENT", background: { color: BG },
  objects: [
    { placeholder: { options: { name: "eyebrow", type: "body", x: 0.6, y: 0.35, w: 12.1, h: 0.35, fontSize: 12, bold: true, color: GREEN, charSpacing: 2, margin: 0, align: "left" }, text: "" } },
    { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 0.7, w: 12.1, h: 0.95, fontSize: 32, bold: true, color: WHITE, margin: 0, valign: "top", align: "left" }, text: "" } },
    { text: { text: FOOT, options: { x: 0.6, y: 7.05, w: 10.5, h: 0.3, fontSize: 9, color: "6E8C80", margin: 0 } } },
  ],
  slideNumber: { x: 12.3, y: 7.05, w: 0.5, h: 0.3, fontSize: 9, color: "6E8C80", align: "right" },
});
pres.defineSlideMaster({ title: "COVER", background: { color: BG }, objects: [] });

const card = (s, x, y, w, h, name) => s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.12, fill: { color: CARD }, line: { color: LINE, width: 1 }, objectName: name });
const txt = (s, t, o) => s.addText(t, { isTextBox: true, margin: 0, color: WHITE, fontSize: 14, valign: "top", ...o });
const stat = (s, x, y, w, big, label, color = GREEN) => {
  txt(s, big, { x, y, w, h: 0.75, fontSize: 40, bold: true, color });
  txt(s, label, { x, y: y + 0.78, w, h: 0.6, fontSize: 13, color: MUTED });
};
const head = (s, eyebrow, title) => {
  s.addText(eyebrow.toUpperCase(), { placeholder: "eyebrow" });
  s.addText(title, { placeholder: "title" });
};

// 1 · Cover
{
  const s = pres.addSlide({ masterName: "COVER" });
  txt(s, "MIT ENERGY & CLIMATE HACK 2026  ·  REON CHALLENGE", { x: 0.8, y: 1.3, w: 11, h: 0.4, fontSize: 14, bold: true, color: GREEN, charSpacing: 2 });
  txt(s, "PeakSure", { x: 0.8, y: 1.9, w: 11, h: 1.3, fontSize: 66, bold: true });
  txt(s, "Know what your battery can deliver when it counts", { x: 0.8, y: 3.25, w: 11, h: 0.7, fontSize: 28, color: GREEN });
  txt(s, "Cell-level intelligence with REON EBS for the batteries Massachusetts towns use at peak hours: prove it on today's batteries, then build it into tomorrow's.", { x: 0.8, y: 4.1, w: 10.5, h: 0.9, fontSize: 18, color: MUTED });
  txt(s, "Zhamilya Toleukhan · Riya Bhandari · Bakdaulet Omertayev · Aliya Khabiyeva", { x: 0.8, y: 5.9, w: 11, h: 0.4, fontSize: 14 });
  txt(s, "Independent analysis, not endorsed by REON", { x: 0.8, y: 6.35, w: 11, h: 0.35, fontSize: 11, color: "6E8C80" });
  s.addNotes("PeakSure, with REON's Energy Block System.");
}

// 2 · Problem
{
  const s = pres.addSlide({ masterName: "CONTENT" });
  head(s, "The problem", "One summer hour decides a town's power bill");
  txt(s, [
    { text: `Massachusetts towns pay ISO-NE transmission ($${C0.rns_2026}/kW-yr) on 12 monthly peaks and capacity ($${C0.fca_kw_month}/kW-month) on the annual peak. Those charges reach every household.`, options: { breakLine: true } },
    { text: " ", options: { breakLine: true, fontSize: 8 } },
    { text: "Today, operators guess. ", options: { bold: true, color: AMBER } },
    { text: "Promise too much and the battery runs dry before the peak ends; too little and savings stay on the table." },
  ], { x: 0.6, y: 1.85, w: 5.2, h: 2.6, fontSize: 16 });
  stat(s, 0.6, 4.7, 5.2, "$244,460", "saved by Sterling's battery at one annual peak (Community Resilience Center, 2017)", GREEN);
  s.addChart(pres.charts.LINE, [{ name: "ISO-NE load (MW)", labels: peak.load.map((_, i) => `${i + 1}`), values: peak.load.map(Math.round) }], {
    x: 6.2, y: 1.8, w: 6.6, h: 4.6, showTitle: true, title: `ISO-NE system load on the ${peak.date} annual peak (HE${peak.he}, ${Math.round(peak.t_amb_c)} °C)`,
    titleColor: WHITE, titleFontSize: 13, titleFontFace: "+mn-lt", chartColors: [GREEN], lineSize: 3, lineDataSymbol: "none", showLegend: false,
    catAxisLabelColor: MUTED, valAxisLabelColor: MUTED, catAxisLabelFontSize: 10, valAxisLabelFontSize: 10, catAxisLabelFontFace: "+mn-lt", valAxisLabelFontFace: "+mn-lt",
    valGridLine: { color: "1F4A3B", size: 0.5 }, catGridLine: { style: "none" }, catAxisTitle: "Hour ending", showCatAxisTitle: true, catAxisTitleColor: MUTED, catAxisTitleFontSize: 10,
    valAxisMinVal: 14000, plotArea: { fill: { color: BG } }, objectName: "peak load chart",
  });
  txt(s, "Our tool and video use this real 2025 peak (data: ISO-NE 2019–2025). The 2026 peak was 2 July, HE19, 25,361 MW (ISO-NE, Aug 2026).", { x: 6.2, y: 6.45, w: 6.6, h: 0.45, fontSize: 10, color: MUTED });
  s.addNotes(`The problem: a few peak hours set the grid bill. Massachusetts utilities pay ${C0.rns_2026} dollars per kilowatt-year on each monthly peak, and every household pays it. Shave the peak, and power gets cheaper and more reliable.`);
}

// 3 · Why batteries fall short / where REON comes in
{
  const s = pres.addSlide({ masterName: "CONTENT" });
  head(s, "Where REON comes in", "One weak cell stops a whole string. REON switches it out");
  const cell = (row, i, color) => s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.6 + i * 0.36, y: row, w: 0.3, h: 0.75, rectRadius: 0.05, fill: { color }, line: { color: BG, width: 0 }, objectName: `cell ${row}-${i}` });
  txt(s, "Conventional string: stops when the 70 Ah cell is empty", { x: 0.6, y: 1.9, w: 6, h: 0.35, fontSize: 13, color: MUTED });
  for (let i = 0; i < 16; i++) cell(2.3, i, i === 6 ? RED : "4FA877");
  txt(s, "REON bypass: weak cell switched out, the rest keep going", { x: 0.6, y: 3.3, w: 6, h: 0.35, fontSize: 13 });
  for (let i = 0; i < 16; i++) cell(3.7, i, i === 6 ? "5A646C" : GREEN);
  txt(s, "+20% energy on the challenge's 16-cell example (84.06 vs 70 Ah per cell)", { x: 0.6, y: 4.65, w: 6, h: 0.4, fontSize: 14, bold: true, color: GREEN });
  card(s, 7.0, 1.85, 5.8, 4.9, "drain test card");
  txt(s, "DRAIN TEST · same cells, full power until every string stops", { x: 7.3, y: 2.05, w: 5.3, h: 0.35, fontSize: 11, bold: true, color: GREEN, charSpacing: 1 });
  stat(s, 7.3, 2.6, 2.6, `${fmt(DRAIN.a_str)} kWh`, "stranded by fixed strings", AMBER);
  stat(s, 10.0, 2.6, 2.6, `${fmt(DRAIN.b_str)} kWh`, "stranded with REON bypass", GREEN);
  txt(s, `Delivered: ${fmt(DRAIN.a_del)} kWh conventional vs ${fmt(DRAIN.b_del)} kWh REON EBS`, { x: 7.3, y: 4.35, w: 5.3, h: 0.4, fontSize: 15 });
  txt(s, "Modelled plant: 8 strings × 240 cells (simulation abstraction, not REON's design), battery age 9 years. Simulated.", { x: 7.3, y: 5.6, w: 5.3, h: 0.9, fontSize: 11, color: MUTED });
  s.addNotes(`In a normal battery, the weakest cell stops the whole string. REON switches that cell out, so the rest keep delivering. Drained to empty, fixed strings strand ${DRAIN.a_str} kilowatt-hours; REON EBS strands only ${DRAIN.b_str}.`);
}


const tracker = (s, active) => {
  [["1", "Retrofit"], ["2", "Scale"]].forEach(([n, t], i) => {
    const on = i + 1 === active, x = 9.55 + i * 1.75;
    s.addShape(pres.shapes.OVAL, { x, y: 0.32, w: 0.4, h: 0.4, fill: { color: on ? GREEN : CARD }, line: { color: GREEN, width: 1 }, objectName: `tracker ${n}` });
    txt(s, n, { x, y: 0.32, w: 0.4, h: 0.4, fontSize: 13, bold: true, color: on ? BG : GREEN, align: "center", valign: "middle" });
    txt(s, t, { x: x + 0.5, y: 0.32, w: 1.1, h: 0.4, fontSize: 13, bold: on, color: on ? WHITE : MUTED, valign: "middle" });
  });
  s.addShape(pres.shapes.LINE, { x: 10.6, y: 0.52, w: 0.6, h: 0, line: { color: GREEN, width: 1.5, endArrowType: "triangle" }, objectName: "tracker arrow" });
};

// 5 · Phase 1
{
  const s = pres.addSlide({ masterName: "CONTENT" });
  head(s, "Our solution · Phase 1 · Retrofit", "Add cell-level control to batteries that already exist");
  tracker(s, 1);
  card(s, 0.6, 1.9, 4.0, 4.8, "cost card");
  txt(s, "COST", { x: 0.9, y: 2.1, w: 3.5, h: 0.3, fontSize: 11, bold: true, color: GREEN, charSpacing: 2 });
  txt(s, `$${S.assumptions.retrofit_cost.low}–${S.assumptions.retrofit_cost.high}`, { x: 0.9, y: 2.5, w: 3.5, h: 0.8, fontSize: 40, bold: true });
  txt(s, "per kWh (team estimate). No new battery to buy.", { x: 0.9, y: 3.35, w: 3.4, h: 0.6, fontSize: 14, color: MUTED });
  txt(s, "Exit test: more energy delivered and fewer missed peaks, measured against the same battery's history.", { x: 0.9, y: 4.3, w: 3.4, h: 1.4, fontSize: 14 });
  txt(s, "WHERE IT PAYS · extra savings per year (model)", { x: 5.0, y: 1.9, w: 7.7, h: 0.3, fontSize: 11, bold: true, color: GREEN, charSpacing: 1 });
  const rows = [["Faulty cells (0.2%/yr)", val("fault_scenario")], ["Failing cooling", val("hvac_failing")], ["1-hour battery", val("duration_1h")], ["4-hour battery", val("duration_4h")], ["Healthy 2-hour battery", base]];
  rows.forEach(([l, v], i) => {
    txt(s, l, { x: 5.0, y: 2.35 + i * 0.5, w: 4.0, h: 0.4, fontSize: 15, color: MUTED });
    txt(s, `${v >= 0 ? "+" : "−"}${k(Math.abs(v), Math.abs(v) < 10000 ? 1 : 0)}`, { x: 9.0, y: 2.35 + i * 0.5, w: 1.8, h: 0.4, fontSize: 16, bold: true, color: v > 1000 ? GREEN : MUTED, align: "right" });
  });
  txt(s, "MASSACHUSETTS CANDIDATES", { x: 5.0, y: 5.05, w: 7.7, h: 0.3, fontSize: 11, bold: true, color: GREEN, charSpacing: 1 });
  TOWNS.forEach(([n, size, yr], i) => txt(s, [{ text: `${n}  `, options: { bold: true, color: WHITE } }, { text: `${size} (${yr})`, options: { color: MUTED } }], { x: 5.0 + i * 2.6, y: 5.45, w: 2.5, h: 0.6, fontSize: 14 }));
  s.addNotes(`Our approach has two phases: first retrofit existing batteries to prove it, then scale by selling REON EBS with cell control built in. Phase one adds REON's cell-level BMS to installed batteries for about ${S.assumptions.retrofit_cost.low} to ${S.assumptions.retrofit_cost.high} dollars per kilowatt-hour. It pays most where cells limit delivery: up to ${k(val("fault_scenario"))} a year. Sterling, Reading and Holden are ready candidates.`);
}

// 6 · Phase 2
{
  const s = pres.addSlide({ masterName: "CONTENT" });
  head(s, "Our solution · Phase 2 · Scale", "With proof in hand, sell REON EBS with cell control");
  tracker(s, 2);
  const blocks = [
    ["When", ["Phase 1 shows measured extra energy and fewer missed peaks", "REON confirms EBS specifications and certification"]],
    ["Where", ["New municipal light plant storage in Massachusetts", "Commercial sites on demand charges, e.g. National Grid G-2 at $15.24/kW-month"]],
    ["How", [`Priced ${Math.round(S.assumptions.premium.low * 100)}% to +${Math.round(S.assumptions.premium.high * 100)}% vs a conventional battery (team estimate)`, "PeakSure ships as the decision layer"]],
  ];
  blocks.forEach(([t, lines], i) => {
    const x = 0.6 + i * 4.1;
    card(s, x, 2.0, 3.9, 3.8, `phase 2 ${t}`);
    txt(s, t, { x: x + 0.3, y: 2.25, w: 3.3, h: 0.5, fontSize: 22, bold: true, color: GREEN });
    txt(s, lines.map((l, j) => ({ text: l, options: { bullet: true, breakLine: j < lines.length - 1 } })), { x: x + 0.3, y: 2.9, w: 3.3, h: 2.7, fontSize: 15, paraSpaceAfter: 8 });
  });
  const naE = S.chemistries.find((c) => c.name === "Na-ion");
  txt(s, [{ text: "Economics: ", options: { bold: true, color: GREEN } }, { text: `team sheet 3 MW / 9 MWh (167 EBS): upfront ≈ $4.0M, NPV +$0.91M at $500K/yr savings · our simulation, new 2.5 MW / 5 MWh plant: NPV $${(naE.npv_full.A / 1e6).toFixed(2)}M conventional, $${(naE.npv_full.C / 1e6).toFixed(2)}M EBS + PeakSure at assumed prices`, options: { color: MUTED } }], { x: 0.6, y: 6.0, w: 12.1, h: 0.6, fontSize: 12 });
  s.addNotes("With that proof, we scale: REON EBS for new municipal storage, and for commercial sites on demand charges like National Grid's G-2 rate.");
}

// 7 · How it works
{
  const s = pres.addSlide({ masterName: "CONTENT" });
  head(s, "How the model works", "Real peaks in, a dollar answer out");
  const steps = [["Real data", "ISO-NE hourly peaks and temperatures, 2019–2025"], ["Cell physics", "Every cell ages, heats and drains over 15 years"], ["Digital twin", "Estimates what each cell can still deliver"], ["Commit and score", "95% commitment, scored on kW actually delivered"]];
  steps.forEach(([t, d], i) => {
    const x = 0.6 + i * 3.1;
    card(s, x, 1.9, 2.9, 2.0, `step ${i + 1}`);
    s.addShape(pres.shapes.OVAL, { x: x + 0.25, y: 2.1, w: 0.5, h: 0.5, fill: { color: GREEN }, line: { color: GREEN }, objectName: `step badge ${i + 1}` });
    txt(s, String(i + 1), { x: x + 0.25, y: 2.1, w: 0.5, h: 0.5, fontSize: 16, bold: true, color: BG, align: "center", valign: "middle" });
    txt(s, t, { x: x + 0.9, y: 2.1, w: 1.9, h: 0.5, fontSize: 16, bold: true, valign: "middle" });
    txt(s, d, { x: x + 0.25, y: 2.8, w: 2.45, h: 1.0, fontSize: 13, color: MUTED });
  });
  txt(s, "Three cases on identical cells", { x: 0.6, y: 4.15, w: 6, h: 0.4, fontSize: 16, bold: true, color: GREEN });
  txt(s, [
    { text: "A · Conventional: ", options: { bold: true } }, { text: "fixed strings, one pack test a year", options: { breakLine: true, color: MUTED } },
    { text: "B · REON EBS: ", options: { bold: true } }, { text: "cell bypass, same operator rule", options: { breakLine: true, color: MUTED } },
    { text: "C · REON EBS + PeakSure: ", options: { bold: true } }, { text: "twin of every cell, commits with 95% confidence", options: { color: MUTED } },
  ], { x: 0.6, y: 4.6, w: 6.4, h: 1.4, fontSize: 14, paraSpaceAfter: 4 });
  const tags = [["CONFIRMED", "4F9F72", "ISO-NE peaks and rates; EBS 30 kW / 60 kWh"], ["DERIVED", "4F7F9B", "2 h = 5 MWh ÷ 2.5 MW, nominal only"], ["LITERATURE", "6B6BB0", "Na-ion ageing (TUM lab data)"], ["ASSUMED", "8A6D3B", "8 × 240 cells, switch loss, DC floor"]];
  tags.forEach(([t, c, d], i) => {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 7.4, y: 4.2 + i * 0.48, w: 1.45, h: 0.34, rectRadius: 0.06, fill: { color: c }, line: { color: c }, objectName: `tag ${t}` });
    txt(s, t, { x: 7.4, y: 4.2 + i * 0.48, w: 1.45, h: 0.34, fontSize: 10, bold: true, align: "center", valign: "middle" });
    txt(s, d, { x: 9.0, y: 4.2 + i * 0.48, w: 3.8, h: 0.34, fontSize: 12, color: MUTED, valign: "middle" });
  });
  txt(s, `Monte Carlo: ${R.manifest.n_main} paired runs per case on a modelled 2.5 MW / 5 MWh plant (about 84 EBS blocks). The browser model matches the Python model to 0.001 kWh.`, { x: 0.6, y: 6.25, w: 12.1, h: 0.45, fontSize: 11, color: MUTED });
  s.addNotes("The method compares three cases on identical cells: a conventional battery, the same cells with REON's bypass, and REON plus PeakSure's cell twin with a ninety-five percent confidence commitment.");
}

// 8 · Results
{
  const s = pres.addSlide({ masterName: "CONTENT" });
  head(s, "Results", "It pays where cells limit delivery");
  stat(s, 0.6, 1.9, 3.8, "≈ $0", `2-hour plant, normal duty: bypass + twin ${base < 0 ? "−" : "+"}$${fmt(Math.abs(base))}/yr. Peak timing matters more.`, MUTED);
  stat(s, 0.6, 3.35, 3.8, `+${k(val("duration_4h"), 1)}/yr`, "4-hour system (hypothetical): bypass + twin", GREEN);
  stat(s, 0.6, 4.8, 3.8, `${pct(t1.C.capture)} vs ${pct(t1.A.capture)}`, "monthly peaks covered: PeakSure's 95% commitment vs conventional", GREEN);
  const cases = [["Cell faults (0.2%/yr)", "fault_scenario"], ["Failing cooling", "hvac_failing"], ["1-hour system", "duration_1h"], ["Weak cooling", "hvac_weak"], ["4-hour system", "duration_4h"], ["LFP cells", "chem_LFP"]];
  const notPay = [["Switch loss 2%", "switch_loss_0.02"], ["High ageing spread", "aging_sigma_high"], ["Many dispatch days", "dispatch_high"]];
  s.addChart(pres.charts.BAR, [{ name: "Max premium for cell control ($/kWh)", labels: cases.map((c) => c[0]), values: cases.map((c) => Math.round(sens[c[1]].prem_c * 10) / 10) }], {
    x: 4.8, y: 1.8, w: 8.0, h: 4.4, barDir: "bar", valAxisMinVal: 0, showTitle: true, title: "Most an owner could pay for cell control, $/kWh (15 yr)", titleColor: WHITE, titleFontSize: 13, titleFontFace: "+mn-lt",
    chartColors: [GREEN], showValue: true, dataLabelPosition: "outEnd", dataLabelColor: WHITE, dataLabelFontSize: 11, dataLabelFontFace: "+mn-lt", dataLabelFormatCode: "0.0",
    catAxisLabelColor: MUTED, valAxisLabelColor: MUTED, catAxisLabelFontSize: 11, valAxisLabelFontSize: 10, catAxisLabelFontFace: "+mn-lt", valAxisLabelFontFace: "+mn-lt",
    valGridLine: { color: "1F4A3B", size: 0.5 }, catGridLine: { style: "none" }, showLegend: false, catAxisOrientation: "maxMin", plotArea: { fill: { color: BG } }, objectName: "premium chart",
  });
  txt(s, [{ text: "Where it does not pay: ", options: { bold: true, color: AMBER } }, { text: notPay.map(([l, t]) => `${l} ${sens[t].prem_c.toFixed(1)}`).join("  ·  ") + " $/kWh", options: { color: MUTED } }], { x: 4.8, y: 6.3, w: 8.0, h: 0.4, fontSize: 12 });
  s.addNotes(`On a healthy two-hour battery the gain is near zero. Where cells limit delivery it is large. And PeakSure's commitment covers ${pct(t1.C.capture)} of monthly peaks instead of ${pct(t1.A.capture)}.`);
}

// 9 · Battery options
{
  const s = pres.addSlide({ masterName: "CONTENT" });
  head(s, "Battery options", "One control system, two cell types");
  const lfp = S.chemistries.find((c) => c.name === "LFP"), na = S.chemistries.find((c) => c.name === "Na-ion");
  const H = { bold: true, color: GREEN, fill: { color: CARD } };
  const row = (cells) => cells.map((c, i) => ({ text: c, options: i === 0 ? { bold: true, color: WHITE } : { color: MUTED } }));
  s.addTable([
    [{ text: "", options: H }, { text: "Lithium-ion (LFP) · REON EBS Li+", options: H }, { text: "Sodium-ion · REON EBS Na+", options: H }],
    row(["Energy per space", "High: REON says EBS Li+ holds more than 2× Na+", "Lower"]),
    row(["Cold weather", "Weaker", "Better: REON rates −40 °F"]),
    row(["Installed price (team estimate)", `$${fmt(lfp.price.low)}–${fmt(lfp.price.high)}/kWh`, `$${fmt(na.price.low)}–${fmt(na.price.high)}/kWh`]),
    row(["Cell-control premium (our model)", `$${sens.chem_LFP.prem_c.toFixed(1)}/kWh`, `$${t1.C.premium_same[0].toFixed(1)}/kWh (base case)`]),
    row(["Materials", "Lithium, iron; 56 kg CO₂e/kWh to make", "Abundant sodium, no lithium"]),
    row(["Best fit", "Town storage, tight space", "Cold or indoor sites, high cycling"]),
  ], { x: 0.6, y: 1.9, w: 12.1, colW: [3.3, 4.4, 4.4], fontSize: 13, fontFace: "Arial", border: { type: "solid", color: LINE, pt: 0.75 }, fill: { color: BG }, rowH: 0.62, valign: "middle", margin: 0.08, objectName: "chemistry table" });
  txt(s, "REON's BMS works with partner cells · Sources: REON; Tarascon (2020); Vaalma et al. (2018); Llamas-Orozco et al. (2023)", { x: 0.6, y: 6.5, w: 12.1, h: 0.35, fontSize: 10, color: MUTED });
  s.addNotes("One control system works across cell types. LFP is cheaper and its flat voltage curve helps; sodium-ion is better in the cold.");
}

// 10 · Impact
{
  const s = pres.addSlide({ masterName: "CONTENT" });
  head(s, "Impact and sustainability", "Same cells, more energy, for longer");
  const yrs = [...new Set(R.bands.map((b) => b.sim_year))].sort((a, b) => a - b);
  const series = ["A", "B"].map((c) => ({ name: c === "A" ? "Conventional" : "REON EBS", labels: yrs.map((y) => String(cfg.start_year + y)), values: yrs.map((y) => Math.round(R.bands.find((b) => b.cond === c && b.sim_year === y).p50 / cfg.e_nom_kwh * 1000) / 10) }));
  s.addChart(pres.charts.LINE, series, {
    x: 0.6, y: 1.8, w: 6.6, h: 4.6, showTitle: true, title: "Usable capacity, % of nameplate (median of 64 runs)", titleColor: WHITE, titleFontSize: 13, titleFontFace: "+mn-lt",
    chartColors: ["687A83", GREEN], lineSize: 3, lineDataSymbol: "none", showLegend: true, legendPos: "b", legendColor: MUTED, legendFontSize: 11, legendFontFace: "+mn-lt",
    catAxisLabelColor: MUTED, valAxisLabelColor: MUTED, catAxisLabelFontSize: 10, valAxisLabelFontSize: 10, catAxisLabelFontFace: "+mn-lt", valAxisLabelFontFace: "+mn-lt",
    valAxisMinVal: 60, valAxisMaxVal: 100, valGridLine: { color: "1F4A3B", size: 0.5 }, catGridLine: { style: "none" }, plotArea: { fill: { color: BG } }, objectName: "capacity chart",
  });
  txt(s, `${Math.round(cfg.eol_retention * 100)}% = service threshold: cells are topped up below it`, { x: 0.6, y: 6.45, w: 6.6, h: 0.35, fontSize: 10, color: MUTED });
  const items = [
    ["For the town", "$20.93", "saved per Sterling customer at one hot-day peak ($84.0K total, live tool)"],
    ["For reliability", `${fmt(DRAIN.b_del)} kWh`, `from the same cells with bypass, vs ${fmt(DRAIN.a_del)} kWh: more backup hours`],
    ["For the planet", `≈ ${(augA * cfg.co2_kg_per_kwh[1] / 1000).toFixed(1)} t CO₂e`, `${fmt(augA - augB)} kWh of top-up cells avoided over 15 years (${(augA * cfg.co2_kg_per_kwh[0] / 1000).toFixed(1)}–${(augA * cfg.co2_kg_per_kwh[2] / 1000).toFixed(1)} t); capacity stays ≥ ${pct(lowest("B"))} vs ${pct(lowest("A"))}`],
  ];
  items.forEach(([h, big, d], i) => {
    const y = 1.85 + i * 1.6;
    card(s, 7.6, y, 5.2, 1.45, `impact ${h}`);
    txt(s, h.toUpperCase(), { x: 7.85, y: y + 0.15, w: 4.8, h: 0.3, fontSize: 10, bold: true, color: GREEN, charSpacing: 1 });
    txt(s, big, { x: 7.85, y: y + 0.42, w: 2.2, h: 0.6, fontSize: 24, bold: true });
    txt(s, d, { x: 10.05, y: y + 0.42, w: 2.6, h: 0.95, fontSize: 11, color: MUTED });
  });
  s.addNotes(`Over fifteen years the conventional battery falls to ${pct(lowest("A"))} of nameplate and needs ${fmt(augA)} kilowatt-hours of new cells; REON EBS stays above ${pct(lowest("B"))} and needs none.`);
}

// 11 · Recommendation and path
{
  const s = pres.addSlide({ masterName: "CONTENT" });
  head(s, "Our recommendation", "Start with a retrofit pilot on struggling batteries");
  const steps = [["Next 3 months", "Read-only data pilot", "Replay one REON battery log; PeakSure recommends each peak commitment, people decide."], ["3–12 months", "Retrofit pilot", "REON cell-level BMS on 1–2 Massachusetts batteries; measure delivered energy, missed peaks and savings."], ["After the evidence", "Scale with REON EBS", "New EBS systems with cell control and PeakSure built in, priced on measured value."]];
  steps.forEach(([w, t, d], i) => {
    const x = 0.6 + i * 4.1;
    card(s, x, 1.9, 3.9, 2.4, `roadmap ${i + 1}`);
    txt(s, w.toUpperCase(), { x: x + 0.3, y: 2.1, w: 3.3, h: 0.3, fontSize: 11, bold: true, color: GREEN, charSpacing: 1 });
    txt(s, t, { x: x + 0.3, y: 2.45, w: 3.3, h: 0.5, fontSize: 20, bold: true });
    txt(s, d, { x: x + 0.3, y: 3.05, w: 3.3, h: 1.15, fontSize: 13, color: MUTED });
  });
  txt(s, "Compliance in Massachusetts", { x: 0.6, y: 4.6, w: 6, h: 0.4, fontSize: 15, bold: true, color: GREEN });
  txt(s, ["Siting: 225 CMR 29.00 and local permits", "Fire: 527 CMR 1.00, NFPA 855, UL 9540 / 9540A", "Electrical: 527 CMR 12.00; interconnection with the host utility", "End of life: 310 CMR 30.000"].map((l, i, a) => ({ text: l, options: { bullet: true, breakLine: i < a.length - 1 } })), { x: 0.6, y: 5.0, w: 6.2, h: 1.7, fontSize: 13, color: MUTED, paraSpaceAfter: 3 });
  card(s, 7.2, 4.6, 5.6, 2.1, "ask card");
  txt(s, "OUR ASK TO REON", { x: 7.5, y: 4.8, w: 5, h: 0.3, fontSize: 11, bold: true, color: GREEN, charSpacing: 1 });
  txt(s, "One anonymized battery log, cells per block, DC floor and switch-loss range: that turns this model into evidence.", { x: 7.5, y: 5.2, w: 5.0, h: 1.3, fontSize: 15 });
  s.addNotes(`Prove it on today's batteries, build it into tomorrow's. Our recommendation: a data pilot now, a retrofit on one or two Massachusetts batteries next, then scale with EBS. The battery covers ${pct(t1.C.capture)} of monthly peaks instead of ${pct(t1.A.capture)}.`);
}


(async () => {
  const out = process.argv[2];
  await pres.writeFile({ fileName: out });
  await applyTheme(out, THEME);
  console.log("wrote", out);
})();
