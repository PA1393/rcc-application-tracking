import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Returns true and redirects to /login when the response is 401/403.
// Call this on every protected fetch so an expired session never silently
// looks like "empty data" or "save succeeded".
export function handleAuthFailure(res: Response): boolean {
  if (res.status === 401 || res.status === 403) {
    if (typeof window !== "undefined") {
      window.location.href = "/login?error=SessionExpired";
    }
    return true;
  }
  return false;
}
