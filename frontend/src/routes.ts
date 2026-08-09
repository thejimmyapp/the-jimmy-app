export type LegalPageRoute = "privacy" | "terms";

export const legalPageFromPath = (pathname: string): LegalPageRoute | null => {
  const normalized = pathname.replace(/\/+$/, "");
  if (normalized === "/privacy") return "privacy";
  if (normalized === "/terms") return "terms";
  return null;
};
