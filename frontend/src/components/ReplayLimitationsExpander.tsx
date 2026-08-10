import { AlertTriangle } from "lucide-react";
import { AnalysisLimitations } from "./AnalysisAcknowledgement";

export function ReplayLimitationsExpander({ notices }: { notices: string[] }) {
  return (
    <details className="replay-limits-expander">
      <summary>what this replay can and cannot tell you</summary>
      <div className="replay-limits-expander-content">
        {notices.length > 0 && <div className="replay-integrity" role="status"><AlertTriangle size={15} /><strong>REPLAY LIMITS</strong><span>{notices.join(" ")}</span></div>}
        <AnalysisLimitations compact />
      </div>
    </details>
  );
}
