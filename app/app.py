"""PeakSure demo (Streamlit). Run:  streamlit run app/app.py

Every number on screen is either (a) read from results/ produced by `python -m peaksure.experiments`
(seeded Monte Carlo, with confidence intervals) or (b) computed live by the same simulator.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st
from plotly.subplots import make_subplots

import analysis as an
import ui
from peaksure import econ
from peaksure.config import Config, CHEMISTRIES, SYSTEM_FLAGS, NA_ION
from peaksure.data import HE_GRID, peak_events, peak_day_shapes, SEASON
from peaksure.sim import simulate

st.set_page_config(page_title="PeakSure | REON cell-level intelligence", layout="wide",
                   initial_sidebar_state="collapsed")
ui.css()
ui.setup_theme()
CFG = Config()
REPO = "https://github.com/Bakdaulet-omeraiuly/peaksure"


# =============================================================== cached data
@st.cache_data(show_spinner=False)
def load_main():
    ev, mo = an.load("events_main"), an.load("monthly_main")
    t1, rl = an.main_table(ev, mo, CFG)
    dec = econ.decomposition(rl)
    bands = an.dref_bands(mo, ["A", "B", "C", "C_T3"])
    evv = econ.add_values(ev, CFG)
    return ev, mo, t1, rl, dec, bands, evv


@st.cache_data(show_spinner=False)
def load_sens():
    ev, mo = an.load("events_sens"), an.load("monthly_sens")
    return an.sens_summary(ev, mo) if len(ev) else pd.DataFrame()


@st.cache_data(show_spinner=False)
def load_cal():
    ev = an.load("events_cal")
    return (an.calib_summary(ev), an.calib_by_year(ev)) if len(ev) else (pd.DataFrame(), pd.DataFrame())


@st.cache_data(show_spinner=False)
def load_probe():
    ev, mo = an.load("events_probe"), an.load("monthly_probe")
    return an.probe_summary(ev, mo) if len(ev) else pd.DataFrame()


@st.cache_data(show_spinner=False, max_entries=64)
def live_capture(cond, seed, age_year, month, he, t_amb, is_annual, src_year, e_nom, budget):
    cfg = CFG.with_(e_nom_kwh=e_nom, probe_budget=budget, years=age_year)
    mi = (age_year - 1) * 12 + (month - 1)
    out = simulate(cfg, cond, seed, capture_month=mi,
                   override=dict(he=he, t_amb_c=t_amb, is_annual=is_annual, src_year=src_year))
    return out["capture"]


# =============================================================== header
man = an.manifest()
st.markdown(
    f"""<div class="ps-hero"><h1>PeakSure</h1>
    <div class="sub">Know what your battery can deliver when it counts. A cell-aware commitment tool for
    REON's CES (2.5 MW / up to 5 MWh) at Massachusetts municipal light plants, tested on real ISO-NE
    coincident peaks 2019&ndash;2025 over a 15-year Monte Carlo.</div>
    <div class="sub" style="margin-top:8px;font-size:.84rem">Independent analysis, not endorsed by REON.
    Results: {man.get('n_main','?')} seeded runs per condition &middot; config {man.get('config_hash','?')}
    &middot; commit {man.get('git_commit','?')} &middot; <a href="{REPO}">{REPO.split('//')[1]}</a></div></div>""",
    unsafe_allow_html=True)

if not an.available():
    st.error("No results found. Run `python -m peaksure.experiments` first.")
    st.stop()

ev, mo, T1, RL, DEC, BANDS, EVV = load_main()
SENS = load_sens()
CAL, CAL_Y = load_cal()
PROBE = load_probe()
t1 = T1.set_index("cond")

tabs = st.tabs(["Overview", "Peak day (live)", "Benchmark", "Where it pays", "Value decomposition",
                "Twin calibration", "VoI probing", "Temperature", "Economics", "Lifetime & CO2",
                "Assumptions & evidence"])


def sens_row(tag):
    if SENS.empty or tag not in set(SENS.tag):
        return None
    return SENS.set_index("tag").loc[tag]


# =============================================================== 1. overview
with tabs[0]:
    ui.callout("<b>The decision.</b> Before each forecast ISO-NE peak (12 monthly transmission peaks and the "
               "annual capacity peak), the operator commits a discharge <b>power</b> over a <b>window</b>. "
               "Commit too much and the battery runs dry before the peak hour; commit too little and savings are "
               "left on the table. PeakSure commits only what the battery can deliver with 95% confidence, using "
               "per-cell data and REON's cell bypass.")
    a, c = t1.loc["A"], t1.loc["C"]
    d4 = sens_row("duration_4h")
    d1 = sens_row("duration_1h")
    base_cell = DEC.set_index("component")
    v12 = (base_cell.loc["V1 Physical (bypass)", "mean"] + base_cell.loc["V2 Informational (cell twin)", "mean"])
    items = [
        ui.card("Annual peak savings, conventional (A)", ui.usd(a.savings[0]),
                f"95% CI {ui.usd(a.savings[1])} to {ui.usd(a.savings[2])}", "neutral", "MODEL"),
        ui.card("Annual peak savings, PeakSure (C)", ui.usd(c.savings[0]),
                f"95% CI {ui.usd(c.savings[1])} to {ui.usd(c.savings[2])}", "good", "MODEL"),
        ui.card("Break-even REON premium, 2-h CES", f"${c.premium[0]:,.1f}/kWh",
                f"95% CI ${c.premium[1]:,.1f} to ${c.premium[2]:,.1f} (NPV C minus A)", "info", "MODEL"),
    ]
    if d4 is not None:
        items.append(ui.card("Cell-level value, 4-h system", ui.usd(d4.v1 + d4.v2) + "/yr",
                             f"Physical {ui.usd(d4.v1)} + informational {ui.usd(d4.v2)}", "good", "MODEL"))
    ui.cards(items)
    st.write("")

    # findings, generated from results
    st.markdown("#### What the model shows")
    f = []
    f.append(f"<b>Peak timing, not battery energy, dominates the money for a 2-hour CES.</b> The most likely hour "
             f"captured the actual peak only about two times in three (leave-one-year-out on 2019&ndash;2025). "
             f"At 2 h, the combined physical and informational value of cell-level control is "
             f"<b>{ui.usd(v12)}/yr</b>: energy rarely limits the decision.")
    if d4 is not None and d1 is not None:
        f.append(f"<b>It pays where energy binds.</b> For a 4-h system (like Holden's 5 MW / 22 MWh), cell-level value "
                 f"is <b>{ui.usd(d4.v1 + d4.v2)}/yr</b> (break-even premium ${d4.prem_c:,.0f}/kWh); for a 1-h system "
                 f"<b>{ui.usd(d1.v1 + d1.v2)}/yr</b>.")
    if not np.isnan(c.p5miss):
        f.append(f"<b>The cell twin is calibrated.</b> True deliverable energy fell below the twin's P5 in "
                 f"{c.p5miss*100:.1f}% of events (target 5%; Wilson 95% CI {c.p5_lo*100:.1f}&ndash;{c.p5_hi*100:.1f}%), "
                 f"with an interval {c.width*100:.1f}% wide vs {t1.loc['A'].width*100 if not np.isnan(t1.loc['A'].width) else float('nan'):.1f}% for the pack estimate.")
    if not PROBE.empty and "gain" in PROBE:
        pv = PROBE[(PROBE.cond == "D") & (PROBE.budget == 4)]
        if len(pv):
            r = pv.iloc[0]
            f.append(f"<b>VoI probes (4-h system, 4 probes per peak):</b> {ui.usd(r.gain)}/yr vs no probing "
                     f"(95% CI {ui.usd(r.gain_lo)} to {ui.usd(r.gain_hi)}); {r.probes:.1f} probes actually used per peak, "
                     f"because PeakSure skips probes that would not change the decision.")
    f.append("<b>Lifetime.</b> Bypass avoids replacing weak cells to keep the fixed string above the 70% threshold "
             f"(augmentation: A {t1.loc['A'].aug[0]:,.0f} kWh vs C {t1.loc['C'].aug[0]:,.0f} kWh over 15 years).")
    for x in f:
        st.markdown(f"- {x}", unsafe_allow_html=True)

    if not SENS.empty:
        dd = SENS[SENS.tag.str.startswith("duration")].copy()
        base_row = dict(tag="duration_2h", e_nom=5000.0,
                        v1=base_cell.loc["V1 Physical (bypass)", "mean"], v2=base_cell.loc["V2 Informational (cell twin)", "mean"])
        dd = pd.concat([dd, pd.DataFrame([base_row])], ignore_index=True)
        dd["hours"] = dd.e_nom / CFG.p_max_kw
        dd = dd.sort_values("hours")
        fig = go.Figure()
        fig.add_bar(x=dd.hours.map(lambda h: f"{h:.0f} h"), y=dd.v1, name="Physical (bypass)", marker_color=ui.COLORS["B"])
        fig.add_bar(x=dd.hours.map(lambda h: f"{h:.0f} h"), y=dd.v2, name="Informational (cell twin)", marker_color=ui.COLORS["C"])
        fig.update_layout(barmode="relative", title="Value of cell-level intelligence vs battery duration ($/yr, model)",
                          yaxis_title="$ per year", xaxis_title="Battery duration at 2.5 MW", height=360)
        st.plotly_chart(fig, width="stretch")


# =============================================================== 2. live peak day
with tabs[1]:
    pe = peak_events().copy()
    pe["label"] = pe.apply(lambda r: f"{r.Date:%Y-%m-%d}  HE{int(r.Hr_End)}  {r.wcma_dry_bulb_c:+.1f} C"
                           + ("  annual peak" if r.is_annual else ""), axis=1)
    default = int(pe.index[(pe.year == 2025) & (pe.is_annual)][0])
    c1, c2, c3, c4, c5 = st.columns([2.2, 1, 1, 1, 1])
    sel = c1.selectbox("Historical ISO-NE peak (system peak, WCMA temperature)", pe.index,
                       index=list(pe.index).index(default), format_func=lambda i: pe.loc[i, "label"])
    age = c2.slider("Battery age (year)", 1, 15, 9)
    dur = c3.selectbox("System", ["2-h CES (5 MWh)", "4-h (10 MWh)"], index=0)
    seed = c4.number_input("Monte Carlo seed", 0, 47, 0)
    budget = c5.slider("VoI probe budget", 0, 8, 4)
    e_nom = 5000.0 if dur.startswith("2") else 10000.0
    r = pe.loc[sel]
    args = (int(seed), int(age), int(r.month), int(r.Hr_End), float(r.wcma_dry_bulb_c), bool(r.is_annual), int(r.year), e_nom)
    with st.spinner("Simulating the battery's life up to this peak..."):
        caps = {cnd: live_capture(cnd, *args, 0) for cnd in ("A", "B", "C")}
        if budget > 0:
            caps["D"] = live_capture("D", *args, int(budget))

    cal_year = CFG.start_year + age - 1
    rns_m = econ.rns_rate(CFG, cal_year) / 12
    cap_rate = CFG.fca_kw_month * 12 if r.is_annual else 0.0
    items = []
    for cnd, cp in caps.items():
        dcs = cp["decision"]
        val = cp["shaved_kw"] * (rns_m + cap_rate)
        ok = cp["shaved_kw"] > 0
        items.append(ui.card(ui.SHORT[cnd],
                             f"{cp['shaved_kw']:,.0f} kW shaved",
                             f"Commit {dcs['power_kw']:,.0f} kW x {dcs['window_h']} h from HE{dcs['start_he']} &middot; "
                             f"true deliverable {cp['d_true']:,.0f} kWh &middot; value {ui.usd(val)}",
                             "good" if ok else "bad", "MODEL"))
    ui.cards(items)
    st.caption(f"Value at {cal_year} rates: RNS ${rns_m:,.2f}/kW for this monthly peak"
               + (f" + capacity ${cap_rate:,.2f}/kW (annual peak)." if r.is_annual else ".")
               + " Probes are a capability stated in REON's hackathon brief; their physical accuracy is unconfirmed.")

    # --- peak day curve
    shp = peak_day_shapes()
    day = shp[shp.Date == r.Date].sort_values("Hr_End")
    fig = make_subplots(specs=[[{"secondary_y": True}]])
    fig.add_scatter(x=day.Hr_End, y=day.System_Load, name="ISO-NE system load (MW)", line=dict(color=ui.INK, width=2.5))
    fig.add_scatter(x=day.Hr_End, y=(day.wcma_dry_bulb_f - 32) * 5 / 9, name="WCMA temperature (C)",
                    line=dict(color=ui.ACCENT["warn"], width=1.5, dash="dot"), secondary_y=True)
    ymin, ymax = day.System_Load.min(), day.System_Load.max()
    for i, (cnd, cp) in enumerate(caps.items()):
        dcs = cp["decision"]
        if dcs["power_kw"] <= 0:
            continue
        y0 = ymin + (ymax - ymin) * (0.02 + 0.07 * i)
        fig.add_shape(type="rect", x0=dcs["start_he"] - 1, x1=dcs["start_he"] + dcs["window_h"] - 1,
                      y0=y0, y1=y0 + (ymax - ymin) * 0.06, fillcolor=ui.COLORS[cnd], opacity=0.85, line_width=0)
        fig.add_annotation(x=dcs["start_he"] - 1, y=y0 + (ymax - ymin) * 0.03, text=f"{cnd}", showarrow=False,
                           xanchor="right", font=dict(size=11, color=ui.COLORS[cnd]))
    fig.add_vline(x=int(r.Hr_End) - 0.5, line=dict(color=ui.ACCENT["bad"], width=2, dash="dash"))
    fig.add_annotation(x=int(r.Hr_End) - 0.5, y=ymax, text=f"actual peak HE{int(r.Hr_End)}", showarrow=False,
                       yanchor="bottom", font=dict(color=ui.ACCENT["bad"]))
    fig.update_layout(title=f"{r.Date:%A %d %B %Y}: real ISO-NE load and the committed discharge windows",
                      height=380, xaxis=dict(title="Hour ending", dtick=2, range=[0.5, 24.5]),
                      legend=dict(orientation="h", y=-0.22))
    fig.update_yaxes(title_text="MW", secondary_y=False)
    fig.update_yaxes(title_text="C", secondary_y=True, showgrid=False)
    st.plotly_chart(fig, width="stretch")

    # --- beliefs
    cb1, cb2 = st.columns([1.15, 1])
    with cb1:
        fig = go.Figure()
        names = {"A": "A pack-test estimate", "C": "C cell twin", "D": "D cell twin after probes"}
        for cnd in ("A", "C", "D"):
            if cnd not in caps:
                continue
            cp = caps[cnd]
            fig.add_box(x=cp["d_samp"], name=names[cnd], marker_color=ui.COLORS[cnd], boxpoints=False,
                        orientation="h", line_width=1.5)
            fig.add_scatter(x=[cp["d_true"]], y=[names[cnd]], mode="markers", marker=dict(symbol="line-ns-open", size=22,
                            color=ui.ACCENT["bad"], line_width=3), showlegend=False, hovertext="true deliverable energy")
            dcs = cp["decision"]
            fig.add_scatter(x=[dcs["power_kw"] * dcs["window_h"]], y=[names[cnd]], mode="markers",
                            marker=dict(symbol="diamond", size=11, color=ui.INK), showlegend=False,
                            hovertext="committed energy P x W")
        if "D" in caps and caps["D"]["d_pre"] is not None:
            fig.add_box(x=caps["D"]["d_pre"], name="D cell twin before probes", marker_color=ui.COLORS["D_rand"],
                        boxpoints=False, orientation="h")
        fig.update_layout(title="What each operator believes it can deliver (kWh)", height=330, showlegend=False,
                          xaxis_title="Deliverable energy at the peak, kWh  (red bar: truth; diamond: committed P x W)")
        st.plotly_chart(fig, width="stretch")
    with cb2:
        cp = caps["C"]
        ph_ = cp["p_hour"]
        fig = go.Figure(go.Bar(x=HE_GRID, y=ph_, marker_color=[ui.ACCENT["bad"] if h == int(r.Hr_End) else ui.COLORS["B_opt"] for h in HE_GRID]))
        fig.update_layout(title="Peak-hour forecast (other years, same season)", height=330,
                          xaxis=dict(title="Hour ending", dtick=1), yaxis=dict(title="Probability", tickformat=".0%"))
        st.plotly_chart(fig, width="stretch")

    # --- cell maps
    st.markdown("#### Inside the battery: every cell, true state of health")
    cm1, cm2 = st.columns(2)
    for col, cnd, ttl in ((cm1, "A", "Conventional fixed strings: the weakest cell limits each string"),
                          (cm2, "D" if "D" in caps else "C", "REON bypass: cells leave the path as they empty")):
        cp = caps[cnd]
        soh = cp["soh"]
        fig = go.Figure(go.Heatmap(z=soh, colorscale=[[0, "#C44536"], [0.5, "#F2D49B"], [1, "#2E9E5B"]],
                                   zmin=max(0.3, float(soh.min())), zmax=1.0, colorbar=dict(title="SoH", len=0.9),
                                   hovertemplate="string %{y}, cell %{x}<br>SoH %{z:.3f}<extra></extra>"))
        if cnd == "A":
            ys, xs = np.where(cp["limiting"])
            fig.add_scatter(x=xs, y=ys, mode="markers", marker=dict(symbol="x", size=11, color=ui.INK, line_width=2),
                            name="limiting cell", hovertext="limits the whole string")
        else:
            ys, xs = np.where(cp["exhausted"])
            fig.add_scatter(x=xs, y=ys, mode="markers", marker=dict(symbol="circle-open", size=7, color=ui.INK),
                            name="bypassed when empty")
            if cp["probed"]:
                py, px = zip(*cp["probed"])
                fig.add_scatter(x=px, y=py, mode="markers", marker=dict(symbol="star", size=14, color=ui.ACCENT["warn"],
                                line=dict(color=ui.INK, width=1)), name="VoI probe")
            ys, xs = np.where(cp["hot"])
            if len(xs):
                fig.add_scatter(x=xs, y=ys, mode="markers", marker=dict(symbol="triangle-up", size=9, color=ui.ACCENT["bad"]),
                                name="hot, rested")
        fig.update_layout(title=ttl, height=330, xaxis_title="cell position in string", yaxis_title="string",
                          legend=dict(orientation="h", y=-0.28), yaxis=dict(dtick=1))
        col.plotly_chart(fig, width="stretch")
    a_c, b_c = caps["A"], caps["B"]
    ui.note(f"Fixed strings deliver {a_c['d_true']:,.0f} kWh; the same cells with bypass deliver {b_c['d_true']:,.0f} kWh "
            f"(N_min = {a_c['n_min']} of {a_c['n_series']} cells per string; the cutoff is set by the DC voltage window). "
            f"Maximum cell temperature {a_c['t_cell'].max():.1f} C at {r.wcma_dry_bulb_c:+.1f} C ambient.")


# =============================================================== 3. benchmark
with tabs[2]:
    st.markdown("#### Main benchmark: REON CES 2.5 MW / 5 MWh, sodium-ion, 15 years, ISO-NE peaks 2019&ndash;2025")
    rows = []
    for cnd, r in T1.set_index("cond").iterrows():
        rows.append({
            "Condition": ui.SHORT[cnd],
            "Savings $/yr [95% CI]": ui.ci_str(*r.savings),
            "NPV 15 yr [95% CI]": ui.ci_str(*r.npv),
            "Peak capture": f"{r.capture[0]*100:.1f}%",
            "Delivered full commitment": f"{r.delivered[0]*100:.1f}%",
            "Annual peak captured": f"{r.annual[0]*100:.0f}%",
            "Mean deliverable kWh": f"{r.d_true[0]:,.0f}",
            "PSaR $/yr": ui.usd(r.psar),
            "P5 miss rate": "n/a (fixed rule)" if cnd in ("A", "B") else f"{r.p5miss*100:.1f}%",
            "Break-even premium $/kWh": "baseline" if cnd == "A" else f"{r.premium[0]:,.1f} [{r.premium[1]:,.1f}, {r.premium[2]:,.1f}]",
        })
    st.dataframe(pd.DataFrame(rows), hide_index=True, width="stretch")
    st.caption(f"N = {int(T1.n.min())} paired runs per condition (common random numbers). Peak capture = shaved kW > 0 "
               "at the actual peak hour. Delivered = the battery sustained the committed power for the full window. "
               f"PSaR = expected savings with perfect information minus the 5th-percentile realized savings. "
               f"Compute: {man.get('seconds','?')} s for the whole suite.")
    fig = go.Figure()
    for cnd in ("A", "B", "C", "C_T3"):
        b = BANDS[BANDS.cond == cnd]
        fig.add_scatter(x=b.sim_year + 1, y=b.p95, line=dict(width=0), showlegend=False, hoverinfo="skip")
        fig.add_scatter(x=b.sim_year + 1, y=b.p5, fill="tonexty", line=dict(width=0),
                        fillcolor=ui.rgba(ui.COLORS[cnd], 0.18), showlegend=False, hoverinfo="skip")
        fig.add_scatter(x=b.sim_year + 1, y=b.p50, name=ui.SHORT[cnd], line=dict(color=ui.COLORS[cnd], width=2.5))
    fig.add_hline(y=CFG.eol_retention * CFG.e_nom_kwh, line=dict(color=ui.ACCENT["bad"], dash="dot"),
                  annotation_text="70% end-of-service threshold (brief)")
    fig.update_layout(title="Deliverable energy at 25 C over the life of the system (median, P5-P95 band)",
                      xaxis_title="Year of operation", yaxis_title="kWh", height=420)
    st.plotly_chart(fig, width="stretch")
    ui.note("Conventional strings are augmented (weakest cells replaced) whenever deliverable energy falls below 70%; "
            "the cost enters the NPV. With bypass, weak cells simply leave the path and augmentation is rarely needed.")


# =============================================================== 4. where it pays
with tabs[3]:
    if SENS.empty:
        st.info("Sensitivity results not available yet.")
    else:
        st.markdown("#### When does cell-level intelligence pay? Paired NPV difference C minus A, per kWh of nameplate")
        lab = {"headroom_0.02": "DC headroom 2% (N_min tight)", "headroom_0.05": "DC headroom 5%",
               "headroom_0.20": "DC headroom 20%", "aging_sigma_low": "Low cell-ageing spread (sigma 0.25)",
               "aging_sigma_high": "High cell-ageing spread (sigma 0.55)", "switch_loss_0.005": "Switch loss 0.5%",
               "switch_loss_0.02": "Switch loss 2%", "dispatch_low": "Few dispatch days", "dispatch_high": "Many dispatch days",
               "discount_0.05": "Discount 5%", "discount_0.10": "Discount 10%", "hvac_weak": "Weak HVAC (k=0.7, sigma_T 5 C)",
               "hvac_failing": "Failing HVAC (k=1.0, sigma_T 6 C)", "sigma_meas_0.01": "Cell estimate noise 1%",
               "sigma_meas_0.04": "Cell estimate noise 4%", "chem_LFP": "LFP chemistry", "fault_scenario": "Cell faults 0.2%/yr (scenario)",
               "duration_1h": "1-h system (2.5 MWh)", "duration_3h": "3-h system (7.5 MWh)", "duration_4h": "4-h system (10 MWh)"}
        s = SENS.copy()
        s["label"] = s.tag.map(lab).fillna(s.tag)
        base_prem = t1.loc["C"].premium
        s = s.sort_values("prem_c")
        fig = go.Figure()
        fig.add_bar(y=s.label, x=s.prem_c, orientation="h", marker_color=[ui.COLORS["C"] if v > 0 else ui.ACCENT["bad"] for v in s.prem_c],
                    error_x=dict(type="data", symmetric=False, array=s.prem_c_hi - s.prem_c, arrayminus=s.prem_c - s.prem_c_lo,
                                 color="#9AA3B2"), name="C vs A")
        fig.add_vline(x=base_prem[0], line=dict(color=ui.INK, dash="dash"), annotation_text=f"base {base_prem[0]:,.1f}")
        fig.add_vline(x=0, line=dict(color="#C9CED6"))
        fig.update_layout(height=640, xaxis_title="$ per kWh of nameplate (NPV, 15 yr, 95% CI)",
                          title="Break-even REON premium under each scenario (one change at a time from base)")
        st.plotly_chart(fig, width="stretch")
        ui.callout("Read this as a specification for REON: the hardware premium that the modelled savings can pay for. "
                   "Positive values mean cell-level control earns more than it would need to cost up to that amount; values "
                   "near zero mean this application does not pay for it under that condition. Scenarios with fewer seeds "
                   f"({int(an.manifest().get('n_side', 0))} runs each) have wider intervals.", "warn")
        show = s[["label", "v1", "v2", "rule", "total", "sav_a", "sav_c", "tcell_max"]].rename(columns={
            "label": "Scenario", "v1": "Physical $/yr", "v2": "Informational $/yr", "rule": "Decision rule $/yr",
            "total": "Total A to C $/yr", "sav_a": "A savings $/yr", "sav_c": "C savings $/yr", "tcell_max": "Max cell temp C (A)"})
        for c_ in show.columns[1:-1]:
            show[c_] = show[c_].map(lambda v: ui.usd(v))
        show["Max cell temp C (A)"] = show["Max cell temp C (A)"].map(lambda v: f"{v:.1f}")
        st.dataframe(show, hide_index=True, width="stretch")


# =============================================================== 5. decomposition
with tabs[4]:
    st.markdown("#### Where the value comes from (paired, Shapley over hardware x information; exact by construction)")

    def waterfall(dec, title):
        d = dec[dec.component != "Total"]
        fig = go.Figure(go.Waterfall(
            x=list(d.component) + ["Total"], y=list(d["mean"]) + [None],
            measure=["relative"] * len(d) + ["total"], connector=dict(line=dict(color="#C9CED6")),
            increasing=dict(marker=dict(color=ui.COLORS["C"])), decreasing=dict(marker=dict(color=ui.ACCENT["bad"])),
            totals=dict(marker=dict(color=ui.INK))))
        fig.add_scatter(x=list(dec.component), y=list(dec["mean"]), mode="markers", marker=dict(size=0.1, color="rgba(0,0,0,0)"),
                        error_y=dict(type="data", symmetric=False, array=list(dec.hi - dec["mean"]),
                                     arrayminus=list(dec["mean"] - dec.lo), color="#5C677D"), showlegend=False)
        fig.update_layout(title=title, yaxis_title="$ per year", height=420)
        return fig

    w1, w2 = st.columns(2)
    w1.plotly_chart(waterfall(DEC, "2-h CES (base), A to D"), width="stretch")
    ev_s, mo_s = an.load("events_sens"), an.load("monthly_sens")
    if len(ev_s):
        e4, m4 = ev_s[ev_s.tag == "sens_duration_4h"], mo_s[mo_s.tag == "sens_duration_4h"]
        if len(e4):
            rl4 = econ.run_level(e4, m4, CFG.with_(e_nom_kwh=10000.0))
            w2.plotly_chart(waterfall(econ.decomposition(rl4), "4-h system, A to C"), width="stretch")
    ui.note("Decision rule = optimized chance-constrained commitment vs the conventional full-power rule, holding hardware and "
            "information fixed. V1 Physical = fixed string to bypass. V2 Informational = annual pack test to per-cell twin. "
            "V1 and V2 are Shapley averages over the 2x2 square {A_opt, B_opt, A_twin, C}, so no benefit is counted twice. "
            "V3 = VoI probes (D minus C). Error bars: bootstrap 95% CI over paired runs.")


# =============================================================== 6. calibration
with tabs[5]:
    if CAL.empty:
        st.info("Calibration results not available yet.")
    else:
        st.markdown("#### Is the uncertainty honest? Share of peaks where the true deliverable energy fell below the predicted P5")
        cc1, cc2 = st.columns(2)
        for col, mode, ttl in ((cc1, "sys", "Systematic mismatch: twin underestimates fade by eps, reports +eps/10 capacity"),
                               (cc2, "rnd", "Random mismatch: per-cell estimate noise x (1 + 10 eps)")):
            d = CAL[CAL["mode"] == mode]
            fig = go.Figure()
            for cnd, nm in (("A_opt", "Pack-level estimate"), ("C", "Cell-level twin")):
                x = d[d.cond == cnd].sort_values("eps")
                fig.add_scatter(x=x.eps * 100, y=x.miss * 100, name=nm, mode="lines+markers",
                                line=dict(color=ui.COLORS["A" if cnd == "A_opt" else "C"], width=2.5),
                                error_y=dict(type="data", symmetric=False, array=(x.hi - x.miss) * 100,
                                             arrayminus=(x.miss - x.lo) * 100))
            fig.add_hrect(y0=3, y1=7, fillcolor=ui.COLORS["C"], opacity=0.08, line_width=0)
            fig.add_hline(y=5, line=dict(color=ui.INK, dash="dot"), annotation_text="target 5%")
            fig.update_layout(title=ttl, xaxis_title="Model mismatch eps (%)", yaxis_title="P5 miss rate (%)", height=380)
            col.plotly_chart(fig, width="stretch")
        d0 = CAL[CAL.eps == 0]
        show = d0[["mode", "cond", "miss", "lo", "hi", "above95", "width", "n"]].copy()
        show["cond"] = show.cond.map({"A_opt": "Pack-level", "C": "Cell twin"})
        show = show[show["mode"] == "sys"].drop(columns="mode")
        show.columns = ["Estimator", "P5 miss", "CI lo", "CI hi", "Above P95", "Interval width (rel.)", "Events"]
        st.dataframe(show.style.format({"P5 miss": "{:.1%}", "CI lo": "{:.1%}", "CI hi": "{:.1%}", "Above P95": "{:.1%}",
                                        "Interval width (rel.)": "{:.1%}"}), hide_index=True, width="stretch")
        ui.callout("Calibration is measured against the simulated ground truth, not real hardware. A pack-level estimate that is "
                   "well calibrated but wide forces conservative commitments; a cell twin that is narrow must stay calibrated as "
                   "the model drifts. Systematic bias is the dangerous case: watch where the cell twin's miss rate leaves the "
                   "3-7% band. PeakSure's fallback (Addendum P2) switches to conservative commitments when the observed miss "
                   "rate exceeds its Wilson bound.", "warn")


# =============================================================== 7. VoI
with tabs[6]:
    if PROBE.empty:
        st.info("Probe results not available yet.")
    else:
        st.markdown("#### Decision-focused diagnostics on a 4-h system: does probing the right cells pay?")
        ui.callout("A probe switches one cell in or out of the string to measure it precisely. REON's hackathon brief states that "
                   "any cell can be included or removed; the accuracy of such a probe is our assumption (0.5% capacity). "
                   "VoI selects cells whose uncertainty actually changes the commitment; it may choose not to probe at all.", "")
        d = PROBE[PROBE.budget.notna()].copy()
        fig = go.Figure()
        for cnd, nm in (("D", "VoI (PeakSure)"), ("D_rr", "Round-robin"), ("D_rand", "Random")):
            x = d[d.cond == cnd].sort_values("budget")
            if not len(x) or "gain" not in x:
                continue
            fig.add_scatter(x=x.budget, y=x.gain, name=nm, mode="lines+markers", line=dict(color=ui.COLORS[cnd], width=2.5),
                            error_y=dict(type="data", symmetric=False, array=x.gain_hi - x.gain, arrayminus=x.gain - x.gain_lo))
        fig.add_hline(y=0, line=dict(color="#C9CED6"))
        fig.update_layout(title="Extra savings vs no probing ($/yr, paired, 95% CI)", xaxis_title="Probe budget per peak",
                          yaxis_title="$ per year", height=400)
        p1, p2 = st.columns([1.3, 1])
        p1.plotly_chart(fig, width="stretch")
        tab = d[["cond", "budget", "probes", "width", "miss", "sav"]].copy()
        tab["cond"] = tab.cond.map(ui.SHORT)
        tab.columns = ["Policy", "Budget", "Probes used / peak", "Interval width", "P5 miss", "Savings $/yr"]
        p2.dataframe(tab.sort_values(["Budget", "Policy"]).style.format(
            {"Probes used / peak": "{:.2f}", "Interval width": "{:.2%}", "P5 miss": "{:.1%}", "Savings $/yr": "${:,.0f}"}),
            hide_index=True, width="stretch", height=400)
        rob = PROBE[PROBE.tag.isin(["probe_noisy", "probe_bias", "probe_bias_C"])]
        if len(rob):
            st.markdown("##### Robustness: probing is not assumed to help")
            rb = rob[["tag", "cond", "sav", "probes", "miss", "width"]].copy()
            rb["tag"] = rb.tag.map({"probe_noisy": "Noisy probes (3%)", "probe_bias": "Biased cell reports (+3%)",
                                    "probe_bias_C": "Biased reports, no probing"})
            rb["cond"] = rb.cond.map(ui.SHORT)
            rb.columns = ["Test", "Policy", "Savings $/yr", "Probes used / peak", "P5 miss", "Interval width"]
            st.dataframe(rb.style.format({"Savings $/yr": "${:,.0f}", "Probes used / peak": "{:.2f}", "P5 miss": "{:.1%}",
                                          "Interval width": "{:.2%}"}), hide_index=True, width="stretch")


# =============================================================== 8. temperature
with tabs[7]:
    pe = peak_events()
    st.markdown("#### Real ISO-NE peaks 2019&ndash;2025: both temperature extremes matter")
    t1c, t2c = st.columns(2)
    fig = go.Figure()
    fig.add_scatter(x=pe.month + np.random.default_rng(0).uniform(-0.15, 0.15, len(pe)), y=pe.wcma_dry_bulb_c,
                    mode="markers", marker=dict(size=9, color=[ui.ACCENT["bad"] if a else ui.COLORS["B"] for a in pe.is_annual],
                                                line=dict(color="#FFFFFF", width=1)),
                    hovertext=pe.Date.dt.strftime("%Y-%m-%d") + " HE" + pe.Hr_End.astype(str), name="monthly peak")
    fig.update_layout(title="Temperature at each system monthly peak (red: annual peak)", height=380,
                      xaxis=dict(title="Month", dtick=1), yaxis_title="WCMA dry bulb (C)", showlegend=False)
    t1c.plotly_chart(fig, width="stretch")
    hh = pe.assign(season=pe.month.map(SEASON)).groupby(["season", "Hr_End"]).size().reset_index(name="n")
    fig = go.Figure()
    for sname, colr in (("summer", ui.ACCENT["bad"]), ("winter", ui.COLORS["B"]), ("spring", ui.COLORS["C"]), ("fall", ui.ACCENT["warn"])):
        x = hh[hh.season == sname]
        fig.add_bar(x=x.Hr_End, y=x.n, name=sname, marker_color=colr)
    fig.update_layout(barmode="stack", title="Hour of the monthly peak, by season", xaxis=dict(title="Hour ending", dtick=1),
                      yaxis_title="Number of peaks", height=380)
    t2c.plotly_chart(fig, width="stretch")
    ann = pe[pe.is_annual]
    ui.cards([
        ui.card("Annual peaks in summer", f"{len(ann)} of {len(ann)}", "hour ending 16-18, Jun-Sep", "bad", "DERIVED"),
        ui.card("Hottest annual peak", f"{ann.wcma_dry_bulb_c.max():.1f} C", f"{ann.loc[ann.wcma_dry_bulb_c.idxmax(),'Date']:%d %b %Y}", "warn", "DERIVED"),
        ui.card("Coldest monthly peak", f"{pe.wcma_dry_bulb_c.min():.1f} C", f"{pe.loc[pe.wcma_dry_bulb_c.idxmin(),'Date']:%d %b %Y}", "info", "DERIVED"),
        ui.card("Na-ion charge window", f"{NA_ION.t_charge_min:.0f} to 40 C", "vendor datasheet, not REON", "neutral", "ASSUMED"),
    ])
    st.write("")
    if not SENS.empty:
        th = SENS[SENS.tag.isin(["hvac_weak", "hvac_failing"])]
        if len(th):
            rows = [dict(Scenario="Base HVAC (k=0.25, sigma_T 2.5 C)", **{"Max cell temp (A), C": f"{ev[ev.cond=='A'].t_cell_max.max():.1f}",
                         "Physical value $/yr": ui.usd(DEC.set_index('component').loc['V1 Physical (bypass)', 'mean']),
                         "Break-even premium $/kWh": f"{t1.loc['C'].premium[0]:,.1f}"})]
            for _, x in th.iterrows():
                rows.append({"Scenario": "Weak HVAC (k=0.7, sigma_T 5 C)" if x.tag == "hvac_weak" else "Failing HVAC (k=1.0, sigma_T 6 C)",
                             "Max cell temp (A), C": f"{x.tcell_max:.1f}", "Physical value $/yr": ui.usd(x.v1),
                             "Break-even premium $/kWh": f"{x.prem_c:,.1f}"})
            st.markdown("##### The 'hot cell rests' channel")
            st.dataframe(pd.DataFrame(rows), hide_index=True, width="stretch")
            ui.callout("In a fixed string the hottest cell forces a current derate for the whole string; with bypass only that cell "
                       "rests. With a working HVAC system the cells stay well below the derate threshold even on the hottest peaks, "
                       "so the channel is small; it appears when cooling is weak and the cell-to-cell temperature spread is large. "
                       "The container's real spread is unknown; we have asked REON.", "warn")


# =============================================================== 9. economics
with tabs[8]:
    st.markdown("#### What a town gets: ISO-NE rates and per-household value")
    rates = pd.DataFrame([
        dict(Item="RNS transmission rate 2026", Value="$183.71 /kW-yr", Use="each monthly peak worth RNS/12 per kW", Flag="CONFIRMED"),
        dict(Item="RNS increments 2027-2030", Value="+$9, +$11, +$13, +$10 /kW-yr", Use="ISO-NE forecast, 'illustrative'", Flag="CONFIRMED"),
        dict(Item="Capacity (FCA 18, 2027/28)", Value="$3.58 /kW-month", Use="annual peak, x12; flat afterwards (assumed)", Flag="CONFIRMED"),
        dict(Item="Discount rate", Value=f"{CFG.discount_rate:.1%}", Use="NPV", Flag="ASSUMED"),
        dict(Item="Augmentation cost", Value=f"${CFG.augment_cost_kwh:.0f}/kWh", Use="replacing weak cells to stay above 70%", Flag="ASSUMED"),
    ])
    st.dataframe(rates, hide_index=True, width="stretch")
    ceiling = float(EVV[EVV.cond == "A"].groupby(["run", "sim_year"]).ceiling_usd.sum().mean())
    st.markdown("##### Per household, one CES per town")
    rows = []
    for town, info in econ.TOWNS.items():
        rows.append({"Town": town, "Customers": f"{info['customers']:,}", "Peak load": f"{info['peak_mw']} MW",
                     "Conventional (A) $/customer/yr": f"${t1.loc['A'].savings[0]/info['customers']:,.0f}",
                     "PeakSure (C) $/customer/yr": f"${t1.loc['C'].savings[0]/info['customers']:,.0f}",
                     "Upper bound $/customer/yr": f"${ceiling/info['customers']:,.0f}", "Source": info["src"]})
    st.dataframe(pd.DataFrame(rows), hide_index=True, width="stretch")
    holden = 10e6 / 20 / econ.TOWNS["Holden"]["customers"]
    ui.callout(f"<b>Reality check.</b> Holden's own projection for its 5 MW / 22 MWh battery (&gt;$10M over 20 years, 'conservative') is "
               f"about <b>${holden:,.0f} per customer per year</b> for a system with twice the power and four times the energy of one CES. "
               f"Our upper bound assumes every peak is shaved at full 2.5 MW (${ceiling/1e3:,.0f}K/yr).", "good")
    fig = go.Figure()
    for cnd in ("A", "B", "C", "D", "C_T3"):
        if cnd in t1.index:
            m_, lo_, hi_ = t1.loc[cnd].npv
            fig.add_bar(x=[ui.SHORT[cnd]], y=[m_], marker_color=ui.COLORS[cnd], showlegend=False,
                        error_y=dict(type="data", symmetric=False, array=[hi_ - m_], arrayminus=[m_ - lo_], color="#5C677D"))
    fig.update_layout(title="15-year NPV of peak savings net of augmentation (95% CI)", yaxis_title="$", height=380)
    st.plotly_chart(fig, width="stretch")


# =============================================================== 10. lifetime & CO2
with tabs[9]:
    st.markdown("#### Lifetime, augmentation and embodied carbon")
    y10 = BANDS[BANDS.sim_year == 9].set_index("cond").p50
    over = max(0.0, (y10.get("C", np.nan) / y10.get("A", np.nan) - 1) * CFG.e_nom_kwh)
    lo, mid, hi = CFG.co2_kg_per_kwh
    aug_a, aug_c = t1.loc["A"].aug[0], t1.loc["C"].aug[0]
    t3 = t1.loc["C_T3"] if "C_T3" in t1.index else None
    ui.cards([
        ui.card("Augmentation avoided (15 yr)", f"{aug_a - aug_c:,.0f} kWh", f"A {aug_a:,.0f} vs C {aug_c:,.0f} kWh of cells replaced", "good", "MODEL"),
        ui.card("Embodied CO2 avoided", f"{(aug_a-aug_c)*mid/1000:,.1f} t", f"range {(aug_a-aug_c)*lo/1000:,.1f}-{(aug_a-aug_c)*hi/1000:,.1f} t at 31-92 kg/kWh", "good", "MODEL"),
        ui.card("Year-10 deliverable energy", f"+{over:,.0f} kWh", "C over A at 25 C (oversizing a fixed string would need)", "info", "MODEL"),
        ui.card("Tier 3 resting SOC, year-15 energy",
                f"{BANDS[(BANDS.cond=='C_T3')&(BANDS.sim_year==14)].p50.iloc[0] - BANDS[(BANDS.cond=='C')&(BANDS.sim_year==14)].p50.iloc[0]:+,.0f} kWh"
                if t3 is not None else "n/a", "vs C; requires per-cell SOC hold (unconfirmed)", "neutral", "MODEL"),
    ])
    st.write("")
    mo_y = mo[mo.month == 12].groupby(["cond", "sim_year"]).agg(soh_mean=("soh_mean", "mean"), soh_p5=("soh_p5", "mean"),
                                                                soh_min=("soh_min", "mean")).reset_index()
    fig = go.Figure()
    for cnd in ("A", "C"):
        x = mo_y[mo_y.cond == cnd]
        fig.add_scatter(x=x.sim_year + 1, y=x.soh_mean, name=f"{ui.SHORT[cnd]}: mean cell", line=dict(color=ui.COLORS[cnd], width=2.5))
        fig.add_scatter(x=x.sim_year + 1, y=x.soh_min, name=f"{ui.SHORT[cnd]}: weakest cell", line=dict(color=ui.COLORS[cnd], dash="dot"))
    fig.update_layout(title="Cell state of health: average vs weakest cell (mean over runs)", xaxis_title="Year", yaxis_title="SoH",
                      height=400, yaxis_tickformat=".0%")
    st.plotly_chart(fig, width="stretch")
    ui.callout("Grid CO2 is not claimed. In ISO-NE the marginal rate is about 700 lb/MWh on- and off-peak alike, so charging off-peak "
               "and discharging on-peak with ~85% round-trip efficiency is roughly neutral on average (ISO-NE 2024 Air Emissions Report). "
               "Environmental value here is embodied: fewer cells manufactured.", "warn")


# =============================================================== 11. assumptions
with tabs[10]:
    st.markdown("#### Evidence and assumptions (every parameter in the model)")
    rows = [dict(Parameter=k, Flag=v[0], Source=v[1]) for k, v in SYSTEM_FLAGS.items()]
    rows += [dict(Parameter=f"Na-ion: {k}", Flag=v[0], Source=v[1]) for k, v in NA_ION.flags.items()]
    df = pd.DataFrame(rows)
    st.dataframe(df, hide_index=True, width="stretch", height=520)
    st.markdown("##### Limits we state openly")
    for x in [
        "Ground truth is a simulator. Calibration and benchmark results show internal consistency, not hardware validation.",
        "The CES string design (cells per string, N_min, DC window), chemistry, switch losses and thermal spread are not public; "
        "they are assumptions with sensitivity ranges.",
        "Ageing parameters are order-of-magnitude values informed by TUM (Na-ion) and Naumann (LFP); fitting to the raw datasets is pending.",
        "Peak days are assumed known (MMWEC reports accurate peak calling); only the hour is uncertain, forecast leave-one-year-out "
        "from 2019-2025 ISO-NE data.",
        "Tariffs are simplified: RNS on monthly peaks and capacity on the annual peak, without MLP-specific pass-through.",
        "VoI probing and per-cell resting SOC are stated or plausible capabilities; their accuracy on REON hardware is unconfirmed.",
        "REON's '2-4x' is a company claim, not our result.",
    ]:
        st.markdown(f"- {x}")
    st.markdown("##### Questions for REON")
    for q in ["CES chemistry, cells per string, DC window and N_min?", "Bypass switch losses and round-trip efficiency?",
              "Per-cell measurement accuracy and data access?", "Can a cell be driven with a diagnostic current step during operation?",
              "Can cells be held at different SOC at rest?", "Cell-to-cell temperature spread inside a container on a hot afternoon?",
              "Typical MLP duty cycle and dispatch days per year?"]:
        st.markdown(f"- {q}")
