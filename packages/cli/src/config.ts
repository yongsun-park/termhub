import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

const RC_PATH = join(homedir(), ".termhubrc");

interface Config {
  url: string;
  token: string;
}

export function loadConfig(): Config {
  const url = process.env.TERMHUB_URL;
  const token = process.env.TERMHUB_TOKEN;
  if (url && token) return { url, token };

  try {
    const raw = readFileSync(RC_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Partial<Config>;
    return {
      url: url || parsed.url || "http://localhost:4000",
      token: token || parsed.token || "",
    };
  } catch {
    return { url: url || "http://localhost:4000", token: token || "" };
  }
}

export function saveConfig(config: Partial<Config>): void {
  let existing: Partial<Config> = {};
  try {
    existing = JSON.parse(readFileSync(RC_PATH, "utf-8"));
  } catch {
    // no existing config
  }
  const merged = { ...existing, ...config };
  mkdirSync(dirname(RC_PATH), { recursive: true });
  writeFileSync(RC_PATH, JSON.stringify(merged, null, 2) + "\n", { mode: 0o600 });
}
