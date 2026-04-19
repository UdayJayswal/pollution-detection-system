import { useEffect, useState } from "react";
import {
  AlertTriangle, Download, FileText, Loader2, LockKeyhole, LogIn, LogOut, RefreshCw, Send, ShieldCheck,
} from "lucide-react";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { AppNav } from "@/components/dashboard/AppNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { fetchIncidents } from "@/lib/api";
import type { Incident } from "@/lib/dataset";
import { toast } from "@/hooks/use-toast";
import {
  DEMO_CREDENTIALS, findCredential, hasDataAccess, type OfficerCredential, type OfficerRole,
} from "@/lib/officer-auth";
import { connectRealtimeDB, realtime, type SpikeAlert } from "@/lib/realtime";
import type { FaultAlert } from "@/lib/realtime";

const fmtDateTime = (d: Date) =>
  d.toLocaleString(undefined, {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });

const severityStyle: Record<Incident["severity"], string> = {
  LOW: "bg-status-good-soft text-status-good ring-status-good/20",
  MEDIUM: "bg-status-moderate-soft text-status-moderate ring-status-moderate/20",
  HIGH: "bg-status-hazardous-soft text-status-hazardous ring-status-hazardous/20",
};

const ROLES: OfficerRole[] = ["Sarpanch", "Municipal Corporator", "GSPCB Admin"];
const REPORT_URL = "/summary_report.pdf";

