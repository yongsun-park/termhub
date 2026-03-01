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

export async function tmuxSessionExists(sessionName: string): Promise<boolean> {
  try {
    await execFileAsync("tmux", ["has-session", "-t", sessionName]);
    return true;
  } catch {
    return false;
  }
}
