export interface EvaluationScore {
  mate_in?: number | null;
  score_cp?: number | null;
}

export const formatEvaluation = ({ mate_in, score_cp }: EvaluationScore) => {
  if (typeof mate_in === "number" && Number.isFinite(mate_in)) return `mate ${mate_in}`;
  if (typeof score_cp === "number" && Number.isFinite(score_cp)) return (score_cp / 100).toFixed(2);
  return "unknown";
};
