import { Navigation, Wind } from "lucide-react";

interface WindDirectionProps {
  /** Degrees from North, clockwise (0 = N, 90 = E) */
  degrees: number;
  cardinal: string;
  /** Wind speed in km/h (from backend) */
  speed: number;
}

export const WindDirection = ({ degrees, cardinal, speed }: WindDirectionProps) => {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5 shadow-card h-full">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Wind Direction & Speed</h2>
        <span className="text-[11px] text-muted-foreground">Live</span>
      </header>

      <div className="flex flex-1 items-center justify-center">
        <div className="relative h-32 w-32 sm:h-36 sm:w-36">
          <div className="absolute inset-0 rounded-full border border-border bg-secondary/40" />
          <div className="absolute inset-2 rounded-full border border-dashed border-border/70" />

          {(["N", "E", "S", "W"] as const).map((c, i) => {
            const positions = [
              "top-1 left-1/2 -translate-x-1/2",
              "right-1 top-1/2 -translate-y-1/2",
              "bottom-1 left-1/2 -translate-x-1/2",
              "left-1 top-1/2 -translate-y-1/2",
            ];
            return (
              <span
                key={c}
                className={`absolute text-[10px] font-medium text-muted-foreground ${positions[i]}`}
              >
                {c}
              </span>
            );
          })}

          <div
            className="absolute inset-0 flex items-center justify-center transition-transform duration-700 ease-out"
            style={{ transform: `rotate(${degrees}deg)` }}
            aria-label={`Wind direction ${cardinal}`}
          >
            <Navigation className="h-10 w-10 text-primary fill-primary" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-border pt-3">
        <div className="text-center">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Direction</p>
          <p className="text-lg font-semibold tabular-nums">
            {cardinal} <span className="text-muted-foreground font-normal text-sm">{degrees}°</span>
          </p>
        </div>
        <div className="text-center border-l border-border">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center justify-center gap-1">
            <Wind className="h-3 w-3" /> Speed
          </p>
          <p className="text-lg font-semibold tabular-nums">
            {speed} <span className="text-muted-foreground font-normal text-sm">km/h</span>
          </p>
        </div>
      </div>
    </section>
  );
};