const Officer = () => {
  const [user, setUser] = useState<OfficerCredential | null>(null);
  const [role, setRole] = useState<OfficerRole>("Sarpanch");
  const [email, setEmail] = useState("");
  const [location, setLocation] = useState("");
  const [password, setPassword] = useState("");

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [hours, setHours] = useState(720);

  const allowed = user ? hasDataAccess(user) : false;
  const isAdmin = user?.role === "GSPCB Admin";

  const load = async (h = hours) => {
    setLoading(true);
    setIncidents(await fetchIncidents(h));
    setLoading(false);
  };

  useEffect(() => {
    if (!user || !allowed) return;
    load(hours);
    connectRealtimeDB();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hours, user, allowed]);

  const handleDemo = () => {
    const demo = DEMO_CREDENTIALS[role];
    setEmail(demo.email);
    setLocation(demo.location);
    setPassword(demo.password);
    setTimeout(() => {
      setUser(demo);
      toast({
        title: "Demo session started",
        description: `${demo.role} · ${demo.location}`,
      });
    }, 200);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const cred = findCredential(role, email, location, password);
    if (!cred) {
      toast({
        title: "Invalid credentials",
        description: "Check role, email, village/city/control centre and password.",
        variant: "destructive",
      });
      return;
    }
    setUser(cred);
    toast({ title: "Signed in", description: `${cred.role} · ${cred.location}` });
  };

  const handleLogout = () => {
    setUser(null);
    setEmail(""); setLocation(""); setPassword("");
  };

  const handleDownload = async () => {
    setGenerating(true);
    try {
      const response = await fetch(REPORT_URL);
      if (!response.ok) throw new Error(`Failed to download report: ${response.status}`);

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "summary_report.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast({ title: "Report downloaded", description: `${incidents.length} incident(s).` });
    } catch (e) {
      console.error(e);
      toast({ title: "PDF download failed", variant: "destructive" });
    } finally { setGenerating(false); }
  };

  const handleSubmitToGPCB = async () => {
    setSubmitting(true);
    try {
      const subject = encodeURIComponent("Maninagar CAAQMS pollution summary report");
      const body = encodeURIComponent(
        `Dear GPCB Team,\n\nPlease review the latest pollution summary report for Maninagar CAAQMS.\n\nIncidents in selected window: ${incidents.length}\n\nRegards,\nConcerned Authority Officer`
      );
      const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=ocmms.pcb@gov.in&su=${subject}&body=${body}`;
      window.open(gmailUrl, "_blank", "noopener,noreferrer");
      toast({ title: "Gmail compose opened", description: "Review the message and click Send." });
    } catch (e) {
      console.error(e);
      toast({
        title: "Could not open Gmail",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------- LOGIN ----------------
  if (!user) {
    const demo = DEMO_CREDENTIALS[role];
    return (
      <div className="min-h-screen bg-background">
        <DashboardHeader station="Officer Console" updatedAt="just now" />
        <main className="container py-8 sm:py-12 flex justify-center">
          <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-card p-6 sm:p-8 space-y-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg font-semibold">Officer Sign-in</h1>
                <p className="text-xs text-muted-foreground">
                  Sarpanch · Municipal Corporator · GSPCB Admin
                </p>
              </div>
            </div>

            <form onSubmit={handleLogin} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="role">Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as OfficerRole)}>
                  <SelectTrigger id="role"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email ID</Label>
                <Input id="email" type="email" placeholder="user@domain.in"
                  value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="location">
                  {role === "Sarpanch" ? "Village" : role === "Municipal Corporator" ? "City" : "Control Centre"}
                </Label>
                <Input id="location"
                  placeholder={role === "Sarpanch" ? "e.g. Maninagar" : role === "Municipal Corporator" ? "e.g. Ahmedabad" : "e.g. Maninagar, Ahmedabad"}
                  value={location} onChange={(e) => setLocation(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" placeholder="••••••••"
                  value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
              </div>
              <Button type="submit" className="w-full">
                <LogIn className="h-4 w-4 mr-2" /> Sign in
              </Button>
            </form>

            <div className="relative py-1">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
              <div className="relative flex justify-center text-[10px] uppercase tracking-wider">
                <span className="bg-card px-2 text-muted-foreground">Demo Mode</span>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-secondary/40 p-3 text-xs space-y-1">
              <div className="font-medium text-foreground">Demo credentials for {role}</div>
              <div className="text-muted-foreground">📧 {demo.email}</div>
              <div className="text-muted-foreground">📍 {demo.location}</div>
              <div className="text-muted-foreground">🔑 {demo.password}</div>
            </div>

            <Button type="button" variant="secondary" className="w-full" onClick={handleDemo}>
              Go for Demo as {role}
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">
              Authenticated against the official directory. Only Maninagar Sarpanch, Ahmedabad
              Municipal Corporator and Maninagar (Ahmedabad) GSPCB Admin can access live data.
            </p>
          </div>
        </main>
      </div>
    );
  }

  // ---------------- ACCESS DENIED ----------------
  if (!allowed) {
    return (
      <div className="min-h-screen bg-background">
        <DashboardHeader station={`${user.role} · ${user.location}`} updatedAt="just now" showSpikeBell />
        <main className="container py-12 flex justify-center">
          <div className="w-full max-w-lg rounded-xl border border-destructive/30 bg-card shadow-card p-8 text-center space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <LockKeyhole className="h-7 w-7" />
            </div>
            <h1 className="text-xl font-semibold">You can't access this info</h1>
            <p className="text-sm text-muted-foreground">
              Your account ({user.role} of <strong>{user.location}</strong>) is not authorised to view
              the Maninagar, Ahmedabad CAAQMS data. Only:
            </p>
            <ul className="text-xs text-muted-foreground text-left mx-auto max-w-xs space-y-1">
              <li>• Sarpanch of <strong>Maninagar</strong></li>
              <li>• Municipal Corporator of <strong>Ahmedabad</strong></li>
              <li>• GSPCB Admin of <strong>Maninagar, Ahmedabad</strong></li>
            </ul>
            <Button variant="outline" onClick={handleLogout} className="mt-2">
              <LogOut className="h-4 w-4 mr-2" /> Sign out
            </Button>
          </div>
        </main>
      </div>
    );
  }

  // ---------------- AUTHENTICATED + ALLOWED ----------------
  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader
        station={`${user.role} · ${user.location}`}
        updatedAt="just now"
        showSpikeBell
      />
      <main className="container py-4 sm:py-6 lg:py-8 space-y-4 sm:space-y-6">
        <AppNav />

        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">
              {isAdmin ? "GSPCB Admin Console" : `${user.role} Console`}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isAdmin
                ? "Live spike alerts from Maninagar CAAQMS — monitoring only."
                : "Detected pollution incidents — Maninagar CAAQMS."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select value={hours} onChange={(e) => setHours(Number(e.target.value))}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm">
              <option value={24}>Last 24h</option>
              <option value={168}>Last 7d</option>
              <option value={720}>Last 30d</option>
              <option value={2160}>Last 90d</option>
              <option value={8760}>Last 1y</option>
              <option value={999999}>All time</option>
            </select>
            <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} /> Refresh
            </Button>
            {/* PDF + Submit hidden for admin per requirement */}
            {!isAdmin && (
              <>
                <Button variant="secondary" size="sm" onClick={handleSubmitToGPCB}
                  disabled={submitting || incidents.length === 0}>
                  {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                  Submit to GPCB
                </Button>
                <Button size="sm" onClick={handleDownload} disabled={generating || incidents.length === 0}>
                  {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                  Download PDF Report
                </Button>
              </>
            )}
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" /> Sign out
            </Button>
          </div>
        </header>

        {isAdmin && <AdminSpikeFeed />}

        <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary-soft px-3 py-2 text-xs text-primary">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            Live data: <strong>CPCB Maninagar 15-min CAAQMS</strong>. Realtime DB ready —
            replace <code>connectRealtimeDB()</code> with your stream.
          </span>
        </div>

        <section className="rounded-xl border border-border bg-card shadow-card">
          <header className="flex items-center gap-2 border-b border-border px-4 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <FileText className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Pollution Incidents</h2>
              <p className="text-xs text-muted-foreground">
                {loading ? "Loading…" : `${incidents.length} incident(s) in the selected window`}
              </p>
            </div>
          </header>

          <div className="overflow-x-auto">
            <div className="min-w-[860px]">
              <table className="w-full border-separate border-spacing-y-1.5 text-sm px-4 py-3">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="font-medium px-3 py-2">ID</th>
                    <th className="font-medium px-3 py-2">From</th>
                    <th className="font-medium px-3 py-2">Duration</th>
                    <th className="font-medium px-3 py-2">Pollutants</th>
                    <th className="font-medium px-3 py-2">Zone</th>
                    <th className="font-medium px-3 py-2">Cause</th>
                    <th className="font-medium px-3 py-2">Severity</th>
                  </tr>
                </thead>
                <tbody>
                  {incidents.length === 0 && !loading && (
                    <tr><td colSpan={7} className="px-3 py-8 text-center text-sm text-muted-foreground">No incidents in this window.</td></tr>
                  )}
                  {incidents.slice(0, 200).map((i) => (
                    <tr key={i.id} className="bg-secondary/40 hover:bg-secondary transition-colors">
                      <td className="px-3 py-2.5 rounded-l-lg font-medium tabular-nums text-xs">{i.id}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground tabular-nums">{fmtDateTime(i.from)}</td>
                      <td className="px-3 py-2.5 text-xs tabular-nums">{i.durationHours}h</td>
                      <td className="px-3 py-2.5 text-xs"><span className="text-muted-foreground">{i.pollutants.join(", ")}</span></td>
                      <td className="px-3 py-2.5 text-xs">{i.zone}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{i.category}</td>
                      <td className="px-3 py-2.5 rounded-r-lg">
                        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1", severityStyle[i.severity])}>
                          {i.severity}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

/** Admin-only: live feed of recent spikes (replaces PDF/submit workflow). */
const AdminSpikeFeed = () => {
  const [spikes, setSpikes] = useState<SpikeAlert[]>([]);
  const [faults, setFaults] = useState<FaultAlert[]>([]);

  useEffect(() => {
    const off = realtime.subscribeSpike((s) => {
      setSpikes((prev) => [s, ...prev].slice(0, 20));
    });
    const faultOff = realtime.subscribeFault((f) => {
      setFaults((prev) => [f, ...prev].slice(0, 20));
    });
    const seed = realtime.getLatestSpike();
    if (seed) setSpikes([seed]);
    const faultSeed = realtime.getLatestFault();
    if (faultSeed) setFaults([faultSeed]);
    return () => { off(); faultOff(); };
  }, []);

  const dispatchFault = (faultId: string) => {
    const fault = faults.find((f) => f.id === faultId);
    if (!fault) return;

    const subject = encodeURIComponent(`Maintenance dispatch: ${fault.pollutant} sensor fault`);
    const body = encodeURIComponent(
      `Dear Senior Head Engineer,\n\n`
      + `A possible sensor fault has been detected on the Maninagar CAAQMS feed.\n\n`
      + `Pollutant: ${fault.pollutant}\n`
      + `Stuck value: ${fault.value}\n`
      + `Consecutive readings: ${fault.streak}\n`
      + `Location: ${fault.zone}\n`
      + `Time: ${new Date(fault.ts).toLocaleString()}\n\n`
      + `Please review and dispatch maintenance.\n\n`
      + `Regards,\nAir Quality Guardian`
    );

    window.open(
      `https://mail.google.com/mail/?view=cm&fs=1&to=see-gspcb@gov.in&su=${subject}&body=${body}`,
      "_blank",
      "noopener,noreferrer"
    );

    setFaults((prev) =>
      prev.map((f) => (f.id === faultId ? { ...f, status: "DISPATCHED" as const } : f))
    );
  };

  return (
    <section className="rounded-xl border border-status-hazardous/20 bg-status-hazardous-soft/40 p-4 sm:p-5 space-y-4">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-status-hazardous" />
        <h2 className="text-sm font-semibold">Latest Spike Alerts</h2>
        <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">
          live · realtime DB ready
        </span>
      </div>
      <div className="rounded-lg border border-border bg-card p-3 space-y-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-status-hazardous" />
          <h3 className="text-sm font-semibold">Sensor Faults</h3>
          <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">
            3 same readings
          </span>
        </div>
        {faults.length === 0 ? (
          <p className="text-xs text-muted-foreground">No stuck sensors detected yet.</p>
        ) : (
          <ul className="space-y-2">
            {faults.map((f) => (
              <li key={f.id} className="rounded-lg border border-border px-3 py-2 bg-secondary/40">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">
                      {f.pollutant} stuck at {f.value}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {f.zone} · {f.streak} consecutive readings · {new Date(f.ts).toLocaleString()}
                    </div>
                  </div>
                  <span className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1",
                    f.status === "DISPATCHED"
                      ? "bg-status-good-soft text-status-good ring-status-good/20"
                      : "bg-status-hazardous-soft text-status-hazardous ring-status-hazardous/20"
                  )}>
                    {f.status}
                  </span>
                </div>
                {f.status === "PENDING" && (
                  <div className="mt-2">
                    <Button size="sm" variant="secondary" onClick={() => dispatchFault(f.id)}>
                      Dispatch maintenance
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {spikes.length === 0 ? (
        <p className="text-xs text-muted-foreground">Monitoring stream… spikes will appear here as soon as thresholds are exceeded.</p>
      ) : (
        <ul className="space-y-2">
          {spikes.map((s) => (
            <li key={s.id} className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2">
              <div>
                <div className="text-sm font-medium">{s.pollutant} surge — AQI {s.aqi}</div>
                <div className="text-xs text-muted-foreground">
                  {s.value} · {s.zone} · {new Date(s.ts).toLocaleString()}
                </div>
              </div>
              <span className={cn("shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1",
                s.aqi > 300
                  ? "bg-status-hazardous-soft text-status-hazardous ring-status-hazardous/20"
                  : "bg-status-unhealthy-soft text-status-unhealthy ring-status-unhealthy/20")}>
                {s.band}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default Officer;
