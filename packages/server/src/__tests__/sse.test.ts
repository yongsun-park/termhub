import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createStreamHandler } from "../sse.js";
import type { SessionManager } from "../session-manager.js";

function createMockSession(opts?: { alive?: boolean; snapshot?: string }) {
  const dataListeners = new Set<(data: string) => void>();
  const exitListeners = new Set<(code: number) => void>();

  return {
    isAlive: () => opts?.alive ?? true,
    getSnapshot: () => opts?.snapshot ?? "",
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
    dataListenerCount: () => dataListeners.size,
    exitListenerCount: () => exitListeners.size,
  };
}

function createMockSessionManager(session: ReturnType<typeof createMockSession> | null) {
  const alertListeners = new Set<Function>();
  return {
    get: vi.fn().mockReturnValue(session),
    onAlert: (fn: Function) => {
      alertListeners.add(fn);
      return () => alertListeners.delete(fn);
    },
    alertListenerCount: () => alertListeners.size,
  } as unknown as SessionManager & { alertListenerCount: () => number };
}

function createMockReqRes(params: Record<string, string>) {
  const written: string[] = [];
  let ended = false;
  const closeListeners: Function[] = [];

  const req = {
    params,
    on: (event: string, fn: Function) => {
      if (event === "close") closeListeners.push(fn);
    },
    triggerClose: () => {
      for (const fn of closeListeners) fn();
    },
  } as any;

  let statusCode = 200;
  let jsonResult: unknown = null;

  const res = {
    status: (code: number) => { statusCode = code; return res; },
    json: (data: unknown) => { jsonResult = data; },
    writeHead: vi.fn(),
    write: (data: string) => { written.push(data); },
    end: () => { ended = true; },
    getStatus: () => statusCode,
    getJson: () => jsonResult,
  } as any;

  return { req, res, written, isEnded: () => ended };
}

describe("createStreamHandler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 404 for non-existent session", () => {
    const sm = createMockSessionManager(null);
    const handler = createStreamHandler(sm);
    const { req, res } = createMockReqRes({ id: "abc" });

    handler(req, res);

    expect(res.getStatus()).toBe(404);
  });

  it("sets SSE headers", () => {
    const session = createMockSession();
    const sm = createMockSessionManager(session);
    const handler = createStreamHandler(sm);
    const { req, res } = createMockReqRes({ id: "abc" });

    handler(req, res);

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    }));
  });

  it("sends snapshot if available", () => {
    const session = createMockSession({ snapshot: "hello world" });
    const sm = createMockSessionManager(session);
    const handler = createStreamHandler(sm);
    const { req, res, written } = createMockReqRes({ id: "abc" });

    handler(req, res);

    const snapshotEvent = written.find(w => w.startsWith("event: snapshot"));
    expect(snapshotEvent).toBeDefined();
    expect(snapshotEvent).toContain("hello world");
  });

  it("does not send snapshot if empty", () => {
    const session = createMockSession({ snapshot: "" });
    const sm = createMockSessionManager(session);
    const handler = createStreamHandler(sm);
    const { req, res, written } = createMockReqRes({ id: "abc" });

    handler(req, res);

    const snapshotEvent = written.find(w => w.startsWith("event: snapshot"));
    expect(snapshotEvent).toBeUndefined();
  });

  it("streams output data", () => {
    const session = createMockSession();
    const sm = createMockSessionManager(session);
    const handler = createStreamHandler(sm);
    const { req, res, written } = createMockReqRes({ id: "abc" });

    handler(req, res);
    session.emitData("test output");

    const outputEvent = written.find(w => w.startsWith("event: output"));
    expect(outputEvent).toBeDefined();
    expect(outputEvent).toContain("test output");
  });

  it("sends exit event and closes stream", () => {
    const session = createMockSession();
    const sm = createMockSessionManager(session);
    const handler = createStreamHandler(sm);
    const { req, res, written, isEnded } = createMockReqRes({ id: "abc" });

    handler(req, res);
    session.emitExit(0);

    const exitEvent = written.find(w => w.startsWith("event: exit"));
    expect(exitEvent).toBeDefined();
    expect(exitEvent).toContain('"code":0');
    expect(isEnded()).toBe(true);
  });

  it("cleans up listeners on client disconnect", () => {
    const session = createMockSession();
    const sm = createMockSessionManager(session);
    const handler = createStreamHandler(sm);
    const { req, res } = createMockReqRes({ id: "abc" });

    handler(req, res);

    expect(session.dataListenerCount()).toBe(1);
    expect(session.exitListenerCount()).toBe(1);

    req.triggerClose();

    expect(session.dataListenerCount()).toBe(0);
    expect(session.exitListenerCount()).toBe(0);
  });

  it("sends heartbeat every 15 seconds", () => {
    const session = createMockSession();
    const sm = createMockSessionManager(session);
    const handler = createStreamHandler(sm);
    const { req, res, written } = createMockReqRes({ id: "abc" });

    handler(req, res);

    vi.advanceTimersByTime(15_000);

    const heartbeat = written.find(w => w.includes("heartbeat"));
    expect(heartbeat).toBeDefined();
  });

  it("closes immediately for already-dead sessions", () => {
    const session = createMockSession({ alive: false, snapshot: "old output" });
    const sm = createMockSessionManager(session);
    const handler = createStreamHandler(sm);
    const { req, res, written, isEnded } = createMockReqRes({ id: "abc" });

    handler(req, res);

    // Should have snapshot + exit + end
    const snapshotEvent = written.find(w => w.startsWith("event: snapshot"));
    const exitEvent = written.find(w => w.startsWith("event: exit"));
    expect(snapshotEvent).toBeDefined();
    expect(exitEvent).toBeDefined();
    expect(isEnded()).toBe(true);
  });
});
