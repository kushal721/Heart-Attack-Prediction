# Heart Disease Prediction

Predicts the probability that a patient has heart disease from 13 clinical measurements,
using the UCI Cleveland heart disease dataset. Includes a web app with live risk assessment,
a real-patient demo, a model performance report and a data explorer.

## Quick start

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python train.py          # trains and saves models/heart_model.joblib (~30 s)
python server.py         # serves the UI at http://localhost:8000
```

If no saved model exists, the server trains one on first launch.

## The app

- **Assess a patient.** All 13 inputs fit beside the result on a laptop screen, so the
  estimate stays in view while you type. A risk scale shows where the patient sits against
  the 50% decision threshold, and a chart shows how much each entered value moves the estimate
  compared with leaving it unknown. Help for clinical terms is in the info tooltips.
- **Partial information.** Leave any field blank or set it to Unknown. The unknown values
  are filled in from the 60 most similar training patients, and the result shows the average
  estimate plus a likely range (10th to 90th percentile), and which missing values would
  narrow it most. Fewer known values means a wider range and a less reliable estimate:

  | Known values | Test accuracy | Test ROC-AUC | Typical range width |
  |---|---|---|---|
  | All 13 | 86.9% | 0.937 | none |
  | All except thallium and vessels | 82.0% | 0.885 | 32 points |
  | No stress test or imaging | 77.0% | 0.806 | 58 points |
  | Age, sex, blood pressure, cholesterol | 59.0% | 0.649 | 71 points |
- **Real demo.** Loads an actual patient from the 61 held-out test patients (random, with
  heart disease, or without), whom the model never saw during training, and shows whether the
  model's call matches the recorded outcome. The model gets about 13% of these wrong, and the
  demo shows those misses as well.
- **How well it works.** Test-set accuracy, recall, precision, F1, ROC-AUC, the confusion
  matrix, an interactive ROC curve, the four-model comparison and feature importance.
- **Explore the study data.** Each measurement split by outcome, with a table view.

The front end is plain HTML, CSS and JavaScript in `web/` with hand-drawn SVG charts and
icons, and no build step. Fonts (Instrument Serif and Manrope) are bundled in `web/fonts`
so the app works offline.

## Project layout

| Path | Purpose |
|---|---|
| `heart_model.py` | Data cleaning, code meanings, preprocessing pipeline, model selection, explanations |
| `train.py` | Command-line training that saves the model bundle |
| `server.py` | FastAPI server: JSON API (`/api/meta`, `/api/predict`, `/api/demo-patient`, `/api/explore/{feature}`) and the front end |
| `web/` | Front end: `index.html`, `styles.css`, `app.js`, bundled fonts |
| `Heart_attack_Pred.ipynb` | Walkthrough of the analysis, using the same code as the app |
| `data/heart.csv` | Raw data (1,125 rows, 302 unique patients) |
| `Documentation.pdf` | Original project write-up |

## Results (held-out test set, 61 patients)

| Model | CV ROC-AUC | Test ROC-AUC | Test accuracy |
|---|---|---|---|
| **Random Forest (selected)** | 0.901 | 0.937 | 0.869 |
| Logistic Regression | 0.900 | 0.947 | 0.869 |
| Gradient Boosting | 0.892 | 0.928 | 0.902 |
| Decision Tree | 0.822 | 0.845 | 0.803 |

The selected model's test recall (sensitivity) is 0.893. The model is chosen by cross-validated
ROC-AUC on the training set, and the test set is used only for reporting. The deployed model
is exactly the one that was scored, trained on the 241 training patients only, so the test
patients remain unseen for the demo. With 61 test patients, expect a few points of variation
in these figures.

## Data notes

The dataset is the Kaggle re-encoding of UCI Cleveland. Each column's value counts match the
UCI original, which shows the real meaning of every code:

- **`target` is inverted.** `target = 1` is the group *without* heart disease (164 patients,
  matching UCI's 164 healthy patients). This group is younger and has a higher max heart rate,
  less ST depression, less exercise-induced angina and fewer blocked vessels. The model predicts
  `disease = 1 - target`.
- **`cp`**: 0 asymptomatic, 1 atypical angina, 2 non-anginal pain, 3 typical angina.
- **`slope`**: 0 downsloping, 1 flat, 2 upsloping.
- **`thal`**: 1 fixed defect, 2 normal, 3 reversible defect. `0` means missing.
- **`restecg`**: 0 left ventricular hypertrophy, 1 normal, 2 ST-T wave abnormality.
- **`ca`**: `4` means missing.

Duplicate rows are removed before splitting so that the same patient can't appear in both
the training and the test set.

## Disclaimer

For education only. The dataset is small, single-center and dates from 1988. This is not a
medical device and must not be used for diagnosis.
