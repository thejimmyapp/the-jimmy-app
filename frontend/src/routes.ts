export type LegalPageRoute = "privacy" | "terms" | "notices";

export const legalPageFromPath = (pathname: string): LegalPageRoute | null => {
  const normalized = pathname.replace(/\/+$/, "");
  if (normalized === "/privacy") return "privacy";
  if (normalized === "/terms") return "terms";
  if (normalized === "/third-party-notices") return "notices";
  return null;
};
