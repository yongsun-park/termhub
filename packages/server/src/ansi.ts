const ANSI_REGEX =
  /\x1b\[[0-9;]*[A-Za-z]|\x1b\][^\x07]*(?:\x07|\x1b\\)|\x1b[()][AB012]|\x1b[=>Nc]|\x1b\[\??[0-9;]*[hl]|\r/g;

export function stripAnsi(str: string): string {
  return str.replace(ANSI_REGEX, "");
}
