export type ExtractionInput =
  | { kind: "username"; username: string }
  | { kind: "game"; gameId: string; perspective: string | null }
  | { kind: "viewer"; gameId: string; moveAddress: string | null }
  | { kind: "move"; moveAddress: string }
  | { kind: "invalid" };

const MOVE_ADDRESS_PATTERN = /^[1-9]\d*[AaBb]$/;

export function parseExtractionInput(value: string): ExtractionInput {
  const input = value.trim();

  if (!input) {
    return { kind: "invalid" };
  }

  if (MOVE_ADDRESS_PATTERN.test(input)) {
    return { kind: "move", moveAddress: input };
  }

  try {
    const url = new URL(input);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    const gameMatch = url.pathname.match(/^\/game\/live\/(\d+)\/?$/);

    if (hostname === "chess.com" && gameMatch) {
      const perspective = url.searchParams.get("username")?.trim() || null;
      return { kind: "game", gameId: gameMatch[1], perspective };
    }

    const isViewerUrl =
      hostname === "bmacho.github.io" &&
      url.pathname === "/bughouse-viewer/view.html";

    if (isViewerUrl) {
      const gameId = url.searchParams.get("game_id")?.trim() || "";
      const moveAddress = url.searchParams.get("move")?.trim() || null;

      if (/^\d+$/.test(gameId) && (!moveAddress || MOVE_ADDRESS_PATTERN.test(moveAddress))) {
        return { kind: "viewer", gameId, moveAddress };
      }
    }

    return { kind: "invalid" };
  } catch {
    if (input.includes("://")) {
      return { kind: "invalid" };
    }

    return { kind: "username", username: input };
  }
}
