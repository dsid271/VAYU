
"use client";
import { useState, useEffect, useCallback } from 'react';
import DynamicBackground from '@/components/DynamicBackground';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, CloudSun, MapPin, AlertTriangle, ThermometerSun, ShieldCheck, ChevronLeft, Thermometer } from 'lucide-react';
import PrecautionsSheet from '@/components/PrecautionsSheet';
import Preloader from '@/components/Preloader';
import { getAqiPrediction } from '@/services/aqi-prediction-service';
import { fetchWeatherApi } from 'openmeteo';


export interface StaticPrecautionsOutput {
  severity: string;
  generalAdvice: string;
  precautions: string[];
}

const AQI_ALERT_THRESHOLD = 100;
const ENABLE_AQI_FETCHING = true;
const TEMP_FIXED_AQI_FOR_TESTING = 75; // Only used if ENABLE_AQI_FETCHING is false

const getStaticPrecautions = (aqi: number | null): StaticPrecautionsOutput | null => {
  if (aqi === null) return null;

  if (aqi <= 50) {
    return {
      severity: "Good",
      generalAdvice: "Air quality is considered satisfactory, and air pollution poses little or no risk.",
      precautions: [
        "Enjoy your usual outdoor activities.",
      ],
    };
  } else if (aqi <= 100) {
    return {
      severity: "Moderate",
      generalAdvice: "Air quality is acceptable; however, for some pollutants there may be a moderate health concern for a very small number of people who are unusually sensitive to air pollution.",
      precautions: [
        "Unusually sensitive individuals: consider reducing prolonged or heavy exertion outdoors.",
      ],
    };
  } else if (aqi <= 150) {
    return {
      severity: "Unhealthy for Sensitive Groups",
      generalAdvice: "Members of sensitive groups may experience health effects. The general public is not likely to be affected.",
      precautions: [
        "Sensitive groups (children, older adults, and people with heart or lung disease): reduce prolonged or heavy exertion.",
        "Keep windows closed to maintain better indoor air quality if outdoor air is poor.",
        "Stay tuned to local air quality advisories.",
      ],
    };
  } else if (aqi <= 200) {
    return {
      severity: "Unhealthy",
      generalAdvice: "Everyone may begin to experience health effects; members of sensitive groups may experience more serious health effects.",
      precautions: [
        "Everyone: reduce prolonged or heavy exertion outdoors.",
        "Sensitive groups: avoid all outdoor physical activity.",
        "Consider wearing a mask (e.g., N95) if you need to be outdoors for an extended period.",
        "Keep indoor air clean by closing windows and using air purifiers if available.",
      ],
    };
  } else if (aqi <= 300) {
    return {
      severity: "Very Unhealthy",
      generalAdvice: "Health alert: everyone may experience more serious health effects.",
      precautions: [
        "Everyone: avoid all outdoor physical activity.",
        "Sensitive groups: remain indoors and keep activity levels low.",
        "Keep windows and doors closed. Run air purifiers if available.",
        "Postpone outdoor events.",
      ],
    };
  } else { // AQI > 300
    return {
      severity: "Hazardous",
      generalAdvice: "Health warnings of emergency conditions. The entire population is more likely to be affected.",
      precautions: [
        "Everyone: remain indoors and keep activity levels as low as possible.",
        "Keep windows and doors closed. Use air purifiers on high setting.",
        "Seek medical attention if you experience symptoms like coughing or shortness of breath.",
        "Follow advice from local health authorities; evacuation may be recommended in extreme cases.",
      ],
    };
  }
};


