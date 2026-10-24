"""Shared data loading, feature definitions and model training for heart disease prediction.

The dataset is the Kaggle re-encoding of the UCI Cleveland heart disease data
(303 patients). Its value counts match the UCI original one-to-one, which tells
us what each code really means. Two things differ from what the Kaggle
description (and the original notebook) assumed:

* ``target`` is inverted: ``target == 1`` is the 164-patient group that UCI
  labels as *no disease* (num == 0). Those patients are younger, reach a higher
  max heart rate, have less ST depression, less exercise-induced angina and
  fewer blocked vessels. We therefore model ``disease = 1 - target``.
* ``cp``, ``slope``, ``thal`` and ``restecg`` use a different code order than
  the UCI documentation, and ``ca == 4`` / ``thal == 0`` are placeholders for
  values that were missing in the original data.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
    roc_curve,
)
from sklearn.model_selection import GridSearchCV, StratifiedKFold, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.tree import DecisionTreeClassifier

ROOT = Path(__file__).resolve().parent
DATA_PATH = ROOT / "data" / "heart.csv"
MODEL_PATH = ROOT / "models" / "heart_model.joblib"

RANDOM_STATE = 42
TARGET = "disease"

NUMERIC = ["age", "trestbps", "chol", "thalach", "oldpeak", "ca"]
BINARY = ["sex", "fbs", "exang"]
CATEGORICAL = ["cp", "restecg", "slope", "thal"]
FEATURES = NUMERIC + BINARY + CATEGORICAL

# Code -> meaning, derived by matching value counts against the UCI original.
CODE_LABELS = {
    "sex": {0: "Female", 1: "Male"},
    "fbs": {0: "No (≤ 120 mg/dl)", 1: "Yes (> 120 mg/dl)"},
    "exang": {0: "No", 1: "Yes"},
    "cp": {0: "Asymptomatic", 1: "Atypical angina", 2: "Non-anginal pain", 3: "Typical angina"},
    "restecg": {0: "Left ventricular hypertrophy", 1: "Normal", 2: "ST-T wave abnormality"},
    "slope": {0: "Downsloping", 1: "Flat", 2: "Upsloping"},
    "thal": {1: "Fixed defect", 2: "Normal", 3: "Reversible defect"},
}

FEATURE_NAMES = {
    "age": "Age",
    "sex": "Sex",
    "cp": "Chest pain type",
    "trestbps": "Resting blood pressure",
    "chol": "Serum cholesterol",
    "fbs": "Fasting blood sugar > 120",
    "restecg": "Resting ECG",
    "thalach": "Max heart rate",
    "exang": "Exercise-induced angina",
    "oldpeak": "ST depression (oldpeak)",
    "slope": "ST slope",
    "ca": "Major vessels (fluoroscopy)",
    "thal": "Thallium stress test",
}


def load_data(path: Path = DATA_PATH) -> pd.DataFrame:
    """Load and clean the raw CSV into one row per unique patient.

    The file holds 1,125 rows but only 302 unique patients: every patient is
    repeated, and a few copies have a value blanked out. Dropping incomplete
    copies and then exact duplicates leaves each patient exactly once, which
    keeps copies of the same patient from landing in both train and test.
    """
    raw = pd.read_csv(path)
    df = raw.dropna().drop_duplicates().reset_index(drop=True)
    df = df.astype({c: int for c in BINARY + CATEGORICAL + ["ca", "target"]})

    df[TARGET] = 1 - df.pop("target")
    # Placeholders for values that were missing in the UCI source; imputed in the pipeline.
    df["ca"] = df["ca"].where(df["ca"] != 4).astype(float)
    df["thal"] = df["thal"].where(df["thal"] != 0)
    return df


def build_preprocessor() -> ColumnTransformer:
    numeric = Pipeline([
        ("impute", SimpleImputer(strategy="median")),
        ("scale", StandardScaler()),
    ])
    categorical = Pipeline([
        ("impute", SimpleImputer(strategy="most_frequent")),
        ("onehot", OneHotEncoder(handle_unknown="ignore")),
    ])
    return ColumnTransformer([
        ("num", numeric, NUMERIC + BINARY),
        ("cat", categorical, CATEGORICAL),
    ])


def candidate_models() -> dict[str, tuple[object, dict]]:
    """Model name -> (estimator, hyperparameter grid)."""
    return {
        "Logistic Regression": (
            LogisticRegression(max_iter=2000),
            {"C": [0.01, 0.03, 0.1, 0.3, 1, 3]},
        ),
        "Random Forest": (
            RandomForestClassifier(n_estimators=300, random_state=RANDOM_STATE),
            {"max_depth": [None, 4, 6], "min_samples_leaf": [1, 3, 5], "max_features": ["sqrt", 0.5]},
        ),
        "Gradient Boosting": (
            GradientBoostingClassifier(random_state=RANDOM_STATE),
            {"n_estimators": [100, 200], "learning_rate": [0.03, 0.1], "max_depth": [2, 3]},
        ),
        "Decision Tree": (
            DecisionTreeClassifier(random_state=RANDOM_STATE),
            {"criterion": ["gini", "entropy"], "max_depth": [2, 3, 4, 5], "min_samples_leaf": [1, 5, 10]},
        ),
    }


def evaluate(model, X: pd.DataFrame, y: pd.Series) -> dict:
    proba = model.predict_proba(X)[:, 1]
    pred = (proba >= 0.5).astype(int)
    fpr, tpr, _ = roc_curve(y, proba)
    return {
        "accuracy": accuracy_score(y, pred),
        "precision": precision_score(y, pred),
        "recall": recall_score(y, pred),
        "f1": f1_score(y, pred),
        "roc_auc": roc_auc_score(y, proba),
        "confusion_matrix": confusion_matrix(y, pred).tolist(),
        "roc_curve": {"fpr": fpr.tolist(), "tpr": tpr.tolist()},
    }


def train(df: pd.DataFrame | None = None, verbose: bool = True) -> dict:
    """Tune every candidate with cross-validation, pick the best by ROC-AUC,
    and score it once on the held-out test set.

    Returns a bundle with the deployable pipeline and everything the UI shows.
    """
    df = load_data() if df is None else df
    X, y = df[FEATURES], df[TARGET]
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=RANDOM_STATE
    )
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)

    comparison = []
    searches = {}
    for name, (estimator, grid) in candidate_models().items():
        pipe = Pipeline([("prep", build_preprocessor()), ("model", estimator)])
        search = GridSearchCV(
            pipe,
            {f"model__{k}": v for k, v in grid.items()},
            scoring="roc_auc",
            cv=cv,
            n_jobs=-1,
        )
        search.fit(X_train, y_train)
        searches[name] = search
        best = search.best_index_
        test = evaluate(search.best_estimator_, X_test, y_test)
        comparison.append({
            "model": name,
            "cv_roc_auc": search.best_score_,
            "cv_roc_auc_std": search.cv_results_["std_test_score"][best],
            "test_roc_auc": test["roc_auc"],
            "test_accuracy": test["accuracy"],
            "test_recall": test["recall"],
            "best_params": {k.removeprefix("model__"): v for k, v in search.best_params_.items()},
        })
        if verbose:
            print(f"{name:<20} CV ROC-AUC {search.best_score_:.3f} ± "
                  f"{comparison[-1]['cv_roc_auc_std']:.3f}  |  test ROC-AUC {test['roc_auc']:.3f}  "
                  f"accuracy {test['accuracy']:.3f}")

    # Selection uses cross-validation on the training set only; the test set is just reported.
    chosen = max(comparison, key=lambda row: row["cv_roc_auc"])["model"]
    holdout_model = searches[chosen].best_estimator_
    test_metrics = evaluate(holdout_model, X_test, y_test)

    importance = permutation_importance(
        holdout_model, X_test, y_test, scoring="roc_auc", n_repeats=30, random_state=RANDOM_STATE
    )
    importances = sorted(
        zip(FEATURES, importance.importances_mean, importance.importances_std),
        key=lambda item: item[1],
        reverse=True,
    )

    if verbose:
        print(f"\nSelected: {chosen}  (test accuracy {test_metrics['accuracy']:.3f}, "
              f"recall {test_metrics['recall']:.3f}, ROC-AUC {test_metrics['roc_auc']:.3f})")

    # The deployed model is the one trained on the training split only, so the test
    # metrics describe it exactly and the test patients stay unseen for the demo.
    return {
        "model": holdout_model,
        "test_index": X_test.index.tolist(),
        "model_name": chosen,
        "best_params": searches[chosen].best_params_,
        "comparison": comparison,
        "test_metrics": test_metrics,
        "importance": [{"feature": f, "mean": m, "std": s} for f, m, s in importances],
        "baseline": baseline_patient(df),
        "n_train": len(X_train),
        "n_test": len(X_test),
        "n_patients": len(df),
        "class_balance": y.value_counts().sort_index().to_dict(),
    }


def baseline_patient(df: pd.DataFrame) -> dict:
    """Median / most common value of each feature, used as the reference point
    when explaining an individual prediction."""
    base = {c: float(df[c].median()) for c in NUMERIC}
    base.update({c: int(df[c].mode().iloc[0]) for c in BINARY + CATEGORICAL})
    return base


def complete_rows(known: dict, reference: pd.DataFrame, neighbours: int = 60) -> pd.DataFrame:
    """Plausible complete patients for a partly known one.

    Unknown values are borrowed from the ``neighbours`` reference patients most
    similar on the known values, so combinations stay realistic (an older
    patient tends to come with a lower max heart rate). With everything known
    this is the single patient; with nothing known it is every reference patient.
    """
    if len(known) == len(FEATURES):
        return pd.DataFrame([known])[FEATURES]
    pool = reference[FEATURES]
    if known:
        distance = np.zeros(len(pool))
        for feature, value in known.items():
            column = pool[feature]
            if feature in NUMERIC:
                gap = (column - value).abs() / reference[feature].std()
            else:
                gap = (column != value).astype(float)
            distance += gap.fillna(1).to_numpy() ** 2
        pool = pool.iloc[np.argsort(distance, kind="stable")[:neighbours]]
    rows = pool.copy()
    for feature, value in known.items():
        rows[feature] = value
    return rows.reset_index(drop=True)


def estimate(model, known: dict, reference: pd.DataFrame) -> dict:
    """Predicted probability for a patient whose values may be partly unknown.

    Returns the mean probability over plausible completions, a 10th to 90th
    percentile range showing how much the unknown values could matter, and the
    effect of each known value: how far the estimate moves because that value is
    known, compared with leaving it unknown.
    """
    rows = complete_rows(known, reference)
    probs = model.predict_proba(rows)[:, 1]
    prob = float(probs.mean())
    low, high = (float(v) for v in np.percentile(probs, [10, 90]))

    # One batched prediction for every "leave this value out" case keeps this fast
    # enough to run on every keystroke.
    features = [f for f in FEATURES if f in known]
    if features:
        frames = [complete_rows({k: v for k, v in known.items() if k != f}, reference) for f in features]
        without = model.predict_proba(pd.concat(frames, ignore_index=True))[:, 1]
        chunks = np.split(without, np.cumsum([len(frame) for frame in frames])[:-1])
        effects = prob - np.array([chunk.mean() for chunk in chunks])
    else:
        effects = []
    drivers = (
        pd.DataFrame({"feature": features, "effect": effects})
        .sort_values("effect", key=np.abs, ascending=False)
    )
    return {"probability": prob, "low": low, "high": high, "drivers": drivers, "n_rows": len(rows)}
