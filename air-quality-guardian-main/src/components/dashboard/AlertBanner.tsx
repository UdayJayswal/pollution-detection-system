import { AlertTriangle, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface AlertBannerProps {
  title: string;
  message: string;
}

export const AlertBanner = ({ title, message }: AlertBannerProps) => {
  const [open, setOpen] = useState(true);
  if (!open) return null;

  return (
    <div
      role="alert"
      className="flex w-full items-start gap-3 rounded-xl border border-status-unhealthy/30 bg-status-unhealthy-soft p-3 sm:p-4 shadow-card animate-fade-in"
    >
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-status-unhealthy/15 text-status-unhealthy">
        <AlertTriangle className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm sm:text-base font-semibold text-status-unhealthy">
          {title}
        </p>
        <p className="text-xs sm:text-sm text-foreground/80 leading-relaxed">
          {message}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-status-unhealthy hover:bg-status-unhealthy/10"
        onClick={() => setOpen(false)}
        aria-label="Dismiss alert"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
};
