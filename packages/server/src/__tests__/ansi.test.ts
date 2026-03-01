import { describe, it, expect } from "vitest";
import { stripAnsi } from "../ansi.js";

describe("stripAnsi", () => {
  it("returns plain text unchanged", () => {
    expect(stripAnsi("hello world")).toBe("hello world");
  });

  it("strips color codes", () => {
    expect(stripAnsi("\x1b[31mred\x1b[0m")).toBe("red");
  });

  it("strips bold/underline codes", () => {
    expect(stripAnsi("\x1b[1mbold\x1b[22m")).toBe("bold");
  });

  it("strips cursor movement codes", () => {
    expect(stripAnsi("\x1b[2Amoved\x1b[3B")).toBe("moved");
  });

  it("strips OSC sequences (window title etc)", () => {
    expect(stripAnsi("\x1b]0;title\x07text")).toBe("text");
  });

  it("strips carriage return", () => {
    expect(stripAnsi("line1\rline2")).toBe("line1line2");
  });

  it("strips DEC private mode set/reset", () => {
    expect(stripAnsi("\x1b[?25hvisible\x1b[?25l")).toBe("visible");
  });

  it("handles complex mixed ANSI output", () => {
    const input = "\x1b[32m✓\x1b[0m \x1b[1mtest passed\x1b[22m (\x1b[33m42ms\x1b[0m)";
    expect(stripAnsi(input)).toBe("✓ test passed (42ms)");
  });

  it("handles empty string", () => {
    expect(stripAnsi("")).toBe("");
  });

  it("handles string with only ANSI codes", () => {
    expect(stripAnsi("\x1b[31m\x1b[0m")).toBe("");
  });
});
