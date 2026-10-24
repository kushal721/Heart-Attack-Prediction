"""Web server for the heart disease risk model: a JSON API plus the static front end in web/.

Usage: python server.py   (then open http://localhost:8000)
"""

from __future__ import annotations

import random

import joblib
import numpy as np
import pandas as pd
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from heart_model import (
    BINARY,
    CATEGORICAL,
    CODE_LABELS,
    FEATURE_NAMES,
    FEATURES,
    MODEL_PATH,
    NUMERIC,
    ROOT,
    TARGET,
    estimate,
    load_data,
    train,
)

WEB_DIR = ROOT / "web"

# Risk bands shown in the UI. 0.5 is the classification threshold.
BANDS = [(0.3, "low"), (0.6, "moderate"), (1.01, "high")]

FIELD_UNITS = {
    "age": "years",
    "trestbps": "mm Hg",
    "chol": "mg/dl",
    "thalach": "bpm",
    "oldpeak": "mm",
    "ca": "vessels",
}
FIELD_HELP = {
    "cp": "Type of chest pain reported by the patient.",
    "restecg": "Resting electrocardiogram result.",
    "oldpeak": "ST depression induced by exercise relative to rest.",
    "slope": "Slope of the ST segment at peak exercise.",
    "ca": "Number of major vessels (0 to 3) coloured by fluoroscopy.",
    "thal": "Result of the thallium stress test.",
}
FIELD_STEP = {"oldpeak": 0.1}


def load_bundle() -> dict:
    if MODEL_PATH.exists():
        bundle = joblib.load(MODEL_PATH)
        if "test_index" in bundle:
            return bundle
    bundle = train(verbose=False)
    MODEL_PATH.parent.mkdir(exist_ok=True)
    joblib.dump(bundle, MODEL_PATH)
    return bundle


bundle = load_bundle()
model = bundle["model"]
data = load_data()
test_patients = data.loc[bundle["test_index"]]
# Unknown values are filled in from these patients, so test patients never leak in.
reference_patients = data.drop(index=bundle["test_index"])
importance_rank = {row["feature"]: i for i, row in enumerate(bundle["importance"])}

app = FastAPI(title="Heart Disease Risk")


class Patient(BaseModel):
    """Any field may be left out (or null) when it is unknown."""

    age: float | None = Field(None, ge=1, le=120)
    sex: int | None = Field(None, ge=0, le=1)
    cp: int | None = Field(None, ge=0, le=3)
    trestbps: float | None = Field(None, ge=50, le=260)
    chol: float | None = Field(None, ge=50, le=700)
    fbs: int | None = Field(None, ge=0, le=1)
    restecg: int | None = Field(None, ge=0, le=2)
    thalach: float | None = Field(None, ge=40, le=250)
    exang: int | None = Field(None, ge=0, le=1)
    oldpeak: float | None = Field(None, ge=0, le=10)
    slope: int | None = Field(None, ge=0, le=2)
    ca: float | None = Field(None, ge=0, le=3)
    thal: int | None = Field(None, ge=1, le=3)


def risk_band(prob: float) -> str:
    return next(name for limit, name in BANDS if prob < limit)


def display_value(feature: str, value) -> str:
    if feature in CODE_LABELS:
        return CODE_LABELS[feature][int(value)]
    if feature not in FIELD_STEP:
        value = round(value)
    unit = FIELD_UNITS.get(feature, "")
    if feature == "ca" and value == 1:
        unit = "vessel"
    return f"{value:g} {unit}".strip()


def field_spec(feature: str) -> dict:
    spec = {"name": feature, "label": FEATURE_NAMES[feature], "help": FIELD_HELP.get(feature)}
    if feature in CODE_LABELS:
        spec["kind"] = "choice"
        spec["options"] = [{"value": k, "label": v} for k, v in CODE_LABELS[feature].items()]
        spec["default"] = bundle["baseline"][feature]
    elif feature == "ca":
        spec["kind"] = "choice"
        spec["options"] = [{"value": k, "label": str(k)} for k in range(4)]
        spec["default"] = int(bundle["baseline"]["ca"])
    else:
        col = data[feature]
        spec.update({
            "kind": "number",
            "unit": FIELD_UNITS.get(feature, ""),
            "min": float(np.floor(col.min() * 0.8)),
            "max": float(np.ceil(col.max() * 1.15)),
            "step": FIELD_STEP.get(feature, 1),
            "default": round(float(col.median()), 1) if feature in FIELD_STEP else round(float(col.median())),
        })
    return spec


def patient_record(row: pd.Series) -> dict:
    patient = {}
    for f in FEATURES:
        value = row[f]
        if pd.isna(value):  # placeholder-missing values: use the typical value
            value = bundle["baseline"][f]
        patient[f] = int(value) if f in BINARY + CATEGORICAL else float(value)
    return patient


