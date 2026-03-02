import { describe, it, expect } from "vitest";
import { detectClaudeState } from "../claude-state.js";

describe("detectClaudeState", () => {
  it("detects idle state from '? for shortcuts'", () => {
    const output = `
some response text

────────────────
❯
────────────────
  ? for shortcuts`;
    const result = detectClaudeState(output);
    expect(result.state).toBe("idle");
    expect(result.pattern).toContain("for shortcuts");
  });

  it("detects idle state from 'Try \"' suggestion", () => {
    const output = `
Claude Code v2.1.63

────────────────
❯ Try "fix lint errors"
────────────────
  ? for shortcuts`;
    const result = detectClaudeState(output);
    expect(result.state).toBe("idle");
  });

  it("detects processing from 'esc to interrupt'", () => {
    const output = `
❯ do something

● Reading 3 files

────────────────
❯
────────────────
  esc to interrupt`;
    const result = detectClaudeState(output);
    expect(result.state).toBe("processing");
  });

  it("detects processing from spinner patterns", () => {
    const spinners = ["Thinking", "Garnishing", "Thundering", "Billowing", "Razzle-dazzling"];
    for (const spinner of spinners) {
      const output = `✽ ${spinner}…\n────\n❯ \n────`;
      const result = detectClaudeState(output);
      expect(result.state).toBe("processing");
    }
  });

  it("does not false-positive on 'Working' in response text", () => {
    const output = `
● The function is Working as expected. No changes needed.

────────────────
❯
────────────────
  ? for shortcuts`;
    const result = detectClaudeState(output);
    expect(result.state).toBe("idle");
  });

  it("detects awaiting_edit from 'accept edits on'", () => {
    const output = `
● Made some changes

────────────────
❯
────────────────
  ⏵⏵ accept edits on (shift+tab to cycle)`;
    const result = detectClaudeState(output);
    expect(result.state).toBe("awaiting_edit");
    expect(result.pattern).toContain("accept edits on");
  });

  it("detects awaiting_input from y/n prompt", () => {
    const output = `
 Do you want to proceed?
 ❯ 1. Yes
   2. No

 Esc to cancel`;
    const result = detectClaudeState(output);
    expect(result.state).toBe("awaiting_input");
  });

  it("prioritizes awaiting_edit over idle", () => {
    const output = `
────────────────
❯
────────────────
  ⏵⏵ accept edits on (shift+tab to cycle) · ? for shortcuts`;
    const result = detectClaudeState(output);
    expect(result.state).toBe("awaiting_edit");
  });

  it("prioritizes processing over idle", () => {
    const output = `
✽ Thinking…
────────────────
❯
────────────────
  ? for shortcuts · esc to interrupt`;
    const result = detectClaudeState(output);
    expect(result.state).toBe("processing");
  });

  it("returns unknown for unrecognizable output", () => {
    const output = "some random bash output\npys@host:~$ ls\nfile1 file2";
    const result = detectClaudeState(output);
    expect(result.state).toBe("unknown");
  });

  it("returns unknown for empty output", () => {
    const result = detectClaudeState("");
    expect(result.state).toBe("unknown");
  });

  it("handles ANSI codes in input", () => {
    const output = "\x1b[32m● Done\x1b[0m\n────\n❯ \n────\n  ? for shortcuts";
    const result = detectClaudeState(output);
    expect(result.state).toBe("idle");
  });
});
