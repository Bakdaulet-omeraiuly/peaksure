"""Build a narrated MP4 walking through the Proposal (plan) and Method tabs of the PeakSure site.

Narration numbers are read from web/public/data (AGENTS.md rule 1). Requires the site running at --url
(default http://localhost:3000), Google Chrome, macOS `say`, and the Python packages playwright, pillow and
imageio-ffmpeg. Output: video/PeakSure_proposal_and_method.mp4 (plus video/script.md with the narration).

Run: python tools/make_video.py [--url http://localhost:3000] [--voice "Ava (Premium)"] [--rate 200]
Premium voices must be downloaded in System Settings > Accessibility > Spoken Content > System voice.
"""
from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "video"
TMP = OUT / "frames"
W, H = 1920, 1080
BG, INK, ACCENT = (244, 246, 245), (21, 33, 29), (21, 59, 47)
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
FONT = "/System/Library/Fonts/Supplemental/Arial.ttf"
FONT_B = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"


def data() -> dict:
    d = ROOT / "web/public/data"
    r = json.loads((d / "results.json").read_text())
    s = json.loads((d / "strategy.json").read_text())
    ev = json.loads((d / "events.json").read_text())
    sens = {x["tag"]: x["v1"] + x["v2"] for x in r["sens"]}
    t1 = {x["cond"]: x for x in r["t1"]}
    cells = [85] * 15 + [70]
    rc = s["assumptions"]["retrofit_cost"]
    return dict(
        n=len(ev), y0=min(e["year"] for e in ev), y1=max(e["year"] for e in ev),
        v1h=sens["duration_1h"], vfail=sens["hvac_failing"], vfault=sens["fault_scenario"],
        a_cap=t1["A"]["capture"], c_cap=t1["C"]["capture"], rlo=rc["low"], rhi=rc["high"],
        avg=sum(cells) / 16, gain=(sum(cells) / (min(cells) * 16) - 1),
    )


def usd(x: float) -> str:
    return f"${round(x, -3):,.0f}"


def scenes(v: dict) -> list[dict]:
    """(page, locator text or None for the top of the page, narration)."""
    return [
        dict(card=("PeakSure  ×  REON EBS", "The plan and the method"),
             say="PeakSure with REON's Energy Block System: our plan, and how we tested it."),
        dict(page="/", find=None,
             say="Massachusetts utilities pay for every kilowatt drawn at regional peak hours. PeakSure tells a battery "
                 "how much power to commit before each peak, using REON's cell-level data."),
        dict(page="/", find="Retrofit · prove it", parent=True,
             say=f"Two stages. First, retrofit REON's cell-level control onto batteries already installed, at about "
                 f"{v['rlo']:.0f} to {v['rhi']:.0f} dollars per kilowatt-hour. Then, once field data proves it, sell new EBS systems "
                 f"with it built in."),
        dict(page="/", find="Where cell-level control pays",
             say=f"We simulated fifteen years on all {v['n']} real ISO New England peaks from {v['y0']} to {v['y1']}. On a healthy "
                 f"two-hour battery the gain is near zero. Where cells limit delivery it is large: about {usd(v['v1h'])} a year "
                 f"for a one-hour battery, {usd(v['vfail'])} with failing cooling, {usd(v['vfault'])} with faulty cells."),
        dict(page="/", find="Our recommendation", part="top",
             say="So we start with a read-only data pilot, then a retrofit on one or two struggling Massachusetts batteries, "
                 "and scale with EBS once the value is measured."),
        dict(page="/", find="Our recommendation", part="bottom",
             say=f"Every pilot adds real data. Weak cells are switched out instead of stopping a string, so the battery covers "
                 f"{v['c_cap'] * 100:.0f} percent of monthly peaks instead of {v['a_cap'] * 100:.0f}, and existing batteries keep "
                 f"power affordable for every household."),
        dict(page="/method", find="Three cases, same cells",
             say="The method compares three cases on identical cells: a conventional battery, the same cells with REON's bypass, "
                 "and REON plus PeakSure's cell twin with a ninety-five percent confidence commitment."),
        dict(page="/method", find="16-cell example",
             say=f"On the challenge's own example, a fixed string delivers seventy amp-hours. Bypass recovers {v['avg']:.2f} per "
                 f"cell, {v['gain'] * 100:.0f} percent more."),
        dict(card=("Prove it on today's batteries.", "Build it into tomorrow's."),
             say="Prove it on today's batteries, then build it into tomorrow's. Thank you."),
    ]


