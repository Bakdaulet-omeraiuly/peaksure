"""Narrated pitch walkthrough (MP4) and matching slide deck (PDF) for PeakSure × REON EBS.

Order: problem → where REON comes in → two-phase approach → Phase 1 retrofit → Phase 2 scale →
Compare tab (real peak hour, then the drain test showing stranded energy) → assumptions → recommendation.

Every number in the narration and on the slides is read from the model exports (web/public/data), the costs
module, or the live Compare page (AGENTS.md rule 1). Needs the site running at --url, Google Chrome, macOS `say`
(Ava (Premium) by default), and playwright, pillow, imageio-ffmpeg.

Run: python tools/make_pitch_video.py [--url http://localhost:3000] [--voice "Ava (Premium)"] [--rate 200]
Out: video/PeakSure_pitch_demo.mp4, video/PeakSure_pitch_deck.pdf, video/pitch_script.md
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from peaksure import costs  # noqa: E402
from peaksure.facility import G2_DEMAND_USD_PER_KW_MONTH  # noqa: E402

OUT = ROOT / "video"
TMP = OUT / "pitch_frames"
W, H = 1920, 1080          # logical layout units
S = 2                      # render scale: 2 = 3840x2160 (4K)
RW, RH = W * S, H * S
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
AV = "/System/Library/Fonts/Avenir Next.ttc"
FONT = {"bold": 0, "demi": 2, "medium": 5, "regular": 7}
WHITE, MUTED, GREEN, AMBER, RED = (240, 246, 243), (170, 196, 185), (126, 226, 160), (233, 162, 59), (239, 74, 60)
BG_TOP, BG_BOT = (10, 34, 27), (5, 18, 14)
FF = imageio_ffmpeg.get_ffmpeg_exe()


def f(size: int, w: str = "regular") -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(AV, size * S, index=FONT[w])


class SD:
    """ImageDraw proxy: takes logical (1920x1080) coordinates and draws at S x resolution."""

    def __init__(self, im: Image.Image):
        self.d = ImageDraw.Draw(im)

    @staticmethod
    def _xy(v):
        if isinstance(v, (list, tuple)) and v and isinstance(v[0], (list, tuple)):
            return [(x * S, y * S) for x, y in v]
        return [c * S for c in v]

    def text(self, xy, txt, **k):
        self.d.text((xy[0] * S, xy[1] * S), txt, **k)

    def textlength(self, txt, font):
        return self.d.textlength(txt, font=font) / S

    def line(self, pts, fill=None, width=1, joint=None):
        self.d.line(self._xy(pts), fill=fill, width=int(width * S), joint=joint)

    def rectangle(self, box, **k):
        self.d.rectangle(self._xy(box), **k)

    def ellipse(self, box, **k):
        self.d.ellipse(self._xy(box), **k)

    def polygon(self, pts, **k):
        self.d.polygon(self._xy(pts), **k)

    def rounded_rectangle(self, box, radius=0, width=1, **k):
        self.d.rounded_rectangle(self._xy(box), radius=radius * S, width=int(width * S), **k)


# ---------------------------------------------------------------- data
def data() -> dict:
    d = ROOT / "web/public/data"
    r, s = json.loads((d / "results.json").read_text()), json.loads((d / "strategy.json").read_text())
    ev, c = json.loads((d / "events.json").read_text()), json.loads((d / "constants.json").read_text())
    sens = {x["tag"]: x["v1"] + x["v2"] for x in r["sens"]}
    t1 = {x["cond"]: x for x in r["t1"]}
    annual = max((e for e in ev if e["is_annual"]), key=lambda e: e["year"])
    cells = [85] * 15 + [70]
    return dict(
        n=len(ev), y0=min(e["year"] for e in ev), y1=max(e["year"] for e in ev), rns=c["rns_2026"], fca=c["fca_kw_month"],
        peak=annual, v1h=sens["duration_1h"], vfail=sens["hvac_failing"], vfault=sens["fault_scenario"], v2h=sum(
            x["mean"] for x in r["dec"] if x["component"].startswith(("V1", "V2"))),
        a_cap=t1["A"]["capture"], c_cap=t1["C"]["capture"], rc=s["assumptions"]["retrofit_cost"],
        prem=s["assumptions"]["premium"], gain=sum(cells) / (min(cells) * 16) - 1, avg=sum(cells) / 16,
        towns=costs.TOWN_BATTERIES, g2=G2_DEMAND_USD_PER_KW_MONTH, a_sav=t1["A"]["savings"][0],
    )


def usd(x: float) -> str:
    return f"${round(x, -3):,.0f}"


def nice_date(iso: str) -> str:
    import datetime as _dt
    d = _dt.date.fromisoformat(iso)
    return f"{d.strftime('%B')} {d.day}, {d.year}"


def spoken_commit(txt: str) -> str:
    p, h, e = re.match(r"([\d.]+) MW × (\d+) h = ([\d.]+) MWh", txt).groups()
    return f"{float(p):g} megawatts for {h} hour{'s' if h != '1' else ''}, {float(e):g} megawatt-hours"


def spoken_kwh(txt: str) -> str:
    return txt.replace(" kWh", " kilowatt-hours")


# ---------------------------------------------------------------- slide drawing
def canvas() -> Image.Image:
    im = Image.new("RGB", (RW, RH), BG_BOT)
    px = ImageDraw.Draw(im)
    for y in range(RH):
        t = y / RH
        px.line([(0, y), (RW, y)], fill=tuple(int(BG_TOP[i] * (1 - t) + BG_BOT[i] * t) for i in range(3)))
    glow = Image.new("L", (RW, RH), 0)
    ImageDraw.Draw(glow).ellipse([RW * 0.55, -RH * 0.3, RW * 1.2, RH * 0.6], fill=60)
    glow = glow.filter(ImageFilter.GaussianBlur(160 * S))
    im.paste(Image.new("RGB", (RW, RH), (40, 110, 80)), (0, 0), glow)
    return im


def headline(d: ImageDraw.ImageDraw, parts: list[tuple[str, tuple]], x: int, y: int, size: int = 74, maxw: int = 1640) -> int:
    """Draw a headline made of coloured parts, wrapping on spaces. Returns the y below it."""
    font = f(size, "demi")
    words = [(w, col) for txt, col in parts for w in txt.split(" ") if w]
    line, lines = [], []
    for w, col in words:
        test = " ".join(t for t, _ in line + [(w, col)])
        if d.textlength(test, font=font) > maxw and line:
            lines.append(line)
            line = []
        line.append((w, col))
    lines.append(line)
    for ln in lines:
        cx = x
        for w, col in ln:
            d.text((cx, y), w, font=font, fill=col)
            cx += d.textlength(w + " ", font=font)
        y += int(size * 1.18)
    return y


def eyebrow(d, text, x=120, y=110):
    d.text((x, y), text.upper(), font=f(26, "demi"), fill=GREEN, spacing=4)


def para(d, text, x, y, size=34, maxw=1500, col=MUTED, lh=1.45):
    font = f(size, "regular")
    words, line = text.split(" "), ""
    for w in words:
        if d.textlength((line + " " + w).strip(), font=font) > maxw:
            d.text((x, y), line, font=font, fill=col)
            y += int(size * lh)
            line = w
        else:
            line = (line + " " + w).strip()
    d.text((x, y), line, font=font, fill=col)
    return y + int(size * lh)


def card(d, box, title, body, accent=GREEN, tsize=40):
    x0, y0, x1, y1 = box
    d.rounded_rectangle(box, radius=24, fill=(18, 52, 41), outline=(46, 96, 76), width=2)
    d.text((x0 + 36, y0 + 30), title, font=f(tsize, "demi"), fill=accent)
    yy = y0 + 30 + int(tsize * 1.5)
    for line in body:
        yy = para(d, line, x0 + 36, yy, size=29, maxw=x1 - x0 - 72, col=WHITE if line.startswith("•") else MUTED, lh=1.38) + 8


def footer(d):
    d.text((120, H - 70), "PeakSure × REON EBS  ·  simulation on real ISO-NE data", font=f(22, "medium"), fill=(110, 140, 128))


def slide_problem(v) -> Image.Image:
    im = canvas(); d = SD(im)
    eyebrow(d, "The problem")
    y = headline(d, [("One", WHITE), ("hot hour", GREEN), ("sets a town's power bill", WHITE)], 120, 160)
    para(d, f"Massachusetts utilities pay ${v['rns']:.2f}/kW-yr transmission on each monthly ISO-NE peak, plus capacity "
            f"(${v['fca']:.2f}/kW-month) on the annual peak. Those charges reach every household.", 120, y + 10, maxw=760)
    # real annual peak-day load curve
    e = v["peak"]; L = e["load"]; x0, y0, x1, y1 = 980, 330, 1800, 860
    lo, hi = min(L), max(L)
    pts = [(x0 + i * (x1 - x0) / 23, y1 - (l - lo) / (hi - lo) * (y1 - y0 - 60)) for i, l in enumerate(L)]
    he = e["he"]; px = pts[he - 1][0]
    d.rectangle([px - 18, y0 - 10, px + 18, y1], fill=(70, 66, 30))
    d.line(pts, fill=GREEN, width=6, joint="curve")
    d.ellipse([px - 14, pts[he - 1][1] - 14, px + 14, pts[he - 1][1] + 14], fill=AMBER)
    d.text((px - 120, y0 - 50), f"HE{he} · {e['t_amb_c']:.0f} °C", font=f(28, "demi"), fill=AMBER)
    for i, lab in ((0, "midnight"), (6, "6 AM"), (12, "noon"), (18, "6 PM"), (23, "midnight")):
        d.text((pts[i][0] - 40, y1 + 16), lab, font=f(24), fill=MUTED)
    d.text((x0, y1 + 60), f"ISO-NE system load, {nice_date(e['date'])} annual peak", font=f(24, "medium"), fill=MUTED)
    footer(d); return im


def slide_reon(v) -> Image.Image:
    im = canvas(); d = SD(im)
    eyebrow(d, "Where REON comes in")
    y = headline(d, [("A battery is only as strong as its", WHITE), ("weakest cell", AMBER)], 120, 160)
    para(d, "In a fixed series string the first weak cell stops the whole string. REON puts a switch at every cell: "
            "a weak cell is bypassed and the rest keep delivering.", 120, y + 6, maxw=1500)
    for row, (label, bypass) in enumerate((("Fixed string: stops at the 70 Ah cell", False), ("REON bypass: weak cell switched out", True))):
        yb = 560 + row * 230
        d.text((120, yb - 50), label, font=f(30, "demi"), fill=WHITE if bypass else MUTED)
        for i in range(16):
            cap = 70 if i == 6 else 85
            used = cap if bypass else 70
            xb = 120 + i * 104
            d.rounded_rectangle([xb, yb, xb + 88, yb + 150], radius=10, fill=(30, 52, 44))
            hh = int(150 * used / 85)
            col = (90, 100, 110) if (bypass and i == 6) else (RED if (not bypass and i == 6) else GREEN)
            d.rounded_rectangle([xb, yb + 150 - hh, xb + 88, yb + 150], radius=10, fill=col)
    d.text((120, 952), f"+{v['gain'] * 100:.0f}% energy with bypass: {v['avg']:.2f} vs 70 Ah per cell (challenge example)", font=f(32, "demi"), fill=GREEN)
    footer(d); return im


def slide_phases(v) -> Image.Image:
    im = canvas(); d = SD(im)
    eyebrow(d, "Our solution · two phases")
    headline(d, [("Prove it on today's batteries,", WHITE), ("then build it into tomorrow's", GREEN)], 120, 160)
    card(d, (120, 420, 900, 700), "Phase 1 · Retrofit", ["Add REON's cell-level BMS to batteries already installed.",
                                                         "• Prove the technology works", "• Cheapest way in: no new battery"])
    card(d, (1020, 420, 1800, 700), "Phase 2 · Scale", ["Sell REON EBS batteries with cell control built in.",
                                                       "• Once the field evidence is in", "• PeakSure as the decision layer"])
    d.line([(918, 560), (1000, 560)], fill=GREEN, width=8)
    d.polygon([(1000, 538), (1000, 582), (1018, 560)], fill=GREEN)
    d.text((920, 600), "evidence", font=f(24, "medium"), fill=MUTED)
    footer(d); return im


def slide_phase1(v) -> Image.Image:
    im = canvas(); d = SD(im)
    eyebrow(d, "Phase 1 · Retrofit")
    y = headline(d, [("Add cell-level control to", WHITE), ("batteries that already exist", GREEN)], 120, 160)
    card(d, (120, y + 20, 900, y + 380), "Cost", [f"About ${v['rc']['low']:.0f}–{v['rc']['high']:.0f} per kWh (team estimate).",
                                             "No new battery to buy.", "Exit test: more energy delivered and fewer missed peaks, measured on site."])
    x0, yy = 1000, y + 20
    d.text((x0, yy), "Where it pays (model, per year)", font=f(32, "demi"), fill=WHITE); yy += 64
    for lab, val in (("1-h battery", v["v1h"]), ("Failing cooling", v["vfail"]), ("Faulty cells", v["vfault"]), ("Healthy 2-h battery", v["v2h"])):
        d.text((x0, yy), lab, font=f(30), fill=MUTED)
        d.text((x0 + 520, yy), ("+" if val >= 0 else "−") + usd(abs(val)), font=f(34, "demi"), fill=GREEN if val > 1000 else MUTED)
        yy += 56
    yy += 24
    d.text((x0, yy), "Massachusetts candidates", font=f(32, "demi"), fill=WHITE); yy += 60
    for name, t in v["towns"].items():
        d.text((x0, yy), f"{name}: {t['mw']:g} MW / {t['mwh']:g} MWh ({t['year']})", font=f(29), fill=MUTED); yy += 48
    footer(d); return im


def slide_phase2(v) -> Image.Image:
    im = canvas(); d = SD(im)
    eyebrow(d, "Phase 2 · Scale")
    y = headline(d, [("With proof in hand, sell", WHITE), ("REON EBS with cell control built in", GREEN)], 120, 160)
    card(d, (120, y + 20, 900, y + 330), "When", ["Phase 1 shows measured extra energy and fewer missed peaks.",
                                             "REON confirms EBS specifications and certification."])
    card(d, (1020, y + 20, 1800, y + 330), "Where", ["• New municipal light plant storage in Massachusetts",
                                                f"• Commercial sites on demand charges, e.g. National Grid G-2 at ${v['g2']:.2f}/kW-month",
                                                f"• Priced {v['prem']['low'] * 100:+.0f}% to {v['prem']['high'] * 100:+.0f}% vs conventional (team estimate)"])
    footer(d); return im


def slide_reco(v) -> Image.Image:
    im = canvas(); d = SD(im)
    eyebrow(d, "Our recommendation")
    y = headline(d, [("Start now with a", WHITE), ("retrofit pilot", GREEN), ("on batteries that are already struggling", WHITE)], 120, 160)
    for i, (when, what) in enumerate((("Next 3 months", "Read-only data pilot"), ("3–12 months", "Retrofit pilot on 1–2 MA batteries"),
                                       ("After the evidence", "Scale with REON EBS"))):
        x = 120 + i * 570
        d.rounded_rectangle([x, y + 30, x + 530, y + 260], radius=24, fill=(18, 52, 41), outline=(46, 96, 76), width=2)
        d.text((x + 34, y + 60), when.upper(), font=f(24, "demi"), fill=GREEN)
        para(d, what, x + 34, y + 110, size=36, maxw=460, col=WHITE)
    yy = y + 320
    for lab, txt in (("Reliability", f"covers {v['c_cap'] * 100:.0f}% of monthly peaks vs {v['a_cap'] * 100:.0f}%"),
                     ("Affordable power", "more from batteries towns already own"),
                     ("Scaling", "every pilot turns modelled value into measured value")):
        d.text((120, yy), lab, font=f(34, "demi"), fill=WHITE)
        d.text((520, yy), txt, font=f(34), fill=MUTED); yy += 66
    footer(d); return im


def title_card(t1, t2) -> Image.Image:
    im = canvas(); d = SD(im)
    for txt, font, y, col in ((t1, f(96, "demi"), H // 2 - 110, WHITE), (t2, f(48, "medium"), H // 2 + 30, GREEN)):
        d.text(((W - d.textlength(txt, font=font)) / 2, y), txt, font=font, fill=col)
    return im


def framed(shot: Path, title: list, sub: str | None = None, eyebrow_txt: str = "Compare tab · live model") -> Image.Image:
    """A page screenshot placed under a headline on the slide background."""
    im = canvas(); d = SD(im)
    eyebrow(d, eyebrow_txt, y=70)
    y = headline(d, title, 120, 110, size=54)
    if sub:
        d.text((120, y - 4), sub, font=f(28, "medium"), fill=MUTED); y += 44
    sh = Image.open(shot).convert("RGB")
    sc = min((W - 200) * S / sh.width, (H - y - 70) * S / sh.height)
    sh = sh.resize((int(sh.width * sc), int(sh.height * sc)), Image.LANCZOS)
    mask = Image.new("L", sh.size, 0); ImageDraw.Draw(mask).rounded_rectangle([0, 0, sh.width, sh.height], radius=18 * S, fill=255)
    im.paste(sh, ((RW - sh.width) // 2, int((y + 10) * S)), mask)
    return im


def stage_frame(shot: Path, title: list, sub: str, st: list, second: str) -> Image.Image:
    im = canvas(); d = SD(im)
    eyebrow(d, "Compare tab · live model", y=60)
    y = headline(d, title, 120, 98, size=52)
    d.text((120, y - 6), sub, font=f(27, "medium"), fill=MUTED)
    sh = Image.open(shot).convert("RGB")
    box_h = 600
    sc = min((W - 240) * S / sh.width, box_h * S / sh.height)
    sh = sh.resize((int(sh.width * sc), int(sh.height * sc)), Image.LANCZOS)
    mask = Image.new("L", sh.size, 0); ImageDraw.Draw(mask).rounded_rectangle([0, 0, sh.width, sh.height], radius=18 * S, fill=255)
    top = y + 44
    im.paste(sh, ((RW - sh.width) // 2, int(top * S)), mask)
    n = len(st); gw = (W - 240 - (n - 1) * 30) // n; yy = top + sh.height / S + 26
    for i, (name, a, b) in enumerate(st):
        x = 120 + i * (gw + 30)
        d.rounded_rectangle([x, yy, x + gw, yy + 150], radius=18, fill=(18, 52, 41), outline=(46, 96, 76), width=2)
        d.text((x + 28, yy + 14), name, font=f(28, "demi"), fill=WHITE)
        d.text((x + 28, yy + 56), f"Delivered  {a}", font=f(30, "medium"), fill=GREEN)
        d.text((x + 28, yy + 98), f"{second}  {b}", font=f(30, "medium"), fill=AMBER if second == "Stranded" else MUTED)
    return im


# ---------------------------------------------------------------- live page capture
SET = """(v)=>{const el=document.querySelector('input[aria-label="Shared timeline for all batteries"]');
const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; s.call(el,String(v));
el.dispatchEvent(new Event('input',{bubbles:true}));}"""


def card_value(text: str, name: str, row: str) -> str:
    seg = text.rsplit(name, 1)[1]
    m = re.search(row + r"\s*\n\s*([\d,]+ kWh|[\d/]+)", seg)
    return m.group(1) if m else "?"


def stats(text: str, names: tuple, second: str) -> list:
    return [(n, card_value(text, n, "Delivered"), card_value(text, n, second) if second != "Delivered" else card_value(text, n, "Strings on"))
            for n in names]


def capture(url: str) -> dict:
    out = {}
    TMP.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME, headless=True, args=["--use-angle=metal", "--ignore-gpu-blocklist"])
        pg = b.new_page(viewport={"width": 1500, "height": 980}, device_scale_factor=3)
        main = lambda: pg.locator("main").first  # noqa: E731
        pg.goto(url + "/compare", wait_until="networkidle"); pg.wait_for_timeout(3500)
        sl = pg.get_by_label("Shared timeline for all batteries")
        lo, hi = int(sl.get_attribute("min")), int(sl.get_attribute("max"))
        out["peak_frames"] = []
        stage = lambda: pg.locator(".studio-stage").first  # noqa: E731
        for k, m in enumerate(range(lo, hi + 1, max(1, (hi - lo) // 160))):
            pg.evaluate(SET, m); pg.wait_for_timeout(140)
            fp = TMP / f"peak_{k:03d}.png"; stage().screenshot(path=str(fp))
            out["peak_frames"].append((fp, stats(main().inner_text(), ("A · Conventional", "B · REON EBS", "C · REON EBS + PeakSure"), "Delivered")))
        t = main().inner_text()
        out["commit"] = re.search(r"([\d.]+ MW × \d+ h = [\d.]+ MWh)", t).group(1)
        out["delivered_a"] = card_value(t, "A · Conventional", "Delivered")
        out["delivered_c"] = card_value(t, "C · REON EBS + PeakSure", "Delivered")
        pg.get_by_role("button", name="Drain test").click(); pg.wait_for_timeout(2500)
        sl = pg.get_by_label("Shared timeline for all batteries")
        lo, hi = int(sl.get_attribute("min")), int(sl.get_attribute("max"))
        out["drain_frames"] = []
        for k, m in enumerate(range(lo, hi + 1, max(1, (hi - lo) // 220))):
            pg.evaluate(SET, m); pg.wait_for_timeout(140)
            fp = TMP / f"drain_{k:03d}.png"; stage().screenshot(path=str(fp))
            out["drain_frames"].append((fp, stats(main().inner_text(), ("A · Conventional", "B · REON EBS"), "Stranded")))
        pg.evaluate(SET, hi); pg.wait_for_timeout(400)
        t = main().inner_text()
        out["stranded_a"] = card_value(t, "A · Conventional", "Stranded")
        out["stranded_b"] = card_value(t, "B · REON EBS", "Stranded")
        out["drain_minutes"] = hi
        pg.goto(url + "/assumptions", wait_until="networkidle"); pg.wait_for_timeout(1500)
        sec = pg.get_by_text("By case", exact=True).first.locator("xpath=ancestor::section[1]")
        sec.scroll_into_view_if_needed(); fp = TMP / "assumptions.png"; sec.screenshot(path=str(fp)); out["assumptions"] = fp
        b.close()
    return out


# ---------------------------------------------------------------- narration + assembly
def scenes(v: dict, cap: dict) -> list[dict]:
    e = v["peak"]
    return [
        dict(img=title_card("PeakSure  ×  REON EBS", "Reliable, affordable peak power"),
             say="PeakSure, with REON's Energy Block System."),
        dict(img=slide_problem(v),
             say=f"The problem: a few peak hours set the grid bill. Massachusetts utilities pay {v['rns']:.2f} dollars per kilowatt-year "
                 f"on each monthly peak, and every household pays it. Shave the peak, and power gets cheaper and more reliable."),
        dict(img=slide_reon(v),
             say=f"In a normal battery, the weakest cell stops the whole string. REON switches that cell out, so the rest keep "
                 f"delivering: {v['gain'] * 100:.0f} percent more energy on the challenge's own example."),
        dict(img=slide_phases(v),
             say="Our approach has two phases. First, retrofit existing batteries to prove it. Then, scale by selling REON EBS with "
                 "cell control built in."),
        dict(img=slide_phase1(v),
             say=f"Phase one adds REON's cell-level BMS to installed batteries for about {v['rc']['low']:.0f} to {v['rc']['high']:.0f} "
                 f"dollars per kilowatt-hour. It pays most where cells limit delivery: up to {usd(v['vfault'])} a year. "
                 f"Sterling, Reading and Holden are ready candidates."),
        dict(img=slide_phase2(v),
             say="With that proof, we scale: REON EBS for new municipal storage, and for commercial sites on demand charges like "
                 "National Grid's G-2 rate."),
        dict(frames=[stage_frame(p, [("The real", WHITE), (f"{nice_date(e['date'])} peak hour", GREEN)],
                                 f"HE{e['he']} ({e['he'] - 1}:00–{e['he']}:00) · {e['t_amb_c']:.0f} °C · same cells in all three batteries", st, "Strings on")
                     for p, st in cap["peak_frames"]],
             say=f"Here is the real peak of {nice_date(e['date'])}. Three batteries, same cells. Each commits {spoken_commit(cap['commit'])}, "
                 f"and delivers it."),
        dict(frames=[stage_frame(p, [("Drain test:", WHITE), ("where the energy gets stranded", AMBER)],
                                 "Full power until every string stops · conventional vs REON EBS · red = the cell that stopped its string", st, "Stranded")
                     for p, st in cap["drain_frames"]], hold_last=3.5,
             say=f"Now we drain them to empty. The conventional strings stop at their weakest cell, stranding "
                 f"{spoken_kwh(cap['stranded_a'])}. REON EBS switches those cells out and strands only {spoken_kwh(cap['stranded_b'])}."),
        dict(img=framed(cap["assumptions"], [("Every assumption,", WHITE), ("labelled", GREEN)], None, "Assumptions tab"),
             say="Every assumption is labelled, case by case."),
        dict(img=slide_reco(v),
             say=f"Our recommendation: a data pilot now, a retrofit on one or two Massachusetts batteries next, then scale with EBS. "
                 f"The battery covers {v['c_cap'] * 100:.0f} percent of monthly peaks instead of {v['a_cap'] * 100:.0f}."),
        dict(img=title_card("Prove it on today's batteries.", "Build it into tomorrow's."),
             say="Prove it on today's batteries. Build it into tomorrow's."),
    ]


def tts(text: str, wav: Path, voice: str, rate: int) -> float:
    aiff = wav.with_suffix(".aiff")
    subprocess.run(["say", "-v", voice] + (["-r", str(rate)] if rate else []) + ["-o", str(aiff), text], check=True)
    subprocess.run([FF, "-y", "-loglevel", "error", "-i", str(aiff), "-ar", "48000", "-ac", "2", str(wav)], check=True)
    o = subprocess.run([FF, "-i", str(wav)], capture_output=True, text=True).stderr
    hh, mm, ss = o.split("Duration: ")[1].split(",")[0].split(":")
    return int(hh) * 3600 + int(mm) * 60 + float(ss)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:3000")
    ap.add_argument("--voice", default="Ava (Premium)")
    ap.add_argument("--rate", type=int, default=190)
    a = ap.parse_args()
    TMP.mkdir(parents=True, exist_ok=True)
    v = data()
    cap = capture(a.url)
    sc = scenes(v, cap)
    parts, pages = [], []
    for i, s in enumerate(sc):
        wav = TMP / f"n{i:02d}.wav"
        dur = tts(s["say"], wav, a.voice, a.rate) + 0.35
        seg = TMP / f"seg{i:02d}.mp4"
        if "frames" in s:
            fr = s["frames"]
            hold = s.get("hold_last", 0.0)
            anim = max(1.0, dur - hold)
            seqdir = TMP / f"seq{i:02d}"; seqdir.mkdir(exist_ok=True)
            for k, im in enumerate(fr):
                im.save(seqdir / f"{k:04d}.png", compress_level=1)
            fps = len(fr) / anim
            dur = max(dur, anim + hold)
            vin = ["-framerate", f"{fps:.4f}", "-i", str(seqdir / "%04d.png")]
            vf = f"[0:v]scale={RW}:{RH}:flags=lanczos,tpad=stop_mode=clone:stop_duration={hold + 1:.2f},fps=30,format=yuv420p[v]"
            pages.append(fr[-1] if hold else fr[len(fr) // 2])
        else:
            png = TMP / f"slide{i:02d}.png"; s["img"].save(png, compress_level=1)
            vin = ["-loop", "1", "-i", str(png)]
            vf = f"[0:v]scale={RW}:{RH}:flags=lanczos,fade=t=in:st=0:d=0.35,fade=t=out:st={dur - 0.35:.2f}:d=0.35,format=yuv420p[v]"
            pages.append(s["img"])
        subprocess.run([FF, "-y", "-loglevel", "error", *vin, "-i", str(wav), "-filter_complex", vf + f";[1:a]apad,atrim=0:{dur:.2f}[a]",
                        "-map", "[v]", "-map", "[a]", "-t", f"{dur:.2f}", "-r", "30", "-c:v", "libx264", "-preset", "slow",
                        "-crf", "14", "-tune", "stillimage" if "-loop" in vin else "animation", "-profile:v", "high", "-level", "5.1", "-c:a", "aac", "-b:a", "160k", str(seg)], check=True)
        parts.append(seg)
    lst = TMP / "list.txt"; lst.write_text("".join(f"file '{p.name}'\n" for p in parts))
    mp4 = OUT / "PeakSure_pitch_demo.mp4"
    subprocess.run([FF, "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(mp4)], check=True)
    pdf = OUT / "PeakSure_pitch_deck.pdf"
    pages[0].save(pdf, save_all=True, append_images=pages[1:], resolution=300)
    (OUT / "pitch_script.md").write_text("# PeakSure pitch narration\n\n" + "\n\n".join(f"**Slide {i + 1}.** {s['say']}" for i, s in enumerate(sc)) + "\n")
    print(f"wrote {mp4}\nwrote {pdf}")


if __name__ == "__main__":
    main()
