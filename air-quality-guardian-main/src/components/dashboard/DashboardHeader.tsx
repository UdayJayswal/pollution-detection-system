import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SpikeNotificationBell } from "./SpikeNotificationBell";

interface DashboardHeaderProps {
  station: string;
  updatedAt: string;
  /** Show the realtime spike notification bell (Sarpanch / Officer / Admin views). */
  showSpikeBell?: boolean;
  showCloseButton?: boolean;
}

export const DashboardHeader = ({ station, updatedAt, showSpikeBell = false, showCloseButton = true }: DashboardHeaderProps) => {
  const handleClose = () => window.close();

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="container flex h-16 items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <img
            src="/logo.png"
            alt="Vayu-Nirantar logo"
            className="h-10 w-10 shrink-0 rounded-lg bg-background object-contain ring-1 ring-border"
          />
          <div className="min-w-0">
            <h1 className="text-base font-semibold leading-tight truncate sm:text-lg">
              Vayu-Nirantar{" "}
              <span className="text-muted-foreground font-normal">Monitoring</span>
            </h1>
            <p className="text-xs text-muted-foreground truncate">
              {station} · Updated {updatedAt}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          <div className="hidden md:flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-status-good opacity-60 animate-pulse-soft" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-status-good" />
            </span>
            <span className="text-muted-foreground">Live</span>
          </div>
          {showSpikeBell && <SpikeNotificationBell />}
          {showCloseButton && (
            <Button variant="ghost" size="icon" onClick={handleClose} aria-label="Close window">
              <X className="h-5 w-5" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Menu">
            <Menu className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </header>
  );
};
