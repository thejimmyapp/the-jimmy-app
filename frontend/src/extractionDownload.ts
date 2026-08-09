import { matchupCardText } from "./extractionData";
import type { NormalizedMatch, PublicPlayer } from "./extractionData";

export type ExtractionDownloadFormat = "json" | "txt";

export interface ExtractionSnapshot {
  schema: "thejimmyapp.extraction.v1";
  exported_at: string;
  source_input: string;
  capabilities: {
    normalized_match: "available" | "not loaded";
    public_profile_stats: "available" | "not loaded";
    moment_address: "available" | "not built";
    moves: "pending decoder";
  };
  loaded_game_id: string | null;
  moment_address: {
    token: string;
    path: string;
    url: string;
  } | null;
  normalized_match: (NormalizedMatch & { matchup_summary: string }) | null;
  public_player: {
    summary: {
      username: string;
      display_name: string;
      avatar: string | null;
      profile_url: string;
      archives_url: string;
      bughouse_rating: number | null;
      bughouse_rating_path: "live_bughouse[].score" | null;
    };
    raw_profile: Record<string, unknown>;
    raw_stats: Record<string, unknown>;
    bughouse_leaderboard_entry: Record<string, unknown> | null;
  } | null;
}

interface SnapshotInput {
  sourceInput: string;
  origin: string;
  match: NormalizedMatch | null;
  loadedGameId: string | null;
  moveAddress: string;
  sharePath: string | null;
  player: PublicPlayer | null;
  exportedAt?: string;
}

export function buildExtractionSnapshot({
  sourceInput,
  origin,
  match,
  loadedGameId,
  moveAddress,
  sharePath,
  player,
  exportedAt = new Date().toISOString(),
}: SnapshotInput): ExtractionSnapshot {
  const momentAddress = sharePath
    ? {
        token: moveAddress.trim(),
        path: sharePath,
        url: new URL(sharePath, origin).toString(),
      }
    : null;

  return {
    schema: "thejimmyapp.extraction.v1",
    exported_at: exportedAt,
    source_input: sourceInput.trim(),
    capabilities: {
      normalized_match: match ? "available" : "not loaded",
      public_profile_stats: player ? "available" : "not loaded",
      moment_address: momentAddress ? "available" : "not built",
      moves: "pending decoder",
    },
    loaded_game_id: loadedGameId,
    moment_address: momentAddress,
    normalized_match: match ? { ...match, matchup_summary: matchupCardText(match) } : null,
    public_player: player
      ? {
          summary: {
            username: player.username,
            display_name: player.displayName,
            avatar: player.avatar,
            profile_url: player.profileUrl,
            archives_url: player.archivesUrl,
            bughouse_rating: player.bughouseRating,
            bughouse_rating_path: player.bughouseRatingPath,
          },
          raw_profile: player.profileData,
          raw_stats: player.statsData,
          bughouse_leaderboard_entry: player.bughouseLeaderboardEntry,
        }
      : null,
  };
}

function readableKey(key: string): string {
  return key.replaceAll("_", " ");
}

function appendReadableValue(
  lines: string[],
  key: string,
  value: unknown,
  depth: number,
): void {
  const indentation = "  ".repeat(depth);
  const label = readableKey(key);

  if (Array.isArray(value)) {
    lines.push(`${indentation}${label}:`);
    if (value.length === 0) lines.push(`${indentation}  (empty list)`);
    value.forEach((item, index) => appendReadableValue(lines, `[${index}]`, item, depth + 1));
    return;
  }

  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value);
    lines.push(`${indentation}${label}:`);
    if (entries.length === 0) lines.push(`${indentation}  (empty object)`);
    entries.forEach(([childKey, childValue]) => {
      appendReadableValue(lines, childKey, childValue, depth + 1);
    });
    return;
  }

  lines.push(`${indentation}${label}: ${value === null ? "not available" : String(value)}`);
}

export function serializeExtractionText(snapshot: ExtractionSnapshot): string {
  const lines = [
    "THE JIMMY APP — EXTRACTION DOWNLOAD",
    `Exported: ${snapshot.exported_at}`,
    `Source input: ${snapshot.source_input || "not provided"}`,
    "",
  ];

  appendReadableValue(lines, "capabilities", snapshot.capabilities, 0);
  lines.push("");
  appendReadableValue(lines, "loaded_game_id", snapshot.loaded_game_id, 0);
  appendReadableValue(lines, "moment_address", snapshot.moment_address, 0);
  lines.push("");
  appendReadableValue(lines, "normalized_match", snapshot.normalized_match, 0);
  lines.push("");
  appendReadableValue(lines, "public_player", snapshot.public_player, 0);

  return `${lines.join("\n")}\n`;
}

function downloadStem(snapshot: ExtractionSnapshot): string {
  if (snapshot.loaded_game_id) return `match-${snapshot.loaded_game_id}`;
  if (snapshot.public_player) return `player-${snapshot.public_player.summary.username.toLowerCase()}`;
  return "current";
}

export function downloadExtractionSnapshot(
  snapshot: ExtractionSnapshot,
  format: ExtractionDownloadFormat,
): void {
  const content = format === "json"
    ? `${JSON.stringify(snapshot, null, 2)}\n`
    : serializeExtractionText(snapshot);
  const mimeType = format === "json" ? "application/json" : "text/plain";
  const blobUrl = URL.createObjectURL(new Blob([content], { type: `${mimeType};charset=utf-8` }));
  const anchor = document.createElement("a");
  anchor.href = blobUrl;
  anchor.download = `thejimmyapp-${downloadStem(snapshot)}.${format}`;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(blobUrl);
}
