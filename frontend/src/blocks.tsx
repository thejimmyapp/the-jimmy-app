/* eslint-disable react-refresh/only-export-components */
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { EvalCard, type EvalCardProps } from "./components/EvalCard";

const fixtures: Array<{ label: string; props: Omit<EvalCardProps, "enabled" | "onEnabledChange"> }> = [
  {
    label: "Normal centipawn score · two drops in line",
    props: {
      engine_identity: "Fairy-Stockfish 14.0",
      depth: 16,
      status: "complete",
      score_cp: 137,
      white_pocket: "PNQ",
      black_pocket: "br",
      principal_lines: [
        { rank: 1, moves: ["P@f7+", "Kxf7", "N@e5+", "Kg8"] },
        { rank: 2, moves: ["Q@h7+", "Kxh7", "B@d3+"] },
      ],
    },
  },
  {
    label: "Mate score",
    props: {
      engine_identity: "Fairy-Stockfish 14.0",
      depth: 18,
      status: "complete",
      mate_in: 3,
      white_pocket: "Q",
      black_pocket: "p",
      principal_lines: [{ rank: 1, moves: ["Q@h7+", "Kxh7", "R@h3+"] }],
    },
  },
  {
    label: "Unknown score",
    props: {
      engine_identity: "Fairy-Stockfish 14.0",
      depth: 12,
      status: "complete",
      white_pocket: "N",
      black_pocket: "—",
      principal_lines: [{ rank: 1, moves: ["N@e5", "Kh8"] }],
    },
  },
  {
    label: "Failed job",
    props: {
      engine_identity: "Fairy-Stockfish 14.0",
      depth: 16,
      status: "failed",
      white_pocket: "PB",
      black_pocket: "nr",
      failure_message: "Engine timed out before returning a score.",
    },
  },
  {
    label: "Idle",
    props: { engine_identity: "Fairy-Stockfish 14.0", depth: 16, status: "idle", white_pocket: "P", black_pocket: "n" },
  },
  {
    label: "Analysing",
    props: { engine_identity: "Fairy-Stockfish 14.0", depth: 16, status: "analysing", white_pocket: "P", black_pocket: "n" },
  },
  {
    label: "Unsupported variant",
    props: { engine_identity: "Fairy-Stockfish 14.0", depth: 16, status: "unsupported-variant", white_pocket: "P", black_pocket: "n" },
  },
];

function EvalCardFixtures() {
  const [enabled, setEnabled] = useState<Record<number, boolean>>(() => Object.fromEntries(fixtures.map((_, index) => [index, index < 4])));
  return (
    <div className="eval-fixture-grid">
      {fixtures.map((fixture, index) => (
        <section className="eval-fixture" key={fixture.label}>
          <h3 className="eval-fixture__label">{fixture.label}</h3>
          <EvalCard
            {...fixture.props}
            enabled={enabled[index] ?? false}
            onEnabledChange={(nextEnabled) => setEnabled((current) => ({ ...current, [index]: nextEnabled }))}
          />
        </section>
      ))}
    </div>
  );
}

const root = document.getElementById("eval-card-fixtures");
if (root) {
  createRoot(root).render(<StrictMode><EvalCardFixtures /></StrictMode>);
}
