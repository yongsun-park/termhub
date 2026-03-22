import { readdir, readFile, access } from "node:fs/promises";
import path from "node:path";
import { homedir } from "node:os";

export interface ProjectInfo {
  name: string;
  path: string;
  hasGit: boolean;
  submodules?: ProjectInfo[];
}

/** Parse .gitmodules to extract submodule paths */
async function parseSubmodules(projectPath: string): Promise<ProjectInfo[]> {
  try {
    const content = await readFile(path.join(projectPath, ".gitmodules"), "utf-8");
    const submodules: ProjectInfo[] = [];
    const pathRegex = /^\s*path\s*=\s*(.+)$/gm;
    let match: RegExpExecArray | null;
    while ((match = pathRegex.exec(content)) !== null) {
      const subPath = match[1].trim();
      const fullPath = path.join(projectPath, subPath);
      let hasGit = false;
      try {
        await access(path.join(fullPath, ".git"));
        hasGit = true;
      } catch {
        // submodule not initialized
      }
      submodules.push({
        name: path.basename(subPath),
        path: fullPath,
        hasGit,
      });
    }
    submodules.sort((a, b) => a.name.localeCompare(b.name));
    return submodules;
  } catch {
    return [];
  }
}

export async function listProjects(): Promise<ProjectInfo[]> {
  const raw = process.env.TERMHUB_PROJECTS || path.join(homedir(), "repositories");
  const baseDirs = raw.split(":").map((d) => d.trim()).filter(Boolean)
    .map((d) => d.startsWith("~") ? path.join(homedir(), d.slice(1)) : d);

  const results: ProjectInfo[] = [];

  for (const baseDir of baseDirs) {
    try {
      const entries = await readdir(baseDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
        const fullPath = path.join(baseDir, entry.name);
        let hasGit = false;
        try {
          await access(path.join(fullPath, ".git"));
          hasGit = true;
        } catch {
          // no .git
        }
        const submodules = hasGit ? await parseSubmodules(fullPath) : [];
        results.push({
          name: entry.name,
          path: fullPath,
          hasGit,
          ...(submodules.length > 0 ? { submodules } : {}),
        });
      }
    } catch {
      // skip unreadable base dir, continue with others
    }
  }

  results.sort((a, b) => a.name.localeCompare(b.name));
  return results;
}
