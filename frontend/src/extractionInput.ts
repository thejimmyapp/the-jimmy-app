export type ExtractionInput =
  | { kind: "username"; username: string }
  | { kind: "game"; gameId: string; perspective: string | null }
  | { kind: "viewer"; gameId: string; moveAddress: string | null }
  | { kind: "move"; moveAddress: string }
  | { kind: "invalid" };

const MOVE_ADDRESS_PATTERN = /^[1-9]\d*[AaBb]$/;

export function isMoveAddress(value: string): boolean {
  return MOVE_ADDRESS_PATTERN.test(value);
}

export function extractionSharePath(gameId: string, moveAddress: string): string {
  if (!/^[1-9]\d*$/.test(gameId) || !isMoveAddress(moveAddress)) {
    throw new Error("A positive game id and canonical move address are required.");
  }
  return `/extraction?game=${encodeURIComponent(gameId)}&move=${encodeURIComponent(moveAddress)}`;
}

export function parseExtractionInput(value: string): ExtractionInput {
  const input = value.trim();

  if (!input) {
    return { kind: "invalid" };
  }

  if (isMoveAddress(input)) {
    return { kind: "move", moveAddress: input };
  }

  if (/^[1-9]\d*$/.test(input)) {
    return { kind: "game", gameId: input, perspective: null };
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

      if (/^[1-9]\d*$/.test(gameId) && (!moveAddress || isMoveAddress(moveAddress))) {
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
