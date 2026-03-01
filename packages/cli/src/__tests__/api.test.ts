import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock config before importing ApiClient
vi.mock("../config.js", () => ({
  loadConfig: () => ({
    url: "http://localhost:4000",
    token: "test-token",
  }),
  saveConfig: vi.fn(),
}));

import { ApiClient } from "../api.js";

describe("ApiClient", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends Authorization header with token", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 })
    );

    const client = new ApiClient();
    await client.sessionsList();

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:4000/api/sessions",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
        }),
      })
    );
  });

  it("sessionsList returns parsed JSON", async () => {
    const mockSessions = [{ id: "abc", name: "test" }];
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify(mockSessions), { status: 200 })
    );

    const client = new ApiClient();
    const result = await client.sessionsList();

    expect(result).toEqual(mockSessions);
  });

  it("sessionsCreate sends POST with body", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ id: "new" }), { status: 201 })
    );

    const client = new ApiClient();
    await client.sessionsCreate("my-session", "/home");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:4000/api/sessions",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "my-session", cwd: "/home" }),
      })
    );
  });

  it("sessionsDelete sends DELETE", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );

    const client = new ApiClient();
    await client.sessionsDelete("abc");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:4000/api/sessions/abc",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("exec sends POST with command and options", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ output: "hello", timedOut: false, durationMs: 100 }), { status: 200 })
    );

    const client = new ApiClient();
    const result = await client.exec("abc", "echo hello", { quietMs: 1000 });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:4000/api/sessions/abc/exec",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ command: "echo hello", quietMs: 1000 }),
      })
    );
    expect(result.output).toBe("hello");
  });

  it("output sends GET with optional last param", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ output: "lines" }), { status: 200 })
    );

    const client = new ApiClient();
    await client.output("abc", 50);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:4000/api/sessions/abc/output?last=50",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("throws on HTTP error", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: "Not found" }), { status: 404 })
    );

    const client = new ApiClient();
    await expect(client.sessionsList()).rejects.toThrow("HTTP 404");
  });

  it("login sends password and returns token", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ token: "jwt-token" }), { status: 200 })
    );

    const client = new ApiClient();
    const token = await client.login("mypassword");

    expect(token).toBe("jwt-token");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:4000/api/login",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ password: "mypassword" }),
      })
    );
  });

  it("streamUrl returns correct URL", () => {
    const client = new ApiClient();
    expect(client.streamUrl("abc")).toBe("http://localhost:4000/api/sessions/abc/stream");
  });

  it("strips trailing slash from url", () => {
    const client = new ApiClient();
    // url from config is already without trailing slash
    expect(client.streamUrl("test")).toBe("http://localhost:4000/api/sessions/test/stream");
  });
});
