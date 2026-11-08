"""Export REON product profiles and the modelled plant (peaksure/products.py) to web/public/data/products.json."""
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from peaksure import products  # noqa: E402

out = pathlib.Path(__file__).resolve().parents[1] / "web/public/data/products.json"
out.write_text(json.dumps(products.as_dict(), indent=1, ensure_ascii=False) + "\n")
print(f"wrote {out}")
