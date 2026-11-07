"""Visual system for the PeakSure demo: palette, cards, chart theme. No emoji; white cards with
a colour accent only."""

from __future__ import annotations

import plotly.graph_objects as go
import plotly.io as pio
import streamlit as st

INK = "#14213D"
MUTED = "#5C677D"
GRID = "#E6E8EC"
BG = "#F6F7F9"

COLORS = {
    "A": "#8D99AE",        # conventional - slate
    "A_opt": "#A7B0C0",
    "A_twin": "#6C7A93",
    "A_perf": "#C3C9D4",
    "B": "#4F7CAC",        # REON bypass - steel blue
    "B_opt": "#7FA3C9",
    "C": "#2E9E5B",        # PeakSure - green
    "C_perf": "#8CCB9F",
    "D": "#0F7C80",        # PeakSure + VoI - teal
    "D_rr": "#5FA8AB",
    "D_rand": "#9FCBCD",
    "C_T3": "#7D5BA6",     # Tier 3 - violet
}
ACCENT = {"good": "#2E9E5B", "info": "#4F7CAC", "warn": "#D98E04", "bad": "#C44536", "neutral": "#8D99AE"}

SHORT = {
    "A": "A  Conventional",
    "A_opt": "A + optimized rule",
    "A_twin": "A + cell twin",
    "A_perf": "A, perfect information",
    "B": "B  REON bypass",
    "B_opt": "B + optimized rule",
    "C": "C  PeakSure",
    "C_perf": "C, perfect information",
    "D": "D  PeakSure + VoI probes",
    "D_rr": "Round-robin probes",
    "D_rand": "Random probes",
    "C_T3": "C + Tier 3 resting SOC",
}

CSS = f"""
<style>
  .stApp {{ background: {BG}; }}
  .block-container {{ padding-top: 1.6rem; max-width: 1320px; }}
  h1, h2, h3, h4 {{ color: {INK}; letter-spacing: -0.01em; }}
  p, li, label, .stMarkdown {{ color: {INK}; }}
  .ps-hero {{ background: #FFFFFF; border: 1px solid {GRID}; border-radius: 10px;
              padding: 22px 26px; margin-bottom: 14px; }}
  .ps-hero h1 {{ font-size: 1.9rem; margin: 0 0 4px 0; }}
  .ps-hero .sub {{ color: {MUTED}; font-size: 1.02rem; }}
  .ps-card {{ background: #FFFFFF; border: 1px solid {GRID}; border-left: 4px solid var(--accent);
              border-radius: 8px; padding: 12px 14px; height: 100%; }}
  .ps-card .lbl {{ color: {MUTED}; font-size: 0.78rem; text-transform: uppercase; letter-spacing: .04em; }}
  .ps-card .val {{ color: {INK}; font-size: 1.55rem; font-weight: 650; line-height: 1.25; }}
  .ps-card .note {{ color: {MUTED}; font-size: 0.80rem; margin-top: 2px; }}
  .ps-flag {{ display: inline-block; font-size: 0.70rem; font-weight: 600; padding: 1px 7px;
              border-radius: 10px; border: 1px solid {GRID}; color: {MUTED}; margin-left: 6px; }}
  .ps-flag.CONFIRMED {{ color: #1D6F42; border-color: #9BD3B0; background: #F0FAF3; }}
  .ps-flag.LIT {{ color: #2B5D8A; border-color: #A9C6E3; background: #F1F6FB; }}
  .ps-flag.DERIVED {{ color: #5A4A8A; border-color: #C5B9E6; background: #F6F3FC; }}
  .ps-flag.ASSUMED {{ color: #8A5A00; border-color: #EBCB8B; background: #FFF8EA; }}
  .ps-flag.MODEL {{ color: {INK}; border-color: #C9CED6; background: #F4F5F7; }}
  .ps-note {{ background: #FFFFFF; border: 1px solid {GRID}; border-radius: 8px; padding: 10px 14px;
              color: {MUTED}; font-size: 0.86rem; }}
  .ps-callout {{ background: #FFFFFF; border: 1px solid {GRID}; border-left: 4px solid {ACCENT['info']};
                 border-radius: 8px; padding: 12px 16px; margin: 6px 0 12px 0; }}
  .ps-callout.warn {{ border-left-color: {ACCENT['warn']}; }}
  .ps-callout.good {{ border-left-color: {ACCENT['good']}; }}
  div[data-baseweb="tab-list"] {{ gap: 2px; flex-wrap: wrap; }}
  button[data-baseweb="tab"] {{ font-size: 0.86rem; padding: 6px 12px; }}
  footer {{ visibility: hidden; }}
</style>
"""


