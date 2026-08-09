export type ExtractionInput =
  | { kind: "username"; username: string }
  | { kind: "game"; gameId: string; perspective: string | null }
  | { kind: "invalid" };

export function parseExtractionInput(value: string): ExtractionInput {
  const input = value.trim();

  if (!input) {
    return { kind: "invalid" };
  }

  try {
    const url = new URL(input);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    const gameMatch = url.pathname.match(/^\/game\/live\/(\d+)\/?$/);

    if (hostname === "chess.com" && gameMatch) {
      const perspective = url.searchParams.get("username")?.trim() || null;
      return { kind: "game", gameId: gameMatch[1], perspective };
    }

    return { kind: "invalid" };
  } catch {
    if (input.includes("://")) {
      return { kind: "invalid" };
    }

    return { kind: "username", username: input };
  }
}
