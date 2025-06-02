
import os
os.environ["CUDA_VISIBLE_DEVICES"] = "-1"
os.environ['JAX_PLATFORMS'] = 'cpu'
os.environ['JAX_ENABLE_X64'] = 'True'
BACKEND = 'jax'
os.environ['KERAS_BACKEND'] = BACKEND

# app.py (or main.py)
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import numpy as np
import tensorflow as tf
from tensorflow.keras.models import load_model
from tensorflow.keras.layers import Input
from tensorflow.keras.utils import custom_object_scope
import pickle
import os
import requests
import pandas as pd
from datetime import datetime, timedelta, timezone
import pytz
import json
import traceback
import joblib
import jax

# Assuming TKAN is installed and available
from tkan import TKAN
try:
    from tkat import TKAT
except ImportError:
    print("TKAT library not found. If your model uses TKAT, ensure the library is installed.")
    TKAT = None

class MinMaxScaler:
    def __init__(self, feature_axis=None, minmax_range=(0, 1)):
        self.feature_axis = feature_axis
        self.min_ = None
        self.max_ = None
        self.scale_ = None
        self.minmax_range = minmax_range

    # Add a method to load attributes
    def load_attributes(self, attributes):
        self.min_ = np.array(attributes['min_']) if isinstance(attributes['min_'], list) else attributes['min_']
        self.max_ = np.array(attributes['max_']) if isinstance(attributes['max_'], list) else attributes['max_']
        self.scale_ = np.array(attributes['scale_']) if isinstance(attributes['scale_'], list) else attributes['scale_']
        self.minmax_range = tuple(attributes['minmax_range']) if isinstance(attributes['minmax_range'], list) else attributes['minmax_range']


    def fit(self, X):
        # ... (original fit method) ...
        if X.ndim == 3 and self.feature_axis is not None:
            axis = tuple(i for i in range(X.ndim) if i != self.feature_axis)
            self.min_ = np.min(X, axis=axis)
            self.max_ = np.max(X, axis=axis)
        elif X.ndim == 2:
            self.min_ = np.min(X, axis=0)
            self.max_ = np.max(X, axis=0)
        elif X.ndim == 1:
            self.min_ = np.min(X)
            self.max_ = np.max(X)
        else:
            raise ValueError("Data must be 1D, 2D, or 3D.")

        self.scale_ = self.max_ - self.min_
        return self

    def transform(self, X):
        if self.min_ is None or self.max_ is None or self.scale_ is None:
             # Handle the case where scaler wasn't fitted (though it should be if attributes loaded)
             # Or raise an error
             raise ValueError("Scaler attributes not loaded or scaler not fitted.")
        X_scaled = (X - self.min_) / self.scale_
        X_scaled = X_scaled * (self.minmax_range[1] - self.minmax_range[0]) + self.minmax_range[0]
        return X_scaled

    def inverse_transform(self, X_scaled):
        if self.min_ is None or self.max_ is None or self.scale_ is None:
             # Handle the case where scaler wasn't fitted
             raise ValueError("Scaler attributes not loaded or scaler not fitted.")
        X = (X_scaled - self.minmax_range[0]) / (self.minmax_range[1] - self.minmax_range[0])
        X = X * self.scale_ + self.min_
        return X

# --- AQI breakpoints and calculation functions (Copied from Notebook) ---
aqi_breakpoints = {
    'pm25': [(0, 50, 0, 50), (51, 100, 51, 100), (101, 200, 101, 200), (201, 300, 201, 300)],
    'pm10': [(0, 50, 0, 50), (51, 100, 51, 100), (101, 250, 101, 200), (251, 350, 201, 300)],
    'co': [(0, 1.0, 0, 50), (1.1, 2.0, 51, 100), (2.1, 10.0, 101, 200), (10.1, 17.0, 201, 300)]
}