def setup_theme() -> None:
    t = go.layout.Template()
    t.layout = go.Layout(
        font=dict(family="Inter, -apple-system, Segoe UI, Helvetica, Arial", color=INK, size=13),
        paper_bgcolor="#FFFFFF", plot_bgcolor="#FFFFFF",
        xaxis=dict(gridcolor=GRID, zerolinecolor=GRID, linecolor="#C9CED6", ticks="outside", tickcolor="#C9CED6"),
        yaxis=dict(gridcolor=GRID, zerolinecolor=GRID, linecolor="#C9CED6", ticks="outside", tickcolor="#C9CED6"),
        margin=dict(l=56, r=20, t=48, b=48),
        legend=dict(bgcolor="rgba(255,255,255,0.9)", bordercolor=GRID, borderwidth=1, font=dict(size=12)),
        title=dict(font=dict(size=15, color=INK), x=0.0, xanchor="left"),
        hoverlabel=dict(bgcolor="#FFFFFF", bordercolor=GRID, font=dict(color=INK)),
        colorway=[COLORS["A"], COLORS["B"], COLORS["C"], COLORS["D"], COLORS["C_T3"], ACCENT["warn"]],
    )
    pio.templates["peaksure"] = t
    pio.templates.default = "peaksure"


def css() -> None:
    st.markdown(CSS, unsafe_allow_html=True)


def esc(text: str) -> str:
    """Prevent Streamlit from treating pairs of $ as LaTeX."""
    return text.replace("$", "&#36;")


def card(label: str, value: str, note: str = "", accent: str = "info", flag: str | None = None) -> str:
    color = ACCENT.get(accent, accent)
    label, value, note = esc(label), esc(value), esc(note)
    fl = f'<span class="ps-flag {flag}">{flag}</span>' if flag else ""
    return (f'<div class="ps-card" style="--accent:{color}"><div class="lbl">{label}{fl}</div>'
            f'<div class="val">{value}</div><div class="note">{note}</div></div>')


def cards(items: list[str]) -> None:
    cols = st.columns(len(items))
    for c, html in zip(cols, items):
        c.markdown(html, unsafe_allow_html=True)


def callout(text: str, kind: str = "") -> None:
    st.markdown(f'<div class="ps-callout {kind}">{esc(text)}</div>', unsafe_allow_html=True)


def note(text: str) -> None:
    st.markdown(f'<div class="ps-note">{esc(text)}</div>', unsafe_allow_html=True)


def flag(f: str) -> str:
    return f'<span class="ps-flag {f}">{f}</span>'


def usd(x: float, k: bool = True) -> str:
    if x != x:
        return "n/a"
    if k and abs(x) >= 1e6:
        return f"${x/1e6:,.2f}M"
    if k and abs(x) >= 1e3:
        return f"${x/1e3:,.1f}K"
    return f"${x:,.0f}"


def ci_str(m: float, lo: float, hi: float, fmt=usd) -> str:
    return f"{fmt(m)}  [{fmt(lo)}, {fmt(hi)}]"


def rgba(hex_color: str, alpha: float) -> str:
    h = hex_color.lstrip("#")
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return f"rgba({r},{g},{b},{alpha})"


def esc_md(text: str) -> str:
    """Escape $ for plain-markdown contexts (captions) where HTML entities are not rendered."""
    return text.replace("$", "\\$")
