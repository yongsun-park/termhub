import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { homedir } from "node:os";

const FAVORITES_PATH = path.join(homedir(), ".termhub", "favorites.json");

export async function getFavorites(): Promise<string[]> {
  try {
    const data = await readFile(FAVORITES_PATH, "utf-8");
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function setFavorites(paths: string[]): Promise<void> {
  await mkdir(path.dirname(FAVORITES_PATH), { recursive: true });
  await writeFile(FAVORITES_PATH, JSON.stringify(paths, null, 2), "utf-8");
}
