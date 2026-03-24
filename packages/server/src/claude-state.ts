import { stripAnsi } from "./ansi.js";

export type ClaudeState =
  | "idle"
  | "processing"
  | "awaiting_edit"
  | "awaiting_input"
  | "unknown";

export type DetectedTool = "claude" | "codex" | "shell";

export interface ClaudeStateResult {
  state: ClaudeState;
  pattern?: string;
  tool: DetectedTool;
}

const IDLE_PATTERNS = [
  /\? for shortcuts/,
  /Try "/,
  /context left/,  // Codex idle indicator: "100% context left"
  // Note: ❯/› alone is NOT a reliable idle indicator — it's always visible
  // at the bottom of the screen, even during processing.
];

const PROCESSING_PATTERNS = [
  /esc to interrupt/,
  // Claude Code spinner lines use format: "✽ Verb…" or "· Verb… (Ns)"
  // Match the spinner character + word(s) + ellipsis, not bare English words
  /[✦✽✶✻·◐◑◒◓⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]\s*[\w-]+…/,
  // Specific Claude Code status patterns (with context markers)
  /Reading \d+ file/,
  /Worked for \d+/,
];

const AWAITING_EDIT_PATTERNS = [
  /accept edits on/,
  /shift\+tab to cycle/,
];

const AWAITING_INPUT_PATTERNS = [
  /\(y\/n\)/i,
  /\(yes\/no\)/i,
  /Do you want to proceed/,
  /Allow this action/,
  /Esc to cancel/,
  /Press Enter to continue/,
];

function detectTool(lines: string[]): DetectedTool {
  // Check broader context for tool identity (not just last few lines)
  const all = lines.join("\n");
  const tail = lines.slice(-30).join("\n");

  // Codex indicators (check first — more specific)
  if (/context left/.test(tail) || /Codex/.test(all)) return "codex";

  // Claude Code indicators (specific patterns, not just ❯ which shells also use)
  if (/\? for shortcuts/.test(tail) || /Claude Code/.test(all) || /·\s*\/effort/.test(tail)) return "claude";

  return "shell";
}

function matchPatterns(
  text: string,
  patterns: RegExp[],
): RegExp | null {
  for (const p of patterns) {
    if (p.test(text)) return p;
  }
  return null;
}

/**
 * Detect Claude Code state from terminal output.
 * Accepts raw output (will strip ANSI) or pre-stripped text.
 * Examines the last `lastNLines` lines for state patterns.
 *
 * Note: If input is already ANSI-stripped (e.g., from tmuxCapturePane),
 * stripAnsi is a no-op, so no performance concern about double-stripping.
 */
export function detectClaudeState(
  output: string,
  lastNLines = 30,
): ClaudeStateResult {
  const stripped = stripAnsi(output);
  const lines = stripped.split("\n");
  const tail = lines.slice(-lastNLines).join("\n");

  // Detect which tool is running
  const tool = detectTool(lines);

  // Priority: awaiting_edit > awaiting_input > processing > idle > unknown
  // Processing must be checked BEFORE idle because Claude Code's prompt area
  // (with idle-like patterns) is always visible at the bottom of the screen.
  let match: RegExp | null;

  match = matchPatterns(tail, AWAITING_EDIT_PATTERNS);
  if (match) return { state: "awaiting_edit", pattern: match.source, tool };

  match = matchPatterns(tail, AWAITING_INPUT_PATTERNS);
  if (match) return { state: "awaiting_input", pattern: match.source, tool };

  match = matchPatterns(tail, PROCESSING_PATTERNS);
  if (match) return { state: "processing", pattern: match.source, tool };

  // For idle, only check the last few lines (prompt is at the bottom)
  const bottomLines = lines.slice(-8).join("\n");
  match = matchPatterns(bottomLines, IDLE_PATTERNS);
  if (match) return { state: "idle", pattern: match.source, tool };

  // Codex idle: "› " prompt visible near the bottom (after response is done).
  // tmux capture-pane may include many trailing blank lines, so check more lines.
  const bottom15 = lines.slice(-15);
  if (bottom15.some(l => l.trim().startsWith("›"))) {
    return { state: "idle", pattern: "codex-prompt", tool: "codex" };
  }

  return { state: "unknown", tool };
}

/** Terminal states that indicate Claude Code is "done" processing */
export const TERMINAL_STATES: ClaudeState[] = [
  "idle",
  "awaiting_edit",
  "awaiting_input",
];
