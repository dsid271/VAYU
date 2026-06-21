
"use client";

import type { StaticPrecautionsOutput } from "@/app/page";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Info, Zap } from "lucide-react"; // ChevronRight removed
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from "@/components/ui/chart";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts';

interface PrecautionsSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  precautionsData: StaticPrecautionsOutput | null;
  forecastedAqi: number | null;
  hourlyData?: Array<{ time: string; timeLabel: string; aqi: number; isObserved?: boolean; originalTimeRaw?: string }>;
  modelPredictions?: Array<{ time: string; timeLabel: string; aqi: number; originalTimeRaw?: string }>;
}

export default function PrecautionsSheet({
  isOpen,
  onOpenChange,
  precautionsData,
  forecastedAqi,
  hourlyData,
  modelPredictions,
}: PrecautionsSheetProps) {

  const getSeverityBadgeVariant = (severity?: string): "default" | "destructive" | "outline" => {
    if (!severity) return "default";
    if (severity === "Hazardous" || severity === "Very Unhealthy") return "destructive";
    if (severity === "Unhealthy" || severity === "Unhealthy for Sensitive Groups") return "outline";
    return "default";
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-[90vw] max-w-md sm:max-w-lg bg-background/95 backdrop-blur-lg"
        customCloseIcon={<></>} // Pass an empty fragment to remove the default close button
      >
        <SheetHeader className="pb-4 border-b">
          <SheetTitle className="flex items-center text-lg">
            <AlertTriangle className="w-6 h-6 mr-3 text-destructive" />
            Air Quality Alert & Precautions
          </SheetTitle>
          {forecastedAqi !== null && precautionsData && (
             <SheetDescription className="space-y-1 pt-1">
                <span className="block">
                    Forecasted AQI up to <Badge variant={getSeverityBadgeVariant(precautionsData?.severity)} className="font-semibold">{forecastedAqi}</Badge>
                    {precautionsData?.severity && (
                        <span className="ml-2 inline-flex items-center">
                           (<Zap className="w-3.5 h-3.5 mr-1" /> {precautionsData.severity})
                        </span>
                    )}
                </span>
                {precautionsData?.generalAdvice && <span className="block italic text-xs">{precautionsData.generalAdvice}</span>}
             </SheetDescription>
          )}
         {/* Hourly AQI Chart */}
         {hourlyData && hourlyData.length > 0 && (
           <div className="px-4 pt-4">
             <div className="h-44 w-full overflow-hidden">
               {(() => {
                 const observedData = hourlyData.map(h => ({
                   ...h,
                   observed: h.aqi,
                   predicted: null,
                 }));
                 const predictedData = (modelPredictions ?? []).map(h => ({
                   ...h,
                   observed: null,
                   predicted: h.aqi,
                 }));
                 const chartData = [...observedData, ...predictedData].sort(
                   (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
                 );

                 return (
                   <ChartContainer
                     id="sheet-aqi-hourly"
                     className="aspect-auto h-full w-full"
                     config={{
                       observed: { label: 'Observed', color: 'hsl(var(--chart-1))' },
                       predicted: { label: 'Predicted', color: 'hsl(var(--chart-4))' },
                     }}
                   >
                     <AreaChart data={chartData} margin={{ top: 6, right: 12, left: 6, bottom: 6 }}>
                       <defs>
                         <linearGradient id="sheetAqiGradientObserved" x1="0" y1="0" x2="0" y2="1">
                           <stop offset="5%" stopColor="var(--color-observed)" stopOpacity={0.35} />
                           <stop offset="95%" stopColor="var(--color-observed)" stopOpacity={0.05} />
                         </linearGradient>
                         <linearGradient id="sheetAqiGradientPredicted" x1="0" y1="0" x2="0" y2="1">
                           <stop offset="5%" stopColor="var(--color-predicted)" stopOpacity={0.18} />
                           <stop offset="95%" stopColor="var(--color-predicted)" stopOpacity={0.02} />
                         </linearGradient>
                       </defs>
                       <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                       <XAxis dataKey="timeLabel" stroke="var(--muted-foreground)" />
                       <YAxis dataKey="aqi" stroke="var(--muted-foreground)" />
                       <Area name="Observed" type="monotone" dataKey="observed" stroke="var(--color-observed)" fill="url(#sheetAqiGradientObserved)" strokeWidth={2} dot={{ r: 2 }} />
                       <Area name="Predicted" type="monotone" dataKey="predicted" stroke="var(--color-predicted)" fill="url(#sheetAqiGradientPredicted)" strokeWidth={2} dot={false} strokeDasharray="4 4" />
                       <ChartTooltip content={<ChartTooltipContent showBothTimes />} />
                       <ChartLegend content={ChartLegendContent} />
                     </AreaChart>
                   </ChartContainer>
                 )
               })()}
               <p className="mt-2 text-[11px] text-muted-foreground/90">
                 Solid values are past observed hourly AQI from Open-Meteo; dashed values are model predictions, not Open-Meteo forecast.
               </p>
             </div>
           </div>
         )}
        </SheetHeader>

        <div className="py-6 max-h-[calc(100vh-180px)] overflow-y-auto">
        {precautionsData && precautionsData.precautions.length > 0 ? (
          <div className="space-y-3">
            <h3 className="text-md font-semibold text-foreground mb-2">Recommended Precautions:</h3>
            <ul className="space-y-2 list-disc list-outside pl-5 text-sm text-foreground/90">
              {precautionsData.precautions.map((precaution, index) => (
                <li key={index} className="leading-relaxed">{precaution}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground flex items-center">
            <Info className="w-4 h-4 mr-2" />
            {forecastedAqi !== null ? "Loading precautions or precautions are being determined..." : "No high AQI forecast at the moment."}
          </p>
        )}
        </div>

        <SheetFooter className="pt-4 border-t">
            <p className="text-xs text-muted-foreground">
                AQI data provided by Open-Meteo. Precautionary advice based on general guidelines. Always consult with health professionals for medical advice.
            </p>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