def card(title: str, sub: str, path: Path) -> None:
    im = Image.new("RGB", (W, H), ACCENT)
    d = ImageDraw.Draw(im)
    f1, f2 = ImageFont.truetype(FONT_B, 92), ImageFont.truetype(FONT, 52)
    for text, font, y, col in ((title, f1, H // 2 - 90, (255, 255, 255)), (sub, f2, H // 2 + 40, (156, 219, 192))):
        w = d.textlength(text, font=font)
        d.text(((W - w) / 2, y), text, font=font, fill=col)
    im.save(path)


def fit(src: Path, path: Path) -> None:
    """Place a screenshot on a 1920x1080 canvas, scaled to fit with margins."""
    im = Image.open(src).convert("RGB")
    s = min((W - 120) / im.width, (H - 100) / im.height, 1.6)
    im = im.resize((int(im.width * s), int(im.height * s)), Image.LANCZOS)
    bg = Image.new("RGB", (W, H), BG)
    bg.paste(im, ((W - im.width) // 2, (H - im.height) // 2))
    bg.save(path)


def capture(url: str, sc: list[dict]) -> None:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME, headless=True)
        pg = b.new_page(viewport={"width": 1100, "height": 760}, device_scale_factor=2)
        for i, s in enumerate(sc):
            out = TMP / f"s{i:02d}.png"
            if "card" in s:
                card(*s["card"], out)
                continue
            pg.goto(url + s["page"], wait_until="networkidle")
            pg.wait_for_timeout(1200)
            raw = TMP / f"raw{i:02d}.png"
            if s["find"] is None:
                pg.screenshot(path=str(raw))
            else:
                el = pg.get_by_text(s["find"], exact=False).first
                box = el.locator("xpath=ancestor-or-self::section[1]")
                if s.get("parent"):
                    box = box.locator("xpath=..")
                box.scroll_into_view_if_needed()
                pg.wait_for_timeout(300)
                if s.get("part"):
                    bb = box.bounding_box()                       # viewport coordinates
                    sy = pg.evaluate("window.scrollY")
                    half = bb["height"] * (0.695 if s["part"] == "top" else 0.46)
                    top = bb["y"] + sy if s["part"] == "top" else bb["y"] + sy + bb["height"] - half
                    pg.screenshot(path=str(raw), clip=dict(x=bb["x"], y=top, width=bb["width"], height=half), full_page=True)
                else:
                    box.screenshot(path=str(raw))
            fit(raw, out)
        b.close()


def voice(text: str, path: Path, voice_name: str, rate: int = 0) -> float:
    aiff = path.with_suffix(".aiff")
    cmd = ["say", "-v", voice_name] + (["-r", str(rate)] if rate else []) + ["-o", str(aiff), text]
    subprocess.run(cmd, check=True)
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    subprocess.run([ff, "-y", "-loglevel", "error", "-i", str(aiff), "-ar", "48000", "-ac", "2", str(path)], check=True)
    out = subprocess.run([ff, "-i", str(path)], capture_output=True, text=True).stderr
    hh, mm, ss = out.split("Duration: ")[1].split(",")[0].split(":")
    return int(hh) * 3600 + int(mm) * 60 + float(ss)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:3000")
    ap.add_argument("--voice", default="Ava (Premium)")
    ap.add_argument("--rate", type=int, default=200, help="say rate; 200 gives about 156 spoken wpm with Ava (Premium), 0 = natural pace")
    a = ap.parse_args()
    TMP.mkdir(parents=True, exist_ok=True)
    sc = scenes(data())
    capture(a.url, sc)
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    parts = []
    for i, s in enumerate(sc):
        wav = TMP / f"s{i:02d}.wav"
        dur = voice(s["say"], wav, a.voice, a.rate) + 0.4
        mp4 = TMP / f"s{i:02d}.mp4"
        subprocess.run([ff, "-y", "-loglevel", "error", "-loop", "1", "-i", str(TMP / f"s{i:02d}.png"), "-i", str(wav),
                        "-filter_complex", f"[0:v]scale={W}:{H},fade=t=in:st=0:d=0.4,fade=t=out:st={dur - 0.4:.2f}:d=0.4,format=yuv420p[v];"
                                           f"[1:a]apad,atrim=0:{dur:.2f}[a]",
                        "-map", "[v]", "-map", "[a]", "-t", f"{dur:.2f}", "-r", "30", "-c:v", "libx264", "-preset", "medium",
                        "-crf", "20", "-c:a", "aac", "-b:a", "160k", str(mp4)], check=True)
        parts.append(mp4)
    lst = TMP / "list.txt"
    lst.write_text("".join(f"file '{p.name}'\n" for p in parts))
    final = OUT / "PeakSure_proposal_and_method.mp4"
    subprocess.run([ff, "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(final)], check=True)
    (OUT / "script.md").write_text("# Narration\n\n" + "\n\n".join(f"{i + 1}. {s['say']}" for i, s in enumerate(sc)) + "\n")
    print(f"wrote {final}")


if __name__ == "__main__":
    main()
