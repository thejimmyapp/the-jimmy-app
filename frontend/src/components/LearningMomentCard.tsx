import type { MomentGlyph } from "../guestProgress";

export interface MomentBoardContext {
  white_pocket: string;
  black_pocket: string;
  white_clock: string;
  black_clock: string;
}

export interface LearningMomentCardProps {
  position: string[][];
  position_board: "A" | "B";
  played_move: string;
  boards: Record<"A" | "B", MomentBoardContext>;
  glyph: MomentGlyph;
  alternative_move: string;
  answer: string;
  author_guest_number: number;
  game_id: number;
  move_token: string;
}

const momentPrompts: Record<MomentGlyph, string> = {
  "!": "[COPY-PLACEHOLDER] Show a move you might have played instead — and why it's worse.",
  "?": "[COPY-PLACEHOLDER] What should they have played, and what did they miss?",
  "!!": "[COPY-PLACEHOLDER] What makes this one hard to find?",
  "??": "[COPY-PLACEHOLDER] What's the punishment?",
  "!?": "[COPY-PLACEHOLDER] What risk did they accept?",
  "?!": "[COPY-PLACEHOLDER] What's the safer option?",
};

const pieceGlyphs: Record<string, string> = {
  K: "♔",
  Q: "♕",
  R: "♖",
  B: "♗",
  N: "♘",
  P: "♙",
  k: "♚",
  q: "♛",
  r: "♜",
  b: "♝",
  n: "♞",
  p: "♟",
};

const pocketLabel = (pocket: string) => pocket.trim() || "Empty";

function PositionBoard({ board, position, move_token }: Pick<LearningMomentCardProps, "position" | "move_token"> & { board: "A" | "B" }) {
  return (
    <div
      className="learning-moment__board"
      role="img"
      aria-label={`Board ${board} position at ${move_token}`}
    >
      {Array.from({ length: 64 }, (_, index) => {
        const rank = Math.floor(index / 8);
        const file = index % 8;
        const piece = position[rank]?.[file] ?? "";
        return (
          <span
            aria-hidden="true"
            className={`learning-moment__square ${(rank + file) % 2 ? "learning-moment__square--dark" : "learning-moment__square--light"}`}
            key={`${rank}-${file}`}
          >
            {pieceGlyphs[piece] ?? ""}
          </span>
        );
      })}
    </div>
  );
}

function PocketBoard({ board, context }: { board: "A" | "B"; context: MomentBoardContext }) {
  return (
    <section className="learning-moment__pocket-board" aria-label={`Board ${board} pockets`}>
      <h4>Board {board}</h4>
      <div><span>White</span><strong>{pocketLabel(context.white_pocket)}</strong></div>
      <div><span>Black</span><strong>{pocketLabel(context.black_pocket)}</strong></div>
    </section>
  );
}

export function LearningMomentCard(props: LearningMomentCardProps) {
  const address = `${props.game_id} · ${props.move_token}`;

  return (
    <article className="learning-moment-card">
      <header className="learning-moment__header">
        <div>
          <span className="learning-moment__kicker">LEARNING MOMENT</span>
          <h3>SirGuest#{props.author_guest_number}</h3>
        </div>
        <code className="learning-moment__address" aria-label={`Moment address ${address}`}>{address}</code>
      </header>

      <div className="learning-moment__position-row">
        <div>
          <div className="learning-moment__board-label">Position · Board {props.position_board}</div>
          <PositionBoard board={props.position_board} position={props.position} move_token={props.move_token} />
          <p className="learning-moment__played"><span>Played</span><strong>{props.played_move}</strong></p>
        </div>

        <div className="learning-moment__annotation">
          <span className="learning-moment__glyph" aria-label={`Annotation ${props.glyph}`}>{props.glyph}</span>
          <div>
            <span className="learning-moment__field-label">Question answered</span>
            <p className="learning-moment__prompt" data-copy-placeholder="true">{momentPrompts[props.glyph]}</p>
          </div>
          <div className="learning-moment__alternative">
            <span className="learning-moment__field-label">Alternative move</span>
            <strong>{props.alternative_move}</strong>
          </div>
        </div>
      </div>

      <section className="learning-moment__coupled" aria-labelledby={`pockets-${props.game_id}-${props.move_token}`}>
        <h3 id={`pockets-${props.game_id}-${props.move_token}`}>Both boards’ pockets at this ply</h3>
        <div className="learning-moment__pocket-grid">
          <PocketBoard board="A" context={props.boards.A} />
          <PocketBoard board="B" context={props.boards.B} />
        </div>
      </section>

      <section className="learning-moment__clocks" aria-labelledby={`clocks-${props.game_id}-${props.move_token}`}>
        <h3 id={`clocks-${props.game_id}-${props.move_token}`}>Four-clock snapshot</h3>
        <table className="learning-moment__clock-matrix" aria-label="All clocks at this ply">
          <thead>
            <tr><td /><th scope="col">White</th><th scope="col">Black</th></tr>
          </thead>
          <tbody>
            <tr><th scope="row">Board A</th><td><time>{props.boards.A.white_clock}</time></td><td><time>{props.boards.A.black_clock}</time></td></tr>
            <tr><th scope="row">Board B</th><td><time>{props.boards.B.white_clock}</time></td><td><time>{props.boards.B.black_clock}</time></td></tr>
          </tbody>
        </table>
      </section>

      <section className="learning-moment__answer">
        <span className="learning-moment__field-label">SirGuest#{props.author_guest_number} wrote</span>
        <p>{props.answer}</p>
      </section>
    </article>
  );
}
