import { stripAnsi } from "./ansi.js";

export type ClaudeState =
  | "idle"
  | "processing"
  | "awaiting_edit"
  | "awaiting_input"
  | "unknown";

export interface ClaudeStateResult {
  state: ClaudeState;
  pattern?: string;
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

  // Priority: awaiting_edit > awaiting_input > processing > idle > unknown
  // Processing must be checked BEFORE idle because Claude Code's prompt area
  // (with idle-like patterns) is always visible at the bottom of the screen.
  let match: RegExp | null;

  match = matchPatterns(tail, AWAITING_EDIT_PATTERNS);
  if (match) return { state: "awaiting_edit", pattern: match.source };

  match = matchPatterns(tail, AWAITING_INPUT_PATTERNS);
  if (match) return { state: "awaiting_input", pattern: match.source };

  match = matchPatterns(tail, PROCESSING_PATTERNS);
  if (match) return { state: "processing", pattern: match.source };

  // For idle, only check the last few lines (prompt is at the bottom)
  const bottomLines = lines.slice(-8).join("\n");
  match = matchPatterns(bottomLines, IDLE_PATTERNS);
  if (match) return { state: "idle", pattern: match.source };

  // Codex idle: "› " prompt visible near the bottom (after response is done).
  // tmux capture-pane may include many trailing blank lines, so check more lines.
  const bottom15 = lines.slice(-15);
  if (bottom15.some(l => l.trim().startsWith("›"))) {
    return { state: "idle", pattern: "codex-prompt" };
  }

  return { state: "unknown" };
}

/** Terminal states that indicate Claude Code is "done" processing */
export const TERMINAL_STATES: ClaudeState[] = [
  "idle",
  "awaiting_edit",
  "awaiting_input",
];
