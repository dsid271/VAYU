
'use server';

/**
 * @fileOverview Service for fetching AQI predictions from a custom model.
 */

interface PredictionInput {
  latitude: number;
  longitude: number;
  pm25?: number | null;
  pm10?: number | null;
  co?: number | null;
  temp?: number | null;
  n_ahead: number;
}

interface Prediction {
  timestamp: string;
  aqi: number;
}

interface PredictionResponse {
  status: "success" | "error";
  predictions?: Prediction[];
  message?: string;
}

/**
 * Fetches AQI prediction from the custom model endpoint.
 * @param latitude - Latitude of the location.
 * @param longitude - Longitude of the location.
 * @param pm25 - Current PM2.5 value (optional).
 * @param pm10 - Current PM10 value (optional).
 * @param co - Current Carbon Monoxide value (optional).
 * @param temp - Current Temperature value (optional).
 * @param n_ahead - Number of hours ahead to predict.
 * @returns A promise that resolves to an array of prediction objects.
 * @throws Will throw an error if the fetch or prediction fails.
 */
export async function getAqiPrediction(
  latitude: number,
  longitude: number,
  pm25: number | null | undefined,
  pm10: number | null | undefined,
  co: number | null | undefined,
  temp: number | null | undefined,
  n_ahead: number
): Promise<Prediction[]> {
  const spaceUrl = "https://nikethanreddy-project.hf.space";
  const predictEndpoint = `${spaceUrl}/predict`;

  // Prepare the data to send in the request body
  // Only include optional fields if they are not null/undefined
  const requestPayload: any = {
    latitude: latitude,
    longitude: longitude,
    n_ahead: n_ahead
  };

  if (pm25 !== null && pm25 !== undefined) {
    requestPayload.pm25 = pm25;
  }
  if (pm10 !== null && pm10 !== undefined) {
    requestPayload.pm10 = pm10;
  }
  if (co !== null && co !== undefined) {
    requestPayload.co = co;
  }
  if (temp !== null && temp !== undefined) {
    requestPayload.temp = temp;
  }

  try {
    const response = await fetch(predictEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestPayload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`HTTP error! status: ${response.status}, message: ${errorText} for request:`, requestPayload);
      throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
    }

    const predictionResult: PredictionResponse = await response.json();

    if (predictionResult.status === "success" && predictionResult.predictions) {
      console.log("Prediction successful:", predictionResult.predictions);
      return predictionResult.predictions;
    } else {
      console.error("Prediction API error:", predictionResult.message, "for request:", requestPayload);
      throw new Error(`Prediction API error: ${predictionResult.message || 'Unknown error from prediction API'}`);
    }
  } catch (error) {
    console.error("Error fetching prediction:", error, "for request:", requestPayload);
    // Re-throw the error to be handled by the caller
    throw error;
  }
}

