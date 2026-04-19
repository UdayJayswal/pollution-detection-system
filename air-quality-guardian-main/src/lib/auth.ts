/**
 * Auth shim — single source of truth for the access token.
 *
 * Today: returns whatever is in localStorage under "auth_token" (or null).
 * Tomorrow: swap the body of `getAuthToken()` to read from Lovable Cloud
 * (e.g. `supabase.auth.getSession()`), Auth0, Clerk, or a custom JWT —
 * no other file in the app needs to change. The API client in
 * `src/lib/api.ts` automatically attaches `Authorization: Bearer <token>`
 * to every request when a token is present.
 *
 * To gate routes by role later, wrap them in a <RequireAuth> component
 * and check `getCurrentUser()`.
 */

const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";

export interface AuthUser {
  id: string;
  email?: string;
  role?: "citizen" | "officer" | "admin";
  name?: string;
}

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getCurrentUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function setSession(token: string, user: AuthUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function hasRole(role: AuthUser["role"]): boolean {
  const u = getCurrentUser();
  return !!u && (u.role === role || u.role === "admin");
}