export default function HomePage() {
  const [isPreloading, setIsPreloading] = useState(true);
  const [displayAqi, setDisplayAqi] = useState<number | null>(null);
  // const [currentTemperature, setCurrentTemperature] = useState<number | null>(null); // Reverted
  const [isLoading, setIsLoading] = useState<boolean>(ENABLE_AQI_FETCHING);
  const [error, setError] = useState<string | null>(null);
  const [locationName, setLocationName] = useState<string | null>(ENABLE_AQI_FETCHING ? null : "Fixed AQI (Testing)");

  const [highestForecastedAqi, setHighestForecastedAqi] = useState<number | null>(null);
  const [isBadAqiForecasted, setIsBadAqiForecasted] = useState<boolean>(false);
  const [staticPrecautions, setStaticPrecautions] = useState<StaticPrecautionsOutput | null>(null);
  const [showPrecautionsSheet, setShowPrecautionsSheet] = useState<boolean>(false);
  const [alertShownForForecast, setAlertShownForForecast] = useState<boolean>(false);


  const { toast } = useToast();

  const fetchAqiData = useCallback(async (lat: number, lon: number) => {
    if (!ENABLE_AQI_FETCHING) {
      setIsLoading(false);
      const fixedAqi = TEMP_FIXED_AQI_FOR_TESTING;
      setDisplayAqi(fixedAqi);
      setLocationName("Fixed AQI (Testing)");
      setHighestForecastedAqi(fixedAqi);
      setIsBadAqiForecasted(fixedAqi > AQI_ALERT_THRESHOLD);
      setStaticPrecautions(getStaticPrecautions(fixedAqi));
      // setCurrentTemperature(25); // Reverted
      console.log("Using fixed AQI for testing:", fixedAqi);
      return;
    }

    setIsLoading(true);
    setError(null);
    console.log("Starting fetchAqiData for lat:", lat, "lon:", lon);

    const airQualityApiUrl = "https://air-quality-api.open-meteo.com/v1/air-quality";
    const airQualityParams = {
        latitude: lat,
        longitude: lon,
        current: ["european_aqi", "pm2_5", "pm10", "carbon_monoxide"],
        hourly: ["european_aqi"],
        timezone: "auto",
        forecast_days: 1,
    };

    let currentAqi: number | null = null;
    let currentPm2_5: number | null = null;
    let currentPm10: number | null = null;
    let currentCO: number | null = null;
    let hourlyAqiValues: number[] = [];

    try {
      console.log("Fetching Open-Meteo Air Quality data with params:", airQualityParams);
      const aqResponses = await fetchWeatherApi(airQualityApiUrl, airQualityParams);
      const aqResponse = aqResponses[0];
      console.log("Open-Meteo Air Quality response received:", aqResponse);

      const aqCurrentResult = aqResponse.current();
      if (aqCurrentResult) {
        console.log("Processing currentResult from Open-Meteo Air Quality:", aqCurrentResult);
        const aqiVal = aqCurrentResult.variables(0)!.value();
        currentAqi = isNaN(aqiVal) ? null : Math.round(aqiVal);

        const pm25Val = aqCurrentResult.variables(1)!.value();
        currentPm2_5 = isNaN(pm25Val) ? null : pm25Val;

        const pm10Val = aqCurrentResult.variables(2)!.value();
        currentPm10 = isNaN(pm10Val) ? null : pm10Val;

        const coVal = aqCurrentResult.variables(3)!.value();
        currentCO = isNaN(coVal) ? null : coVal;
        console.log("Extracted current AQ values:", { currentAqi, currentPm2_5, currentPm10, currentCO });
      } else {
        console.warn("No currentResult from Open-Meteo Air Quality.");
      }
      setDisplayAqi(currentAqi ?? 75);

      const aqHourlyResult = aqResponse.hourly();
      if (aqHourlyResult) {
        console.log("Processing hourlyResult from Open-Meteo Air Quality:", aqHourlyResult);
        const aqiArray = aqHourlyResult.variables(0)!.valuesArray();
        if (aqiArray) {
            hourlyAqiValues = Array.from(aqiArray).map(v => Math.round(v));
            console.log("Extracted hourlyAqiValues for fallback:", hourlyAqiValues);
        } else {
          console.warn("No aqiArray in hourlyResult from Open-Meteo Air Quality.");
        }
      } else {
        console.warn("No hourlyResult from Open-Meteo Air Quality.");
      }

      console.log("Attempting to call getAqiPrediction with:", { lat, lon, pm2_5: currentPm2_5, pm10: currentPm10, co: currentCO, temp: null }); // temp is now passed as null
      try {
        const predictions = await getAqiPrediction(
          lat,
          lon,
          currentPm2_5,
          currentPm10,
          currentCO,
          null, // Pass null for temperature, as backend handles it
          1
        );

        console.log("Received predictions from custom service:", predictions);

        if (predictions && predictions.length > 0 && predictions[0].aqi !== undefined) {
          const nextHourPredictionAqi = Math.round(predictions[0].aqi);
          console.log("Setting highestForecastedAqi to (from custom service):", nextHourPredictionAqi);
          setHighestForecastedAqi(nextHourPredictionAqi);
          setIsBadAqiForecasted(nextHourPredictionAqi > AQI_ALERT_THRESHOLD);
        } else {
          console.warn("Custom AQI prediction service returned no predictions, an empty array, or prediction missing AQI. Falling back to Open-Meteo hourly if available.");
          if (hourlyAqiValues.length > 0) {
            const maxAqiInForecast = Math.max(...hourlyAqiValues);
            console.log("Setting highestForecastedAqi to (from Open-Meteo hourly fallback):", maxAqiInForecast);
            setHighestForecastedAqi(maxAqiInForecast);
            setIsBadAqiForecasted(maxAqiInForecast > AQI_ALERT_THRESHOLD);
          } else {
            console.warn("No Open-Meteo hourly forecast available for fallback.");
            setHighestForecastedAqi(null);
            setIsBadAqiForecasted(false);
          }
        }
      } catch (predictionError) {
        console.error("Error fetching AQI prediction from custom service:", predictionError);
        toast({
          title: "Prediction Service Error",
          description: "Could not fetch custom AQI forecast. Using standard forecast.",
          variant: "destructive",
        });
        if (hourlyAqiValues.length > 0) {
          const maxAqiInForecast = Math.max(...hourlyAqiValues);
          console.log("Setting highestForecastedAqi to (from Open-Meteo hourly fallback after prediction error):", maxAqiInForecast);
          setHighestForecastedAqi(maxAqiInForecast);
          setIsBadAqiForecasted(maxAqiInForecast > AQI_ALERT_THRESHOLD);
        } else {
          console.warn("No Open-Meteo hourly forecast available for fallback after prediction error.");
          setHighestForecastedAqi(null);
          setIsBadAqiForecasted(false);
        }
      }

    } catch (err) {
      console.error("Error in fetchAqiData (Open-Meteo Air Quality call or processing):", err);
      if (err instanceof Error) {
        setError(err.message);
        toast({ title: "AQI Data Error", description: err.message, variant: "destructive" });
      } else {
        setError("An unknown error occurred while fetching AQI data.");
        toast({ title: "AQI Data Error", description: "An unknown error occurred.", variant: "destructive" });
      }
      if (displayAqi === null) {
        setDisplayAqi(75);
      }
      setHighestForecastedAqi(null);
      setIsBadAqiForecasted(false);
      // setCurrentTemperature(null); // Reverted
    } finally {
      setIsLoading(false);
      console.log("Finished fetchAqiData. isLoading:", false);
    }
  }, [toast, displayAqi]);


  useEffect(() => {
    const getAqiForCurrentLocation = () => {
      if (!navigator.geolocation) {
        setError("Geolocation is not supported by your browser. Cannot fetch local AQI.");
        setLocationName("Location Unavailable");
         if (displayAqi === null) {
            setDisplayAqi(75);
            setStaticPrecautions(getStaticPrecautions(75));
         }
         // setCurrentTemperature(null); // Reverted
        setIsLoading(false);
        return;
      }

      setLocationName("Fetching location...");
      setIsLoading(true);
      setError(null);
      console.log("Attempting to get current location...");

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          setLocationName("Your Current Location");
          console.log("Geolocation successful. Coordinates:", { latitude, longitude });
          await fetchAqiData(latitude, longitude);
        },
        (err) => {
          let errMsg = "Could not get your location. ";
          switch (err.code) {
            case err.PERMISSION_DENIED:
              errMsg += "Permission denied.";
              break;
            case err.POSITION_UNAVAILABLE:
              errMsg += "Location information is unavailable.";
              break;
            case err.TIMEOUT:
              errMsg += "The request to get user location timed out.";
              break;
            default:
              errMsg += "An unknown error occurred.";
              break;
          }
          console.error("Geolocation error:", errMsg, err);
          setError(errMsg + " Please enable location services or check permissions.");
          setLocationName("Location Denied/Error");

          if (displayAqi === null) {
            setDisplayAqi(75);
            setStaticPrecautions(getStaticPrecautions(75));
          }
          // setCurrentTemperature(null); // Reverted
          setIsLoading(false);
        }
      );
    };

    if (!isPreloading) {
      console.log("Preloading finished. isPreloading:", isPreloading);
      if (ENABLE_AQI_FETCHING) {
        console.log("AQI fetching is enabled. Calling getAqiForCurrentLocation.");
        getAqiForCurrentLocation();
      } else {
        console.log("AQI fetching is disabled. Using fixed testing values.");
        const fixedAqi = TEMP_FIXED_AQI_FOR_TESTING;
        setDisplayAqi(fixedAqi);
        setLocationName("Fixed AQI (Testing)");
        setHighestForecastedAqi(fixedAqi);
        setIsBadAqiForecasted(fixedAqi > AQI_ALERT_THRESHOLD);
        setStaticPrecautions(getStaticPrecautions(fixedAqi));
        // setCurrentTemperature(25); // Reverted
        setIsLoading(false);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPreloading]);

 useEffect(() => {
    const aqiValueForPrecautionsLogic = highestForecastedAqi ?? displayAqi;
    const isAlertConditionMet = (highestForecastedAqi !== null && highestForecastedAqi > AQI_ALERT_THRESHOLD);

    console.log("Precautions useEffect triggered. highestForecastedAqi:", highestForecastedAqi, "displayAqi:", displayAqi, "isAlertConditionMet:", isAlertConditionMet, "alertShownForForecast:", alertShownForForecast);

    if (aqiValueForPrecautionsLogic !== null) {
        const newPrecautions = getStaticPrecautions(aqiValueForPrecautionsLogic);
        setStaticPrecautions(newPrecautions);
        console.log("Updated staticPrecautions based on AQI", aqiValueForPrecautionsLogic, ":", newPrecautions);

        if (ENABLE_AQI_FETCHING && isAlertConditionMet && newPrecautions && !alertShownForForecast) {
            console.log("Displaying AQI alert toast for forecast. AQI:", highestForecastedAqi, "Severity:", newPrecautions.severity);
            toast({
                title: `${newPrecautions.severity} AQI Forecasted!`,
                description: `AQI may reach ${highestForecastedAqi}. ${newPrecautions.generalAdvice}`,
                variant: "destructive",
                duration: 8000,
            });
            setAlertShownForForecast(true);
        }
    }

    if (!isAlertConditionMet && alertShownForForecast) {
        console.log("Resetting alertShownForForecast to false as alert condition is no longer met.");
        setAlertShownForForecast(false);
    }

  }, [highestForecastedAqi, displayAqi, toast, alertShownForForecast]);


  if (isPreloading) {
    return <Preloader onLoaded={() => setIsPreloading(false)} />;
  }

  const currentPrecautions = staticPrecautions;


  return (
    <main className="relative min-h-screen w-full overflow-hidden">
      <DynamicBackground aqi={displayAqi ?? 0} />

      {(currentPrecautions) && (
        <Button
          variant="ghost"
          size="icon"
          className={`fixed top-4 right-4 sm:top-8 sm:right-8 z-30 h-7 w-7 sm:h-8 sm:w-8 p-1.5 sm:p-2 bg-card/30 backdrop-blur-xl shadow-2xl border border-foreground/10 rounded-lg hover:bg-card/50`}
          onClick={() => setShowPrecautionsSheet(prev => !prev)}
          aria-label={showPrecautionsSheet ? "Close precautions panel" : "Open precautions panel"}
        >
          <ChevronLeft className={`h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary-foreground transition-transform duration-300 ${showPrecautionsSheet ? "rotate-180" : ""}`} />
        </Button>
      )}


      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
        <Card className="w-[300px] sm:w-[350px] bg-card/30 backdrop-blur-xl shadow-2xl border border-foreground/10">
          <CardHeader className="pb-4 text-center">
            <CardTitle className="text-xl font-headline text-card-foreground flex items-center justify-center">
              <MapPin className="w-5 h-5 mr-2 flex-shrink-0"/> {locationName || "Weather Data"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading && !error && !(displayAqi !== null && locationName) ? (
              <div className="flex flex-col items-center justify-center h-32">
                <CloudSun className="w-10 h-10 animate-pulse text-foreground/70 mb-2" />
                <p className="text-sm text-center text-foreground/80">
                  {locationName === "Fetching location..." ? "Getting your location..." : (ENABLE_AQI_FETCHING ? "Fetching data..." : "Loading Fixed Data...")}
                </p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center h-32 p-3 bg-destructive/20 rounded-md">
                <AlertCircle className="w-8 h-8 text-destructive mb-2"/>
                <p className="text-sm text-center text-destructive-foreground font-medium">
                  {locationName === "Location Denied/Error" ? "Location Error" : "Data Error"}
                </p>
                <p className="text-xs text-center text-destructive-foreground/80 mt-1 px-2">{error}</p>
              </div>
            ) : (displayAqi !== null) ? ( // Changed condition to only check displayAqi
              <div className="text-center py-1">
                 {/* <div className="flex justify-around items-center mb-3">  // Reverted: Temperature display removed
                    {displayAqi !== null && (
                        <div className="flex flex-col items-center">
                            <span className="text-xs text-foreground/70">AQI</span>
                            <p className="text-5xl font-bold text-foreground tabular-nums">{displayAqi}</p>
                        </div>
                    )}
                    {currentTemperature !== null && (
                         <div className="flex flex-col items-center">
                            <span className="text-xs text-foreground/70">Temp</span>
                            <p className="text-5xl font-bold text-foreground tabular-nums">{currentTemperature}°C</p>
                         </div>
                    )}
                </div> */}
                <div className="flex flex-col items-center mb-3">
                    <span className="text-xs text-foreground/70">AQI</span>
                    <p className="text-6xl font-bold text-foreground tabular-nums">{displayAqi}</p>
                </div>


                {isBadAqiForecasted && highestForecastedAqi && currentPrecautions && (
                  <div className={`mt-2 p-2 rounded-md border text-xs ${
                    highestForecastedAqi > 150 ? 'bg-red-500/20 border-red-500/30 text-red-700 dark:text-red-300'
                                             : 'bg-amber-500/20 border-amber-500/30 text-amber-700 dark:text-amber-300'
                  }`}>
                    <div className="flex items-center justify-center font-medium">
                      <AlertTriangle className="w-3.5 h-3.5 mr-1.5 flex-shrink-0"/>
                      Forecast: {currentPrecautions.severity} (AQI {highestForecastedAqi})
                    </div>
                  </div>
                )}

                {(isBadAqiForecasted || (!ENABLE_AQI_FETCHING && (displayAqi ?? 0) > AQI_ALERT_THRESHOLD)) && currentPrecautions && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 w-full bg-card/50 hover:bg-card/70 border-foreground/20"
                    onClick={() => setShowPrecautionsSheet(true)}
                  >
                    <ShieldCheck className="w-4 h-4 mr-2"/>
                    View Precautions
                  </Button>
                )}
              </div>
            ) : (
               <div className="flex flex-col items-center justify-center h-32 p-3">
                 <AlertCircle className="w-8 h-8 text-foreground/70 mb-2"/>
                <p className="text-sm text-center text-foreground/80">Weather data could not be loaded.</p>
                 <p className="text-xs text-center text-foreground/60 mt-1">Please ensure location services are enabled or check network.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      {currentPrecautions &&
        <PrecautionsSheet
          isOpen={showPrecautionsSheet}
          onOpenChange={setShowPrecautionsSheet}
          precautionsData={currentPrecautions}
          forecastedAqi={highestForecastedAqi}
        />
      }
    </main>
  );
}


    