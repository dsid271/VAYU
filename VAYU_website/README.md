# VAYU website

This folder contains the Next.js frontend for VAYU.

## What it does
- shows the main AQI dashboard experience
- displays forecast values returned by the backend `/predict` endpoint
- renders a chart for observed versus predicted AQI values

## Local development
```bash
cd VAYU_website
npm install
npm run dev
```

## Environment variable
Set the prediction backend URL before running the app:
```bash
NEXT_PUBLIC_AQI_PREDICTION_URL=http://localhost:8000
```

## Current implementation notes
- the frontend is designed to call the backend prediction API directly
- it expects the backend to return predictions with `timestamp` and `aqi` fields
- the app is built to be easy to run, test, and iterate on

## Contributor notes
If you are working on the UI, keep the API contract stable and verify that the frontend still renders the returned forecast values correctly when the backend changes.
