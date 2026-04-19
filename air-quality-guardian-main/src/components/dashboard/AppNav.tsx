import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";

const links = [
  { to: "/", label: "Dashboard" },
  { to: "/officer", label: "Officer" },
];

export const AppNav = () => (
  <nav className="flex items-center gap-1 sm:gap-2 overflow-x-auto">
    {links.map((l) => (
      <NavLink
        key={l.to}
        to={l.to}
        end={l.to === "/"}
        className={({ isActive }) =>
          cn(
            "rounded-md px-3 py-1.5 text-xs sm:text-sm font-medium whitespace-nowrap transition-colors",
            isActive
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground",
          )
        }
      >
        {l.label}
      </NavLink>
    ))}
  </nav>
);