def calculate_sub_aqi(concentration, breakpoints):
    for i_low, i_high, c_low, c_high in breakpoints:
        if c_low <= concentration <= c_high:
            if c_high == c_low:
                 return i_low
            return ((i_high - i_low) / (c_high - c_low)) * (concentration - c_low) + i_low
    if concentration < breakpoints[0][2]:
        return breakpoints[0][0]
    elif concentration > breakpoints[-1][3]:
        return breakpoints[-1][1]
    else:
        return np.nan

def calculate_overall_aqi(row, aqi_breakpoints):
    sub_aqis = []
    # Mapping API names to internal names if necessary
    pollutant_mapping = {
        'pm25': 'pm25',
        'pm10': 'pm10',
        'co': 'co',
        'pm2_5': 'pm25', # Common API name for PM2.5
        'carbon_monoxide': 'co', # Common API name for CO
    }
    for api_pollutant, internal_pollutant in pollutant_mapping.items():
        if api_pollutant in row:
            concentration = row[api_pollutant]
            if not pd.isna(concentration): # Use pd.isna for pandas DataFrames/Series
                sub_aqi = calculate_sub_aqi(concentration, aqi_breakpoints.get(internal_pollutant, []))
                sub_aqis.append(sub_aqi)
            else:
                sub_aqis.append(np.nan)
        else:
             sub_aqis.append(np.nan)

    if sub_aqis and not all(pd.isna(sub_aqis)):
        return np.nanmax(sub_aqis)
    else:
        return np.nan

