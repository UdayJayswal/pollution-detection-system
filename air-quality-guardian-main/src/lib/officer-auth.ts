/**
 * Officer / Sarpanch / Admin login directory — derived from file3.xlsx.
 * Access policy: ONLY these specific assignments may view live Maninagar data.
 *   - Sarpanch of Maninagar
 *   - Municipal Corporator of Ahmedabad
 *   - GSPCB Admin of Maninagar, Ahmedabad
 * Everyone else authenticates but receives an "access denied" message.
 */

export type OfficerRole = "Sarpanch" | "Municipal Corporator" | "GSPCB Admin";

export interface OfficerCredential {
  role: OfficerRole;
  email: string;
  location: string;
  password: string;
}

export const OFFICER_DIRECTORY: OfficerCredential[] = [
  { role: "Sarpanch", email: "sarpanch1@rural.in", location: "Maninagar", password: "SP@1234" },
  { role: "Sarpanch", email: "sarpanch2@rural.in", location: "Maninagar", password: "SP@1235" },
  { role: "Sarpanch", email: "sarpanch3@rural.in", location: "Dabhoi", password: "SP@1236" },
  { role: "Sarpanch", email: "sarpanch4@rural.in", location: "Karjan", password: "SP@1237" },
  { role: "Sarpanch", email: "sarpanch5@rural.in", location: "Bhavnath", password: "SP@1238" },
  { role: "Municipal Corporator", email: "corporator1@city.in", location: "Vadodara", password: "MC@2234" },
  { role: "Municipal Corporator", email: "corporator2@city.in", location: "Ahmedabad", password: "MC@2235" },
  { role: "Municipal Corporator", email: "corporator3@city.in", location: "Surat", password: "MC@2236" },
  { role: "Municipal Corporator", email: "corporator4@city.in", location: "Rajkot", password: "MC@2237" },
  { role: "Municipal Corporator", email: "corporator5@city.in", location: "Ahmedabad", password: "MC@2238" },
  { role: "GSPCB Admin", email: "admin1@gspcb.in", location: "Maninagar, Ahmedabad", password: "GA@3234" },
  { role: "GSPCB Admin", email: "admin2@gspcb.in", location: "Maninagar, Ahmedabad", password: "GA@3235" },
  { role: "GSPCB Admin", email: "admin3@gspcb.in", location: "Maninagar, Ahmedabad", password: "GA@3236" },
  { role: "GSPCB Admin", email: "admin4@gspcb.in", location: "Odhav, Ahmedabad", password: "GA@3237" },
  { role: "GSPCB Admin", email: "admin5@gspcb.in", location: "Geetamandir, Ahmedabad", password: "GA@3238" },
];

/** Default demo credential per role (auto-fill in demo mode). */
export const DEMO_CREDENTIALS: Record<OfficerRole, OfficerCredential> = {
  Sarpanch: OFFICER_DIRECTORY[0], // Maninagar — has access
  "Municipal Corporator": OFFICER_DIRECTORY[6], // Ahmedabad — has access
  "GSPCB Admin": OFFICER_DIRECTORY[10], // Maninagar, Ahmedabad — has access
};

export function findCredential(
  role: OfficerRole,
  email: string,
  location: string,
  password: string,
): OfficerCredential | null {
  const e = email.trim().toLowerCase();
  const l = location.trim().toLowerCase();
  return (
    OFFICER_DIRECTORY.find(
      (c) =>
        c.role === role &&
        c.email.toLowerCase() === e &&
        c.location.toLowerCase() === l &&
        c.password === password,
    ) ?? null
  );
}

/** Locations whose user is allowed to see the Maninagar dashboard data. */
export function hasDataAccess(c: OfficerCredential): boolean {
  if (c.role === "Sarpanch") return c.location.toLowerCase() === "maninagar";
  if (c.role === "Municipal Corporator") return c.location.toLowerCase() === "ahmedabad";
  if (c.role === "GSPCB Admin") return c.location.toLowerCase() === "maninagar, ahmedabad";
  return false;
}
