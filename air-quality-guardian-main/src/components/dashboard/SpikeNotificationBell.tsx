import { useEffect, useState } from "react";
import { Bell, AlertTriangle } from "lucide-react";
import { realtime, type SpikeAlert } from "@/lib/realtime";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export const SpikeNotificationBell = () => {
  const [spike, setSpike] = useState<SpikeAlert | null>(realtime.getLatestSpike());
  const [unseen, setUnseen] = useState(false);

  useEffect(() => {
    const off = realtime.subscribeSpike((s) => {
      setSpike(s);
      setUnseen(true);
    });
    return () => {
      off();
    };
  }, []);

  return (
    <Popover onOpenChange={(o) => o && setUnseen(false)}>
      <PopoverTrigger
        aria-label="Latest spike notification"
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-secondary transition-colors"
      >
        <Bell className="h-5 w-5" />
        {unseen && spike && (
          <span className="absolute top-1.5 right-1.5 flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-status-hazardous opacity-70 animate-ping" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-status-hazardous ring-2 ring-card" />
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-status-hazardous" /> Latest Spike
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Real-time pollutant exceedance alert
          </p>
        </div>
        <div className="p-4">
          {spike ? (
            <div className="space-y-2">
              <div className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1",
                spike.aqi > 300
                  ? "bg-status-hazardous-soft text-status-hazardous ring-status-hazardous/20"
                  : "bg-status-unhealthy-soft text-status-unhealthy ring-status-unhealthy/20")}>
                {spike.band} · AQI {spike.aqi}
              </div>
              <div className="text-sm font-medium">
                {spike.pollutant} surge · {spike.value}
              </div>
              <div className="text-xs text-muted-foreground">{spike.zone}</div>
              <div className="text-[11px] text-muted-foreground">
                {new Date(spike.ts).toLocaleString()}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No spikes detected yet. Streaming live data…</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
