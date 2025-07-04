
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

interface PrecautionsSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  precautionsData: StaticPrecautionsOutput | null;
  forecastedAqi: number | null;
}

export default function PrecautionsSheet({
  isOpen,
  onOpenChange,
  precautionsData,
  forecastedAqi,
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