# --- Data Retrieval Function ---
def get_latest_data_sequence(sequence_length: int, latitude: float, longitude: float):
    print(f"Attempting to retrieve data for the last {sequence_length} hours from Open-Meteo for Lat: {latitude}, Lon: {longitude}")

    current_utc_time = datetime.now(pytz.utc)
    print(f"Current UTC time on server for API calls: {current_utc_time.strftime('%Y-%m-%d %H:%M:%S UTC')}")
    print("IMPORTANT: If the server time above is incorrect (e.g., a future year), API data will be missing or invalid.")


    # Define a window to fetch from APIs, slightly larger than sequence_length to allow for finding complete data
    # e.g., if sequence_length is 24, fetch last 48 hours to have a good buffer
    api_fetch_past_hours = sequence_length + 24 # Fetch a wider window, e.g., 48 hours for a 24-hour sequence
    
    # This window will be used to filter the processed data before dropna and tail
    processing_window_hours = sequence_length + 24 # e.g., 48 hours

    print(f"Requesting data for the past {api_fetch_past_hours} hours for air quality and temperature from APIs.")

    air_quality_url = "https://air-quality-api.open-meteo.com/v1/air-quality"
    air_quality_params = {
        "latitude": latitude,
        "longitude": longitude,
        "hourly": ["pm2_5", "pm10", "carbon_monoxide"],
        "timezone": "UTC",
        "past_hours": api_fetch_past_hours
    }
    # print(f"Air quality API params: {air_quality_params}")

    # Using forecast API for temperature as per user's finding that it works better
    weather_url = "https://api.open-meteo.com/v1/forecast" 
    weather_params = {
        "latitude": latitude,
        "longitude": longitude,
        "hourly": ["temperature_2m"],
        "timezone": "UTC",
        "past_hours": api_fetch_past_hours # Fetch same window for temperature
    }
    # print(f"Temperature API params: {weather_params}")

    try:
        print(f"Fetching air quality data from: {air_quality_url}")
        air_quality_response = requests.get(air_quality_url, params=air_quality_params)
        air_quality_response.raise_for_status()
        air_quality_data = air_quality_response.json()
        print("Air quality data retrieved.")

        print(f"Fetching temperature data from: {weather_url}")
        weather_response = requests.get(weather_url, params=weather_params)
        weather_response.raise_for_status()
        weather_data = weather_response.json()
        print("Temperature data retrieved.")

        print("Data fetched successfully from APIs.")

        if 'hourly' not in air_quality_data or 'time' not in air_quality_data['hourly']:
            print("Error: 'hourly' or 'time' key not found in air quality response.")
            return None, "Error: Invalid air quality data format from API."
        df_aq = pd.DataFrame(air_quality_data['hourly'])
        if df_aq.empty:
            print("Warning: Air quality data DataFrame is empty after fetching.")
        # Continue if not empty, but columns might be missing
        if not df_aq.empty and not all(col in df_aq.columns for col in ['time', 'pm2_5', 'pm10', 'carbon_monoxide']):
            print("Warning: Air quality data is missing some expected columns ('time', 'pm2_5', 'pm10', 'carbon_monoxide') after fetching.")
        if 'time' not in df_aq.columns and not df_aq.empty:
             return None, "Error: 'time' column missing in air quality data."
        if not df_aq.empty:
            df_aq['time'] = pd.to_datetime(df_aq['time'])
            df_aq.set_index('time', inplace=True)
        print(f"Processed df_aq. Shape: {df_aq.shape}. Columns: {df_aq.columns.tolist() if not df_aq.empty else 'N/A'}")

        if 'hourly' not in weather_data or 'time' not in weather_data['hourly']:
            print("Error: 'hourly' or 'time' key not found in weather response.")
            return None, "Error: Invalid weather data format from API."
        df_temp = pd.DataFrame(weather_data['hourly'])
        if df_temp.empty:
            print("Warning: Temperature data DataFrame is empty after fetching.")
        if not df_temp.empty and not all(col in df_temp.columns for col in ['time', 'temperature_2m']):
            print("Warning: Temperature data is missing some expected columns ('time', 'temperature_2m') after fetching.")
        if 'time' not in df_temp.columns and not df_temp.empty:
            return None, "Error: 'time' column missing in temperature data."
        if not df_temp.empty:
            df_temp['time'] = pd.to_datetime(df_temp['time'])
            df_temp.set_index('time', inplace=True)
        print(f"Processed df_temp. Shape: {df_temp.shape}. Columns: {df_temp.columns.tolist() if not df_temp.empty else 'N/A'}")
        
        if df_aq.empty or df_temp.empty:
            print("Error: One or both dataframes (AQ, Temp) are empty before merge. Cannot proceed.")
            return None, "Error: Insufficient data from APIs (AQ or Temp empty)."

        df_merged = df_aq.merge(df_temp, left_index=True, right_index=True, how='inner')
        print(f"DataFrames merged (inner). Initial merged shape: {df_merged.shape}")
        if df_merged.empty:
            print("Error: Inner merge of AQ and Temperature data resulted in an empty DataFrame. No overlapping timestamps with data.")
            return None, "Error: No overlapping AQ and Temperature data available for the period."

        # Resample to ensure consistent hourly frequency and fill missing data
        df_processed = df_merged.resample('h').mean() # Use mean for resampling to handle potential duplicates at same hour
        df_processed = df_processed.ffill().bfill() # Then fill
        print(f"DataFrame resampled to hourly, filled NaNs. Shape: {df_processed.shape}")
        # print(f"df_processed head after resample/ffill/bfill:\n{df_processed.head().to_string()}")
        # print(f"df_processed NaNs after resample/ffill/bfill:\n{df_processed.isna().sum().to_string()}")

        df_processed.rename(columns={'pm2_5': 'pm25', 'carbon_monoxide': 'co', 'temperature_2m': 'temp'}, inplace=True)
        print(f"Renamed columns. Current columns: {df_processed.columns.tolist()}")

        expected_cols_for_aqi = ['pm25', 'pm10', 'co']
        for col in expected_cols_for_aqi:
            if col not in df_processed.columns:
                print(f"Warning: Column '{col}' for AQI calculation is missing after rename. Adding as NaN.")
                df_processed[col] = np.nan
        
        df_processed['calculated_aqi'] = df_processed.apply(lambda row: calculate_overall_aqi(row, aqi_breakpoints), axis=1)
        print("Calculated AQI.")
        # print(f"df_processed head after AQI calculation:\n{df_processed.head().to_string()}")
        # print(f"df_processed NaNs after AQI calculation:\n{df_processed.isna().sum().to_string()}")

        required_columns = ['calculated_aqi', 'temp', 'pm25', 'pm10', 'co']
        for col in required_columns:
            if col not in df_processed.columns:
                print(f"Warning: Column '{col}' is missing before final selection. Adding it as NaN.")
                df_processed[col] = np.nan
        
        df_processed = df_processed[required_columns].copy()
        # print(f"Selected and reordered columns. Shape before windowing: {df_processed.shape}. Columns: {df_processed.columns.tolist()}")

        # Filter to the defined processing window relative to current time
        # Ensure we only consider data up to the current hour and back by processing_window_hours
        window_start_time_dt = current_utc_time.replace(minute=0, second=0, microsecond=0) - timedelta(hours=processing_window_hours - 1)
        window_end_time_dt = current_utc_time.replace(minute=0, second=0, microsecond=0)
        
        # Convert Python datetime to Pandas Timestamp for robust comparison
        # `window_start_time_dt` and `window_end_time_dt` are already UTC-aware from `datetime.now(pytz.utc)`
        window_start_time_ts = pd.Timestamp(window_start_time_dt)
        window_end_time_ts = pd.Timestamp(window_end_time_dt)

        # Ensure df_processed.index is timezone-aware (it should be if APIs return UTC and pd.to_datetime is used correctly)
        if df_processed.index.tz is None:
            print("Warning: df_processed.index is timezone-naive. Localizing to UTC.")
            df_processed.index = df_processed.index.tz_localize('UTC')
            
        df_recent_processed = df_processed[(df_processed.index >= window_start_time_ts) & (df_processed.index <= window_end_time_ts)].copy()
        print(f"Filtered to recent processing window ({processing_window_hours}hrs). Shape: {df_recent_processed.shape}")
        # print(f"df_recent_processed head:\n{df_recent_processed.head().to_string()}")
        # print(f"df_recent_processed NaNs before dropna:\n{df_recent_processed.isna().sum().to_string()}")


        initial_rows_recent = len(df_recent_processed)
        df_recent_processed.dropna(inplace=True)
        if len(df_recent_processed) < initial_rows_recent:
             print(f"Warning: Dropped {initial_rows_recent - len(df_recent_processed)} rows with NaNs from the recent processing window.")
        print(f"Shape after dropna on recent window: {df_recent_processed.shape}")

        if len(df_recent_processed) < sequence_length:
            print(f"Error: Only {len(df_recent_processed)} valid data points remain in the recent window after processing, but {sequence_length} are required.")
            return None, f"Error: Insufficient historical data in the recent window ({len(df_recent_processed)} points available, {sequence_length} required)."

        latest_data_sequence_df = df_recent_processed.tail(sequence_length).copy()
        print(f"Selected last {sequence_length} data points for model input. Shape: {latest_data_sequence_df.shape}")
        # print(f"Final sequence data:\n{latest_data_sequence_df.to_string()}")


        latest_data_sequence = latest_data_sequence_df.values.reshape(1, sequence_length, len(required_columns))
        timestamps = latest_data_sequence_df.index.tolist()
        # print(f"Prepared input sequence with shape: {latest_data_sequence.shape}")

        return latest_data_sequence, timestamps

    except requests.exceptions.RequestException as e:
        print(f"API Request Error: {e}")
        traceback.print_exc()
        return None, f"API Request Error: {e}"
    except Exception as e:
        print(f"An unexpected error occurred during data retrieval and processing: {e}")
        traceback.print_exc()
        return None, f"An unexpected error occurred during data processing: {e}"


