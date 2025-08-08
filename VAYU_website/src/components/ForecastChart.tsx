"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useMemo } from 'react';

interface Prediction {
  timestamp: string;
  aqi: number;
}

interface ForecastChartProps {
  historicalData: Prediction[];
  forecastData: Prediction[];
}

export default function ForecastChart({ historicalData, forecastData }: ForecastChartProps) {
  const chartData = useMemo(() => {
    if (!historicalData || !forecastData) return [];

    const combined = [
      ...historicalData.map(d => ({ ...d, type: 'historical' })),
      ...forecastData.map(d => ({ ...d, type: 'forecast' }))
    ];

    // Add a connection point so the forecast line starts from the last historical point
    if (historicalData.length > 0 && forecastData.length > 0) {
        const lastHistoricalPoint = historicalData[historicalData.length - 1];
        const firstForecastPoint = forecastData[0];
        // Create a new point that has the same timestamp as the last historical point but the AQI of the forecast
        // This is a bit of a hack to make the line connect smoothly
        const connectionPoint = { ...firstForecastPoint, timestamp: lastHistoricalPoint.timestamp, type: 'forecast' };
        combined.splice(historicalData.length, 0, connectionPoint);
    }

    return combined.map(d => ({
      ...d,
      aqi: Math.round(d.aqi),
      time: new Date(d.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', hour12: true })
    }));
  }, [historicalData, forecastData]);

  if (!chartData || chartData.length === 0) {
    return <div className="mt-4 text-center text-sm text-foreground/60">Chart data is not available.</div>;
  }

  const historicalSegment = chartData.filter(d => d.type === 'historical');
  const forecastSegment = chartData.filter(d => d.type === 'forecast');

  return (
    <div className="mt-4 w-full h-48">
      <h3 className="text-sm font-medium text-center text-foreground/80 mb-2">AQI Trend & Forecast</h3>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
          <XAxis dataKey="time" fontSize={12} tickLine={false} axisLine={false} />
          <YAxis fontSize={12} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgba(20, 20, 20, 0.8)',
              borderColor: 'rgba(255, 255, 255, 0.2)',
              borderRadius: '0.5rem',
            }}
            labelStyle={{ color: '#fff' }}
          />
          <Line data={historicalSegment} type="monotone" dataKey="aqi" stroke="#8884d8" strokeWidth={2} dot={false} name="History" />
          <Line data={forecastSegment} type="monotone" dataKey="aqi" stroke="#82ca9d" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Forecast" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
