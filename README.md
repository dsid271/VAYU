# VAYU

VAYU is an end-to-end AQI forecasting project with a FastAPI backend, a trained TensorFlow/Keras model, and a Next.js frontend.

## Project scope
- ingests AQI-related time-series data from Open-Meteo and Firebase-backed sources
- serves forecasts through a `/predict` endpoint
- renders forecast values in a web dashboard for demo and portfolio use

## Current implementation
- frontend calls the backend prediction endpoint
- backend builds a time-series input window, runs the saved model, and returns timestamped forecast values
- inference logic is implemented around the ratio-domain preprocessing used during training

## Repository layout
This repository root contains both the backend and the frontend as sibling folders.
- [hf-space-project](hf-space-project) — backend model serving and prediction logic
- [VAYU_website](VAYU_website) — frontend dashboard and chart UI
- [notebooks](notebooks) — training notebook and experimentation
- [cpp](cpp) — embedded firmware sketch

The frontend folder does not contain the backend source; the backend lives separately in [hf-space-project](hf-space-project).

## Getting started for contributors
If you want to run the project locally, the quickest path is:

1. Backend
   ```bash
   cd hf-space-project
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   uvicorn app:app --reload --host 0.0.0.0 --port 8000
   ```

2. Frontend
   ```bash
   cd VAYU_website
   npm install
   $env:NEXT_PUBLIC_AQI_PREDICTION_URL = "http://localhost:8000"
   npm run dev
   ```

3. Verify
   - backend: http://localhost:8000/docs
   - frontend: http://localhost:3000

## Backend
The backend lives in `hf-space-project/` and exposes `POST /predict`.

### Runtime notes
- loads a saved Keras model artifact from the repository
- prepares input data from Open-Meteo or Firebase data
- applies the ratio-space preprocessing used during training
- returns forecast values as a JSON payload for the frontend

### Environment
- Python 3.12
- TensorFlow 2.17.1
- NumPy < 2
- TKAN 0.4.3

### Run locally
```bash
cd hf-space-project
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

## Frontend
The frontend lives in `VAYU_website/`.

### Run locally
```bash
cd VAYU_website
npm install
npm run dev
```

### Environment variable
```bash
NEXT_PUBLIC_AQI_PREDICTION_URL=http://localhost:8000
```

## Status
The pipeline is wired end to end and can serve forecast values through the API and UI.

What is reasonably solid:
- API contract is in place
- model-loading path is wired up
- frontend can consume prediction results and render them in a chart
- inference logic is implemented around the ratio-domain approach used in training

What still needs caution:
- the system is not yet a fully validated production forecasting engine
- the multi-step recursive forecast path is implemented but should be treated as demo-level until it is tested more thoroughly
- live accuracy depends on the quality and freshness of the input data

## Technical notes
- the saved model artifact is a Keras file in `hf-space-project/`
- the serving logic is more involved than a basic one-step prediction because the training setup uses ratio-space preprocessing and inverse transformation
- the single-step inference path is the most mature part of the current implementation