# --- Define paths to your saved files ---
MODEL_PATH = 'best_model_TKAN_nahead_1.keras'
INPUT_SCALER_ATTR_PATH = 'input_scaler_attributes.json'
TARGET_SCALER_ATTR_PATH = 'target_scaler_attributes.json'
Y_SCALER_TRAIN_PATH = 'y_scaler_train.npy'


# --- Load the scalers and model ---
input_scaler = None
target_scaler = None 
model = None

try:
    print(f"Attempting to load input scaler attributes from {INPUT_SCALER_ATTR_PATH}...")
    with open(INPUT_SCALER_ATTR_PATH, 'r') as f:
        input_attrs = json.load(f)
    input_scaler = MinMaxScaler() 
    input_scaler.load_attributes(input_attrs) 
    print("Input scaler loaded manually.")

    print(f"Attempting to load target scaler attributes from {TARGET_SCALER_ATTR_PATH}...")
    with open(TARGET_SCALER_ATTR_PATH, 'r') as f:
        target_attrs = json.load(f)
    target_scaler = MinMaxScaler() 
    target_scaler.load_attributes(target_attrs) 
    print("Target scaler loaded manually.")

    print(f"Attempting to load y_scaler_train numpy array from {Y_SCALER_TRAIN_PATH}...")
    y_scaler_train = np.load(Y_SCALER_TRAIN_PATH)
    print("y_scaler_train numpy array loaded.")


