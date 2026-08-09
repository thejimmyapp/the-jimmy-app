import { useEffect, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import "./ExtractionPage.css";
import { parseExtractionInput } from "./extractionInput";
import type { ExtractionInput } from "./extractionInput";

export function ExtractionPage() {
  const [input, setInput] = useState("");
  const [recognized, setRecognized] = useState<ExtractionInput | null>(null);

  useEffect(() => {
    document.title = "Data Extraction & UI Element Gathering.";
  }, []);

  const recognizeInput = () => {
    setRecognized(parseExtractionInput(input));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    recognizeInput();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      recognizeInput();
    }
  };

  return (
    <main className="extraction-page">
      <section className="extraction-page__content" aria-labelledby="extraction-title">
        <h1 id="extraction-title">Data Extraction &amp; UI Element Gathering.</h1>
        <form className="extraction-page__form" onSubmit={handleSubmit}>
          <input
            aria-label="Username or bughouse game URL"
            autoFocus
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="enter username or bughouse game url — e.g. https://www.chess.com/game/live/180565671769?username=fearingforfreddy"
            type="text"
            value={input}
          />
        </form>
        {recognized?.kind === "username" ? (
          <p className="extraction-page__result">username: {recognized.username}</p>
        ) : recognized?.kind === "game" ? (
          <p className="extraction-page__result">
            game URL: id {recognized.gameId}
            {recognized.perspective ? `, perspective ${recognized.perspective}` : ""}
          </p>
        ) : recognized?.kind === "invalid" ? (
          <p className="extraction-page__result">unrecognized input</p>
        ) : null}
      </section>
    </main>
  );
}
