import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BoardPanel } from "./BoardPanel";
import { useCoachStore } from "../store";

describe("incomplete second-board state", () => {
  afterEach(cleanup);
  beforeEach(() => {
    useCoachStore.setState({ game: null, roomId: null, globalPly: 0 });
  });

  it("states the missing data plainly and offers safe recovery actions", () => {
    const onImport = vi.fn();
    render(
      <BoardPanel
        boardId="B"
        position={null}
        orientation="black"
        pieceStyle="solid"
        title="Second Board"
        playerTop="Diagonal Opponent Unknown"
        playerBottom="Partner Unknown"
        unavailable
        onImportBothBoards={onImport}
        externalFallbackUrl="https://bmacho.github.io/bughouse-viewer/view.html?game_id=123"
      />,
    );

    expect(screen.getByText("The second board was not included in the available Chess.com data.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Import both board PGNs" }));
    expect(onImport).toHaveBeenCalledOnce();
    const fallback = screen.getByRole("link", { name: /Open this game in bMacho/ });
    expect(fallback.getAttribute("target")).toBe("_blank");
    expect(fallback.getAttribute("rel")).toBe("noreferrer");

    fireEvent.click(screen.getByRole("button", { name: "Continue one-board review" }));
    expect(screen.getByText("Continuing with First Board only.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show recovery actions" })).toBeTruthy();
  });
});