except FileNotFoundError as e:
    print(f"Error loading scaler attribute files (FileNotFoundError): {e}")
except Exception as e:
    print(f"An error occurred during manual scaler loading: {e}")
    import traceback
    traceback.print_exc()

custom_objects = {"TKAN": TKAN}
if TKAT is not None:
     custom_objects["TKAT"] = TKAT

try:
    print(f"Loading model from {MODEL_PATH}...")
    with custom_object_scope(custom_objects):
        model = load_model(MODEL_PATH, compile=False)
    print("Model loaded successfully.")
except FileNotFoundError:
    print(f"Error: Model file not found at {MODEL_PATH}.")
except ValueError as e:
     print(f"Error loading model (ValueError): {e}")
     print("This can happen if the file is not a valid Keras file or if custom objects are not registered.")
     traceback.print_exc()
except Exception as e:
    print(f"An unexpected error occurred during model loading: {e}")
    traceback.print_exc()


app = FastAPI()

class PredictionRequest(BaseModel):
    latitude: float
    longitude: float
    pm25: float = None 
    pm10: float = None
    co: float = None
    temp: float = None
    n_ahead: int = 1 


class PredictionResponse(BaseModel):
    status: str 
    message: str 
    predictions: list = None 


@app.post("/predict", response_model=PredictionResponse)
async def predict_aqi_endpoint(request: PredictionRequest):
    if model is None or input_scaler is None or target_scaler is None:
        print("API called but model or scalers are not loaded.")
        raise HTTPException(status_code=500, detail="Model or scalers not loaded. Check server logs for details.")

    if model.input_shape is None or len(model.input_shape) < 2:
         print(f"Error: Model has unexpected input shape: {model.input_shape}")
         raise HTTPException(status_code=500, detail=f"Model has unexpected input shape: {model.input_shape}")

    SEQUENCE_LENGTH = model.input_shape[1]
    NUM_FEATURES = model.input_shape[2]
    required_num_features_model = len(['calculated_aqi', 'temp', 'pm25', 'pm10', 'co'])
    if NUM_FEATURES != required_num_features_model:
         print(f"Error: Model expects {NUM_FEATURES} features, but data processing provides {required_num_features_model}.")
         raise HTTPException(status_code=500, detail=f"Model expects {NUM_FEATURES} features, data processing provides {required_num_features_model}.")

    latest_data_sequence_unscaled, message = get_latest_data_sequence(SEQUENCE_LENGTH, request.latitude, request.longitude)

    if latest_data_sequence_unscaled is None:
        print(f"Data retrieval failed: {message}")
        return PredictionResponse(status="error", message=f"Data retrieval failed: {message}")

    prediction_timestamps = []
    if message and isinstance(message, list) and len(message) > 0: 
        last_timestamp_of_sequence = message[-1] 
        for i in range(request.n_ahead):
            prediction_timestamps.append(last_timestamp_of_sequence + timedelta(hours=i + 1))
    else:
        print("Warning: Could not get valid timestamps from data retrieval. Prediction timestamps will be approximate.")
        now_utc = datetime.now(pytz.utc)
        for i in range(request.n_ahead):
             prediction_timestamps.append(now_utc + timedelta(hours=i+1))

    if request.pm25 is not None and not pd.isna(request.pm25) and \
       request.pm10 is not None and not pd.isna(request.pm10) and \
       request.co is not None and not pd.isna(request.co) and \
       request.temp is not None and not pd.isna(request.temp):

        current_aqi = calculate_overall_aqi({'pm25': request.pm25, 'pm10': request.pm10, 'co': request.co, 'temp': request.temp}, aqi_breakpoints)

        if not pd.isna(current_aqi) and latest_data_sequence_unscaled.shape[1] == SEQUENCE_LENGTH : # Ensure sequence is correctly shaped
            latest_data_sequence_unscaled[0, -1, 0] = current_aqi
            latest_data_sequence_unscaled[0, -1, 1] = request.temp
            latest_data_sequence_unscaled[0, -1, 2] = request.pm25
            latest_data_sequence_unscaled[0, -1, 3] = request.pm10
            latest_data_sequence_unscaled[0, -1, 4] = request.co
            print("Updated last timestep of input sequence with current user inputs.")
        elif pd.isna(current_aqi):
             print("Warning: Could not calculate AQI for current inputs. Last timestep remains historical.")
        else:
            print("Warning: Sequence not correctly shaped to update with current user inputs, or current_aqi is NaN.")


    try:
        X_scaled = input_scaler.transform(latest_data_sequence_unscaled)
        print("Input data scaled successfully.")
    except Exception as e:
        print(f"Error scaling input data: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Error processing input data for prediction (scaling).")

    try:
        scaled_prediction = model.predict(X_scaled, verbose=0) 
        print(f"Model prediction made. Scaled prediction shape: {scaled_prediction.shape}")
    except Exception as e:
        print(f"Error during model prediction: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Error during model prediction.")

    try:
        if latest_data_sequence_unscaled.shape[1] > 0:
            calculated_aqi_sequence = latest_data_sequence_unscaled[0, :, 0] 

            approx_rolling_median_proxy = np.mean(calculated_aqi_sequence[-min(5, SEQUENCE_LENGTH):])
            if pd.isna(approx_rolling_median_proxy) or approx_rolling_median_proxy <= 0:
                 approx_rolling_median_proxy = 1.0 

            corresponding_rolling_median_scaler = np.full((1, request.n_ahead, 1), approx_rolling_median_proxy, dtype=np.float32)
            print(f"Approximated rolling median proxy for inverse transform: {approx_rolling_median_proxy:.2f}")

            y_unscaled_pred_ratio = target_scaler.inverse_transform(scaled_prediction.reshape(1, request.n_ahead, 1))
            print(f"Inverse transformed to ratio scale. Shape: {y_unscaled_pred_ratio.shape}")

            predicted_aqi_values = y_unscaled_pred_ratio * corresponding_rolling_median_scaler
            predicted_aqi_values = predicted_aqi_values.flatten() 
        else:
            print("Error: Input sequence is empty, cannot perform inverse transform.")
            raise ValueError("Input sequence is empty.")

        print(f"Final predicted AQI values: {predicted_aqi_values}")

    except Exception as e:
        print(f"Error during inverse transformation: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Error processing prediction results (inverse transform).")

    predictions_list = []
    for i in range(request.n_ahead):
        timestamp_str = prediction_timestamps[i].strftime('%Y-%m-%d %H:%M:%S')
        predictions_list.append({
            "timestamp": timestamp_str,
            "aqi": float(predicted_aqi_values[i]) 
        })

    return PredictionResponse(status="success", message="Prediction successful.", predictions=predictions_list)

@app.get("/")
async def read_root():
    return {"message": "AQI Prediction API is running."}

    
