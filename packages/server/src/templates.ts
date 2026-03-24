import { readFile, readdir, mkdir } from "node:fs/promises";
import path from "node:path";
import { homedir } from "node:os";

const TEMPLATES_DIR = path.join(homedir(), ".termhub", "templates");

export interface PromptTemplate {
  name: string;
  description?: string;
  content: string;
}

/**
 * Parse frontmatter from a markdown template file.
 * Expects optional YAML-like frontmatter between --- delimiters.
 */
function parseTemplate(filename: string, raw: string): PromptTemplate {
  const name = filename.replace(/\.md$/, "");
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

  if (!fmMatch) {
    return { name, content: raw.trim() };
  }

  const frontmatter = fmMatch[1];
  const content = fmMatch[2].trim();

  let description: string | undefined;
  const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
  if (descMatch) description = descMatch[1].trim();

  // name from frontmatter overrides filename
  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
  const parsedName = nameMatch ? nameMatch[1].trim() : name;

  return { name: parsedName, description, content };
}

export async function listTemplates(): Promise<PromptTemplate[]> {
  try {
    await mkdir(TEMPLATES_DIR, { recursive: true });
    const files = await readdir(TEMPLATES_DIR);
    const templates: PromptTemplate[] = [];

    for (const file of files) {
      if (!file.endsWith(".md") || file.toUpperCase() === "CLAUDE.MD") continue;
      try {
        const raw = await readFile(path.join(TEMPLATES_DIR, file), "utf-8");
        templates.push(parseTemplate(file, raw));
      } catch {
        // skip unreadable files
      }
    }

    templates.sort((a, b) => a.name.localeCompare(b.name));
    return templates;
  } catch {
    return [];
  }
}

export async function getTemplate(name: string): Promise<PromptTemplate | null> {
  try {
    const raw = await readFile(path.join(TEMPLATES_DIR, `${name}.md`), "utf-8");
    return parseTemplate(`${name}.md`, raw);
  } catch {
    return null;
  }
}
