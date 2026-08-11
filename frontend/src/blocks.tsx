/* eslint-disable react-refresh/only-export-components */
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { EvalCard, type EvalCardProps } from "./components/EvalCard";
import { LearningMomentCard, type LearningMomentCardProps } from "./components/LearningMomentCard";

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

const fixturePosition = [
  ["r", "", "b", "q", "", "r", "k", ""],
  ["p", "p", "", "", "b", "p", "p", "p"],
  ["", "", "n", "p", "", "n", "", ""],
  ["", "", "p", "", "p", "", "", ""],
  ["", "", "", "", "P", "", "", ""],
  ["", "", "N", "P", "", "N", "", ""],
  ["P", "P", "P", "", "B", "P", "P", "P"],
  ["R", "", "B", "Q", "", "R", "K", ""],
];

const momentFixtureBase: LearningMomentCardProps = {
  position: fixturePosition,
  position_board: "A",
  played_move: "Nxf7",
  boards: {
    A: { white_pocket: "PN", black_pocket: "q", white_clock: "1:14.2", black_clock: "0:48.9" },
    B: { white_pocket: "BR", black_pocket: "ppn", white_clock: "0:57.0", black_clock: "1:21.6" },
  },
  glyph: "?",
  alternative_move: "P@f7+",
  answer: "The drop forces the king away before the file opens.",
  author_guest_number: 13,
  game_id: 180731271553,
  move_token: "17A",
};

const momentFixtures: Array<{ label: string; props: LearningMomentCardProps }> = [
  {
    label: "! · tempting alternative",
    props: { ...momentFixtureBase, glyph: "!", played_move: "Bxh7+", alternative_move: "Q@h5", answer: "The queen drop looks loud, but it gives Black time to cover h7." },
  },
  {
    label: "? · missed resource",
    props: { ...momentFixtureBase, glyph: "?", move_token: "18A", played_move: "Kh1", alternative_move: "N@e5+", answer: "The knight drop checks and blocks the diagonal at the same time." },
  },
  {
    label: "!! · hard to find",
    props: { ...momentFixtureBase, glyph: "!!", move_token: "21B", position_board: "B", played_move: "R@h8+", alternative_move: "R@h8+", answer: "Giving up the rook clears the pocket timing for the board-A attack." },
  },
  {
    label: "?? · punishment",
    props: { ...momentFixtureBase, glyph: "??", move_token: "24A", played_move: "gxh3", alternative_move: "Q@h2+", answer: "Black can force mate because the king has no flight square and the partner cannot send a defender in time." },
  },
  {
    label: "!? · accepted risk",
    props: { ...momentFixtureBase, glyph: "!?", move_token: "27B", position_board: "B", played_move: "P@g7", alternative_move: "N@f6+", answer: "The pawn drop keeps the initiative but leaves the back rank dependent on one incoming piece." },
  },
  {
    label: "?! · safer option",
    props: { ...momentFixtureBase, glyph: "?!", move_token: "31A", played_move: "Qh5", alternative_move: "B@e3", answer: "The bishop drop protects the king while keeping the queen available for the next transfer." },
  },
  {
    label: "Empty pockets on both boards",
    props: {
      ...momentFixtureBase,
      move_token: "34B",
      position_board: "B",
      glyph: "?",
      boards: {
        A: { white_pocket: "", black_pocket: "", white_clock: "0:32.8", black_clock: "0:29.4" },
        B: { white_pocket: "", black_pocket: "", white_clock: "0:41.1", black_clock: "0:18.7" },
      },
      answer: "There was nothing available to drop on either board at this ply.",
    },
  },
  {
    label: "Long written answer",
    props: {
      ...momentFixtureBase,
      move_token: "39A",
      glyph: "!!",
      played_move: "N@f6+",
      alternative_move: "Q@h7+",
      answer: "The first idea was to drop the queen immediately because the check is forcing, but that spends the only heavy piece in hand before the partner board resolves. The knight drop keeps the king boxed in, protects the attacking queen, and buys one tempo for Board B to capture a bishop. If that bishop arrives, the diagonal becomes decisive; if it does not, the knight can still be traded without opening our own king. The move is difficult because its value comes from both clocks, both pockets, and a transfer that has not happened yet—not from the local board alone.",
    },
  },
];

function LearningMomentFixtures() {
  return (
    <div className="moment-fixture-grid">
      {momentFixtures.map((fixture) => (
        <section className="moment-fixture" key={fixture.label}>
          <h3 className="moment-fixture__label">{fixture.label}</h3>
          <LearningMomentCard {...fixture.props} />
        </section>
      ))}
    </div>
  );
}

const root = document.getElementById("eval-card-fixtures");
if (root) {
  createRoot(root).render(<StrictMode><EvalCardFixtures /></StrictMode>);
}

const momentRoot = document.getElementById("moment-card-fixtures");
if (momentRoot) {
  createRoot(momentRoot).render(<StrictMode><LearningMomentFixtures /></StrictMode>);
}
