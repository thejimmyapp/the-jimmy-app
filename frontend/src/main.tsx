import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { LegalPage } from "./components/LegalPage";
import { PuzzlePlayer } from "./components/PuzzlePlayer";
import { ExtractionPage } from "./ExtractionPage";
import { setCanonicalUrl } from "./publicUrl";
import "./styles.css";

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } });

setCanonicalUrl(location.pathname);

const puzzleMatch = location.pathname.match(/^\/puzzle\/([a-f0-9]{40})\/?$/i);
const isExtractionPage = location.pathname.replace(/\/+$/, "") === "/extraction";
const legalPage = location.pathname.replace(/\/+$/, "") === "/privacy"
  ? "privacy"
  : location.pathname.replace(/\/+$/, "") === "/terms"
    ? "terms"
    : null;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {isExtractionPage ? <ExtractionPage /> : legalPage ? <LegalPage page={legalPage} /> : puzzleMatch ? <PuzzlePlayer puzzleId={puzzleMatch[1]} /> : <App />}
    </QueryClientProvider>
  </StrictMode>,
);
