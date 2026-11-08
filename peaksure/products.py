"""REON product profiles, kept separate from the PeakSure modelled plant.

Every value carries one evidence status. Do not copy a value from one product to another: EBS
specifications are not CES specifications, and a patent describes an invention, not a product.

Sources checked 2026-11-07:
  H  https://reoncorp.com/hardware      (product names and headline ratings)
  S  https://reoncorp.com/solutions     (cell-level monitoring / bypass claims, not tied to a product)
  R  https://reoncorp.com/              ("2-3X More Usable Capacity")
  P  https://patents.google.com/patent/US20230341471A1/en  (pending application, Reon Technology Inc)
  T  REON statement to the team: "CES and OES are white label product from other vendors. EBS (Energy
     Block System) is the one equipped with our cell-level control BMS."
  W  REON_WHO_WE_ARE.pdf / challenge brief as transcribed in the Addendum (PDFs not in the repo, not re-checked)
"""

from __future__ import annotations

from dataclasses import dataclass, field

CONFIRMED = "CONFIRMED"
REON_CLAIM = "REON CLAIM"
DERIVED = "DERIVED"
LITERATURE = "LITERATURE"
ASSUMED = "ASSUMED"
UNKNOWN = "UNKNOWN"
MODEL_OUTPUT = "MODEL OUTPUT"
STATUSES = (CONFIRMED, REON_CLAIM, DERIVED, LITERATURE, ASSUMED, UNKNOWN, MODEL_OUTPUT)

CHECKED = "2026-11-08"
SOURCES = {
    "H": "https://reoncorp.com/hardware",
    "S": "https://reoncorp.com/solutions",
    "R": "https://reoncorp.com/",
    "P": "https://patents.google.com/patent/US20230341471A1/en",
    "T": "REON statement to the PeakSure team (hackathon channel)",
    "W": "REON_WHO_WE_ARE.pdf as transcribed in PeakSure-Science-Addendum §AA (PDF not in repo)",
}

# Parameters every profile must state (UNKNOWN when nothing reliable was found).
PARAMS = ("rated_power_kw", "rated_energy_kwh", "energy_basis", "ac_interface", "dc_window_v", "chemistry",
          "cell_format", "cells_per_string", "parallel_columns", "n_min", "switch_r_on", "round_trip_eff",
          "cell_level_bypass")


@dataclass(frozen=True)
class Spec:
    value: object
    status: str
    source: str = ""
    note: str = ""

    def __post_init__(self):
        if self.status not in STATUSES:
            raise ValueError(f"bad status {self.status}")
        if self.status in (CONFIRMED, REON_CLAIM, LITERATURE) and not self.source:
            raise ValueError("sourced statuses need a source")
        if self.status == DERIVED and not self.note:
            raise ValueError("DERIVED values must state the calculation")


@dataclass(frozen=True)
class Product:
    key: str
    name: str
    role: str
    specs: dict = field(default_factory=dict)

    def get(self, p: str) -> Spec:
        return self.specs.get(p, Spec(None, UNKNOWN, note="not published"))


U = lambda note="not published": Spec(None, UNKNOWN, note=note)  # noqa: E731

CES = Product("CES", "REON CESS (Container Energy Storage System)",
              "White-label container from another vendor (T). Not the product with REON's cell-level BMS.", {
    "rated_power_kw": Spec(2500, CONFIRMED, "H", "\"CESS | 2.5MW/5MWh\""),
    "rated_energy_kwh": Spec(5000, CONFIRMED, "H", "\"CESS | 2.5MW/5MWh\"; the PDF says \"up to\" (W)"),
    "energy_basis": U("not stated whether nameplate DC, usable, or AC"),
    "ac_interface": Spec("480 V, three-phase", REON_CLAIM, "W", "only in the PDF as transcribed; not on the website"),
    "dc_window_v": U(), "chemistry": U(), "cell_format": U(), "cells_per_string": U(),
    "parallel_columns": U(), "n_min": U(), "switch_r_on": U(), "round_trip_eff": U(),
    "cell_level_bypass": Spec(False, CONFIRMED, "T", "REON: CES is white-label; cell-level control is in EBS"),
})

EBS_NA = Product("EBS_NA", "REON EBS Na+ (Energy Block System, sodium-ion)",
                 "REON's product with the cell-level control BMS (T).", {
    "rated_power_kw": Spec(30, DERIVED, "H", "page heading \"EBS | 30kW/60kWh\" covers the EBS line, above the Na+/Li+ tabs; "
                           "assigned to Na+ because Li+ claims >2x energy in the same form factor. AC/DC side not stated"),
    "rated_energy_kwh": Spec(60, DERIVED, "H", "same heading; Na+ assignment as above. Rated vs usable not stated"),
    "nominal_ratio_h": Spec(2.0, DERIVED, note="60 kWh / 30 kW; nominal ratio, not a guaranteed AC discharge duration"),
    "energy_basis": U("rated vs usable, AC vs DC not stated"),
    "ac_interface": U(), "dc_window_v": U(),
    "chemistry": Spec("sodium-ion", CONFIRMED, "H"),
    "cell_format": U(),
    "cells_per_string": Spec(120, DERIVED, "", "≈ 60 kWh / (3.1 V × 160 Ah); the 160 Ah cell is ASSUMED from another vendor"),
    "parallel_columns": U(), "n_min": U(), "switch_r_on": U(), "round_trip_eff": U(),
    "cell_level_bypass": Spec(True, REON_CLAIM, "S", "\"bypass underperforming cells without shutting down\"; S names no product, T assigns it to EBS"),
    "cycle_life": Spec(20000, REON_CLAIM, "H", "\"20,000-Cycle Life\" (Na+ tab); no DoD, C-rate, temperature or end-of-life definition"),
    "operating_temp": Spec("-40 °F to +140 °F", REON_CLAIM, "H", "\"Reliable operation\" (Na+ tab); no charge vs discharge limits or power derating given"),
    "application": Spec("commercial and industrial", CONFIRMED, "H", "\"designed for commercial and industrial applications\" (EBS line text)"),
})

