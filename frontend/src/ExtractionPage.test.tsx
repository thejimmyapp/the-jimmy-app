import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ExtractionPage } from "./ExtractionPage";
import { parseExtractionInput } from "./extractionInput";

describe("parseExtractionInput", () => {
  it("recognizes a username", () => {
    expect(parseExtractionInput(" fearingforfreddy ")).toEqual({
      kind: "username",
      username: "fearingforfreddy",
    });
  });

  it("recognizes a Chess.com live-game URL and perspective", () => {
    expect(
      parseExtractionInput(
        "https://www.chess.com/game/live/180565671769?username=fearingforfreddy",
      ),
    ).toEqual({
      kind: "game",
      gameId: "180565671769",
      perspective: "fearingforfreddy",
    });
  });
});

describe("ExtractionPage", () => {
  it("submits both stub input paths without making a request", () => {
    render(<ExtractionPage />);
    const input = screen.getByRole("textbox", { name: "Username or bughouse game URL" });

    fireEvent.change(input, { target: { value: "fearingforfreddy" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText("username: fearingforfreddy")).toBeTruthy();

    fireEvent.change(input, {
      target: {
        value: "https://www.chess.com/game/live/180565671769?username=fearingforfreddy",
      },
    });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(
      screen.getByText(
        "game URL: id 180565671769, perspective fearingforfreddy",
      ),
    ).toBeTruthy();
  });
});
