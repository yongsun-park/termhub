import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface TmuxSessionInfo {
  name: string;
  windows: number;
  created: string;
  attached: boolean;
}

export async function listTmuxSessions(): Promise<TmuxSessionInfo[]> {
  try {
    const { stdout } = await execFileAsync("tmux", [
      "list-sessions",
      "-F",
      "#{session_name}\t#{session_windows}\t#{session_created}\t#{session_attached}",
    ]);
    return stdout
      .trim()
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        const [name, windows, created, attached] = line.split("\t");
        return {
          name,
          windows: parseInt(windows, 10),
          created: new Date(parseInt(created, 10) * 1000).toISOString(),
          attached: attached !== "0",
        };
      });
  } catch {
    return [];
  }
}

let _tmuxAvailable: boolean | null = null;

export async function isTmuxAvailable(): Promise<boolean> {
  if (_tmuxAvailable !== null) return _tmuxAvailable;
  try {
    await execFileAsync("tmux", ["-V"]);
    _tmuxAvailable = true;
  } catch {
    _tmuxAvailable = false;
  }
  return _tmuxAvailable;
}

export async function createTmuxSession(sessionName: string, cwd?: string): Promise<void> {
  const args = ["new-session", "-d", "-s", sessionName];
  if (cwd) args.push("-c", cwd);
  await execFileAsync("tmux", args);
}

export async function killTmuxSession(sessionName: string): Promise<boolean> {
  try {
    await execFileAsync("tmux", ["kill-session", "-t", sessionName]);
    return true;
  } catch {
    return false;
  }
}

export async function tmuxSessionExists(sessionName: string): Promise<boolean> {
  try {
    await execFileAsync("tmux", ["has-session", "-t", sessionName]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Capture the rendered screen content of a tmux pane.
 * Returns the visible text (no ANSI codes) — much more reliable
 * than parsing the raw PTY output buffer for tmux sessions.
 */
export async function tmuxCapturePane(
  sessionName: string,
  scrollBack = 50,
): Promise<string> {
  try {
    const { stdout } = await execFileAsync("tmux", [
      "capture-pane",
      "-t",
      sessionName,
      "-p",
      "-S",
      `-${scrollBack}`,
    ]);
    return stdout;
  } catch {
    return "";
  }
}
