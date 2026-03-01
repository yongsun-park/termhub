import { describe, it, expect, vi, beforeEach } from "vitest";
import { createExecHandler } from "../exec.js";
import type { SessionManager } from "../session-manager.js";

// Mock session
function createMockSession(opts?: { alive?: boolean }) {
  const dataListeners = new Set<(data: string) => void>();
  const exitListeners = new Set<(code: number) => void>();

  return {
    isAlive: () => opts?.alive ?? true,
    write: vi.fn(),
    onData: (fn: (data: string) => void) => {
      dataListeners.add(fn);
      return () => dataListeners.delete(fn);
    },
    onExit: (fn: (code: number) => void) => {
      exitListeners.add(fn);
      return () => exitListeners.delete(fn);
    },
    emitData: (data: string) => {
      for (const fn of dataListeners) fn(data);
    },
    emitExit: (code: number) => {
      for (const fn of exitListeners) fn(code);
    },
  };
}

function createMockSessionManager(session: ReturnType<typeof createMockSession> | null) {
  return {
    get: vi.fn().mockReturnValue(session),
  } as unknown as SessionManager;
}

function createMockReqRes(params: Record<string, string>, body: Record<string, unknown>) {
  const req = {
    params,
    body,
  } as any;

  let jsonResult: unknown = null;
  let statusCode = 200;

  const res = {
    status: (code: number) => {
      statusCode = code;
      return res;
    },
    json: (data: unknown) => {
      jsonResult = data;
    },
    getStatus: () => statusCode,
    getJson: () => jsonResult,
  } as any;

  return { req, res, getResult: () => ({ status: statusCode, json: jsonResult }) };
}

describe("createExecHandler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("returns 404 for non-existent session", () => {
    const sm = createMockSessionManager(null);
    const handler = createExecHandler(sm);
    const { req, res, getResult } = createMockReqRes({ id: "abc" }, { command: "echo hi" });

    handler(req, res);

    expect(getResult().status).toBe(404);
    expect(getResult().json).toEqual({ error: "Session not found" });
  });

  it("returns 410 for dead session", () => {
    const session = createMockSession({ alive: false });
    const sm = createMockSessionManager(session);
    const handler = createExecHandler(sm);
    const { req, res, getResult } = createMockReqRes({ id: "abc" }, { command: "echo hi" });

    handler(req, res);

    expect(getResult().status).toBe(410);
  });

  it("returns 400 when command is missing", () => {
    const session = createMockSession();
    const sm = createMockSessionManager(session);
    const handler = createExecHandler(sm);
    const { req, res, getResult } = createMockReqRes({ id: "abc" }, {});

    handler(req, res);

    expect(getResult().status).toBe(400);
  });

  it("returns 400 for invalid endPattern regex", () => {
    const session = createMockSession();
    const sm = createMockSessionManager(session);
    const handler = createExecHandler(sm);
    const { req, res, getResult } = createMockReqRes({ id: "abc" }, { command: "echo hi", endPattern: "[" });

    handler(req, res);

    expect(getResult().status).toBe(400);
    expect(getResult().json).toEqual({ error: "Invalid endPattern regex" });
  });

  it("writes command with newline to session", () => {
    const session = createMockSession();
    const sm = createMockSessionManager(session);
    const handler = createExecHandler(sm);
    const { req, res } = createMockReqRes({ id: "abc" }, { command: "echo hello" });

    handler(req, res);

    expect(session.write).toHaveBeenCalledWith("echo hello\n");
  });

  it("finishes after quietMs of silence", async () => {
    const session = createMockSession();
    const sm = createMockSessionManager(session);
    const handler = createExecHandler(sm);

    let jsonResult: any = null;
    const res = {
      status: () => res,
      json: (data: any) => { jsonResult = data; },
    } as any;
    const req = { params: { id: "abc" }, body: { command: "echo hi", quietMs: 100 } } as any;

    handler(req, res);

    // Simulate output
    session.emitData("hello\n");

    // Not done yet
    expect(jsonResult).toBeNull();

    // Advance past quietMs
    vi.advanceTimersByTime(100);

    expect(jsonResult).not.toBeNull();
    expect(jsonResult.output).toBe("hello\n");
    expect(jsonResult.timedOut).toBe(false);
  });

  it("strips ANSI from output", async () => {
    const session = createMockSession();
    const sm = createMockSessionManager(session);
    const handler = createExecHandler(sm);

    let jsonResult: any = null;
    const res = {
      status: () => res,
      json: (data: any) => { jsonResult = data; },
    } as any;
    const req = { params: { id: "abc" }, body: { command: "test", quietMs: 50 } } as any;

    handler(req, res);

    session.emitData("\x1b[32mgreen\x1b[0m");

    vi.advanceTimersByTime(50);

    expect(jsonResult.output).toBe("green");
  });

  it("times out after timeoutMs", () => {
    const session = createMockSession();
    const sm = createMockSessionManager(session);
    const handler = createExecHandler(sm);

    let jsonResult: any = null;
    const res = {
      status: () => res,
      json: (data: any) => { jsonResult = data; },
    } as any;
    const req = { params: { id: "abc" }, body: { command: "slow", timeoutMs: 500, quietMs: 5000 } } as any;

    handler(req, res);

    // Keep producing output so quietMs never fires
    session.emitData("working...");

    vi.advanceTimersByTime(500);

    expect(jsonResult).not.toBeNull();
    expect(jsonResult.timedOut).toBe(true);
  });

  it("finishes on endPattern match", () => {
    const session = createMockSession();
    const sm = createMockSessionManager(session);
    const handler = createExecHandler(sm);

    let jsonResult: any = null;
    const res = {
      status: () => res,
      json: (data: any) => { jsonResult = data; },
    } as any;
    const req = { params: { id: "abc" }, body: { command: "test", endPattern: "DONE", quietMs: 5000 } } as any;

    handler(req, res);

    session.emitData("working...\n");
    expect(jsonResult).toBeNull();

    session.emitData("DONE\n");
    expect(jsonResult).not.toBeNull();
    expect(jsonResult.timedOut).toBe(false);
  });

  it("finishes on session exit", () => {
    const session = createMockSession();
    const sm = createMockSessionManager(session);
    const handler = createExecHandler(sm);

    let jsonResult: any = null;
    const res = {
      status: () => res,
      json: (data: any) => { jsonResult = data; },
    } as any;
    const req = { params: { id: "abc" }, body: { command: "test", quietMs: 5000 } } as any;

    handler(req, res);

    session.emitData("some output");
    session.emitExit(0);

    expect(jsonResult).not.toBeNull();
    expect(jsonResult.timedOut).toBe(false);
  });
});
