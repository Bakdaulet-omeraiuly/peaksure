"""Export the EBS C&I peak-shaving scenario (peaksure/ebs_scenario.py) to web/public/data/ebs_scenario.json.

Run: python tools/export_ebs_scenario.py   (about 1 minute)
"""
from __future__ import annotations

import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from peaksure.ebs_scenario import export  # noqa: E402


def main() -> None:
    path = ROOT / "web/public/data/ebs_scenario.json"
    path.write_text(json.dumps(export(), indent=1) + "\n")
    print(f"wrote {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
