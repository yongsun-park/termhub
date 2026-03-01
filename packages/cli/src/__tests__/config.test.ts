import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// We'll test config logic by importing after mocking
vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  const testHome = join(actual.tmpdir(), `termhub-test-${Date.now()}`);
  return { ...actual, homedir: () => testHome };
});

import { loadConfig, saveConfig } from "../config.js";
import { homedir } from "node:os";

describe("config", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.TERMHUB_URL;
    delete process.env.TERMHUB_TOKEN;
    // Ensure the test home directory exists
    mkdirSync(homedir(), { recursive: true });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns defaults when no config file and no env vars", () => {
    const config = loadConfig();
    expect(config.url).toBe("http://localhost:4000");
    expect(config.token).toBe("");
  });

  it("reads from environment variables", () => {
    process.env.TERMHUB_URL = "http://example.com:5000";
    process.env.TERMHUB_TOKEN = "env-token-123";

    const config = loadConfig();
    expect(config.url).toBe("http://example.com:5000");
    expect(config.token).toBe("env-token-123");
  });

  it("saves and loads config from file", () => {
    saveConfig({ url: "http://saved.com", token: "saved-token" });

    const config = loadConfig();
    expect(config.url).toBe("http://saved.com");
    expect(config.token).toBe("saved-token");
  });

  it("merges partial saves", () => {
    saveConfig({ url: "http://first.com", token: "first-token" });
    saveConfig({ token: "updated-token" });

    const config = loadConfig();
    expect(config.url).toBe("http://first.com");
    expect(config.token).toBe("updated-token");
  });

  it("env vars override file config", () => {
    saveConfig({ url: "http://file.com", token: "file-token" });
    process.env.TERMHUB_URL = "http://env.com";

    const config = loadConfig();
    expect(config.url).toBe("http://env.com");
    expect(config.token).toBe("file-token");
  });
});