def nice_edges(values: pd.Series, target_bins: int = 16) -> np.ndarray:
    """Bin edges on round numbers (e.g. every 3 years or 20 mg/dl) so axis labels read cleanly."""
    lo, hi = float(values.min()), float(values.max())
    raw = (hi - lo) / target_bins
    mag = 10 ** np.floor(np.log10(raw))
    step = next(m * mag for m in (1, 2, 2.5, 3, 5, 10) if m * mag >= raw)
    start = np.floor(lo / step) * step
    count = int(np.floor((hi - start) / step)) + 1
    return np.round(start + step * np.arange(count + 1), 6)


@app.get("/api/meta")
def meta() -> dict:
    groups = [
        {"title": "Patient", "fields": ["age", "sex", "trestbps", "chol", "fbs"]},
        {"title": "Symptoms and ECG", "fields": ["cp", "exang", "restecg"]},
        {"title": "Stress test and imaging", "fields": ["thalach", "oldpeak", "slope", "ca", "thal"]},
    ]
    return {
        "model_name": bundle["model_name"],
        "best_params": {k.removeprefix("model__"): v for k, v in bundle["best_params"].items()},
        "n_patients": bundle["n_patients"],
        "n_train": bundle["n_train"],
        "n_test": bundle["n_test"],
        "class_balance": {str(k): int(v) for k, v in bundle["class_balance"].items()},
        "fields": {f: field_spec(f) for f in FEATURES},
        "groups": groups,
        "bands": [{"upto": limit, "name": name} for limit, name in BANDS],
        "metrics": bundle["test_metrics"],
        "comparison": bundle["comparison"],
        "importance": [
            {**row, "label": FEATURE_NAMES[row["feature"]]} for row in bundle["importance"]
        ],
    }


@app.post("/api/predict")
def predict(patient: Patient) -> dict:
    known = {k: v for k, v in patient.model_dump().items() if v is not None}
    result = estimate(model, known, reference_patients)
    prob = result["probability"]
    drivers = [
        {
            "feature": row.feature,
            "label": FEATURE_NAMES[row.feature],
            "value": display_value(row.feature, known[row.feature]),
            "effect": float(row.effect),
        }
        for row in result["drivers"].itertuples()
        if abs(row.effect) >= 0.005
    ][:8]
    unknown = sorted((f for f in FEATURES if f not in known), key=importance_rank.get)
    return {
        "probability": prob,
        "low": result["low"],
        "high": result["high"],
        "band": risk_band(prob),
        "prediction": int(prob >= 0.5),
        "drivers": drivers,
        # Unknown fields, most influential first: filling in the first ones narrows the range most.
        "unknown": [{"feature": f, "label": FEATURE_NAMES[f]} for f in unknown],
    }


@app.get("/api/demo-patient")
def demo_patient(outcome: int | None = None, exclude: int | None = None) -> dict:
    """A real patient from the held-out test set, which the model never trained on."""
    pool = test_patients
    if outcome in (0, 1):
        pool = pool[pool[TARGET] == outcome]
    if exclude is not None and len(pool) > 1:
        pool = pool.drop(index=exclude, errors="ignore")
    idx = random.choice(pool.index.tolist())
    row = data.loc[idx]
    return {
        "id": int(idx),
        "patient": patient_record(row),
        "outcome": int(row[TARGET]),
        "pool_size": len(test_patients),
    }


@app.get("/api/explore/{feature}")
def explore(feature: str) -> dict:
    if feature not in FEATURES:
        raise HTTPException(404, f"Unknown feature {feature!r}")
    col, outcome = data[feature], data[TARGET]

    if feature in NUMERIC and feature != "ca":
        edges = nice_edges(col.dropna())
        series = {}
        for value in (0, 1):
            counts, _ = np.histogram(col[outcome == value].dropna(), bins=edges)
            series[str(value)] = counts.tolist()
        return {"kind": "histogram", "label": FEATURE_NAMES[feature],
                "unit": FIELD_UNITS.get(feature, ""), "edges": edges.tolist(), "series": series}

    labels = CODE_LABELS.get(feature, {k: str(k) for k in range(4)})
    groups = []
    for code, label in labels.items():
        mask = col == code
        n = int(mask.sum())
        if n:
            disease = int(outcome[mask].sum())
            groups.append({"label": label, "n": n, "disease": disease, "rate": disease / n})
    missing = col.isna()
    if missing.any():
        disease = int(outcome[missing].sum())
        groups.append({"label": "Not recorded", "n": int(missing.sum()), "disease": disease,
                       "rate": disease / int(missing.sum())})
    return {"kind": "rate", "label": FEATURE_NAMES[feature], "groups": groups,
            "overall_rate": float(outcome.mean())}


app.mount("/static", StaticFiles(directory=WEB_DIR), name="static")


@app.get("/")
def index() -> FileResponse:
    return FileResponse(WEB_DIR / "index.html")


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
