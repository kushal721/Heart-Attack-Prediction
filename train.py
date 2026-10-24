"""Train the heart disease model and save it for the app.

Usage: python train.py
"""

import joblib

from heart_model import MODEL_PATH, train


def main() -> None:
    bundle = train()
    MODEL_PATH.parent.mkdir(exist_ok=True)
    joblib.dump(bundle, MODEL_PATH)
    print(f"Saved model to {MODEL_PATH}")


if __name__ == "__main__":
    main()