EBS_LI = Product("EBS_LI", "REON EBS Li+ (Energy Block System, lithium)",
                 "Lithium variant of EBS; cell-level control assumed same as EBS line (T).", {
    "rated_power_kw": U("Li+ not separately rated; the 30 kW line heading is not assigned to Li+"),
    "rated_energy_kwh": Spec("more than twice the energy in the same form factor", REON_CLAIM, "H",
                             "no base product, conditions or kWh stated; not converted to a model input"),
    "energy_basis": U(), "ac_interface": U(), "dc_window_v": U(),
    "chemistry": Spec("lithium (LFP/NMC not stated)", CONFIRMED, "H"),
    "application": Spec("commercial and industrial", CONFIRMED, "H", "EBS line text; Li+ tab: \"sites with high consumption peaks and limited space\" (REON CLAIM)"),
    "cell_format": U(), "cells_per_string": U(), "parallel_columns": U(), "n_min": U(),
    "switch_r_on": U(), "round_trip_eff": U(),
    "cell_level_bypass": Spec(True, REON_CLAIM, "S", "as for the EBS line"),
})

# The plant PeakSure actually simulates. These are model inputs, NOT REON specifications.
MODEL_PLANT = Product("MODEL", "PeakSure modelled plant (A: conventional; B/C: REON-style bypass)",
                      "Comparison plant for MLP coincident-peak shaving in ISO-NE (project use case).", {
    "rated_power_kw": Spec(2500, ASSUMED, note="comparison size chosen to match the published CESS rating; for B/C ≈ 84 EBS blocks (2500/30), interconnection unknown"),
    "rated_energy_kwh": Spec(5000, ASSUMED, note="treated as DC nameplate; 2.5 MWh (1 h) and 10 MWh (4 h) are hypothetical scenarios"),
    "energy_basis": Spec("DC nameplate; deliverable energy computed at AC after η and switch loss", ASSUMED),
    "nominal_ratio_h": Spec(2.0, DERIVED, note="5000 kWh / 2500 kW; a nominal ratio, not a guaranteed AC discharge duration"),
    "ac_interface": U("not modelled"),
    "dc_window_v": Spec("N_min × cell voltage ≥ DC floor", ASSUMED, note="DC floor enters only via N_min (10% headroom)"),
    "chemistry": Spec("sodium-ion (TUM ageing fit), 3.1 V nominal", LITERATURE, "TUM tables, Addendum §AH", "matches EBS Na+; CES chemistry UNKNOWN"),
    "cell_format": U("not modelled"),
    "cells_per_string": Spec(240, ASSUMED, note="conflicts with ≈120 cells per EBS block (DERIVED); topology unknown"),
    "parallel_columns": Spec(8, ASSUMED),
    "n_min": Spec(216, DERIVED, note="240 × (1 − 0.10 headroom); headroom ASSUMED"),
    "switch_r_on": Spec("≈ 80 µΩ per cell path", DERIVED, note="switch loss 1% (ASSUMED) × 3.1 V / ≈ 420 A string current"),
    "round_trip_eff": Spec(0.96, ASSUMED, note="one-way inverter/conversion efficiency η used for discharge"),
    "cell_level_bypass": Spec("A: no; B/C: yes", ASSUMED, note="B/C bypass logic is PeakSure's model of REON-style control"),
})

PRODUCTS = {p.key: p for p in (CES, EBS_NA, EBS_LI)}

EBS_USE_CASE = {
    "modelled": "One 30 kW / 60 kWh EBS-size block (Na+) reduces a commercial facility's monthly demand peak (demand charge)",
    "status": ASSUMED,
    "note": "PeakSure simulation scenario (peaksure/ebs_scenario.py); not a verified EBS deployment or REON operating profile. "
            "REON's EMS lists 'Peak Shaving & Demand Management' (REON CLAIM, https://reoncorp.com/solutions); EBS is for C&I (CONFIRMED).",
    "not_modelled": ["time-of-use optimisation", "demand response", "VPP", "backup", "facility peak-timing uncertainty"],
}

USE_CASE = {
    "modelled": "MLP coincident-peak shaving in ISO-NE (monthly RNS transmission peak + annual FCA capacity peak)",
    "status": ASSUMED,
    "note": "Project's modelled use case; not evidence that any REON CES/EBS is deployed for it.",
    "not_modelled": ["demand response", "ConnectedSolutions / Clean Peak", "energy arbitrage",
                     "backup / resilience", "VPP / time-of-use optimisation"],
}


def as_dict() -> dict:
    enc = lambda p: {"key": p.key, "name": p.name, "role": p.role,  # noqa: E731
                     "specs": {k: {"value": s.value, "status": s.status, "source": SOURCES.get(s.source, s.source),
                                   "note": s.note} for k, s in {**{q: p.get(q) for q in PARAMS}, **p.specs}.items()}}
    return {"checked": CHECKED, "statuses": list(STATUSES), "sources": SOURCES, "use_case": USE_CASE, "ebs_use_case": EBS_USE_CASE,
            "products": [enc(p) for p in PRODUCTS.values()], "model": enc(MODEL_PLANT)}
