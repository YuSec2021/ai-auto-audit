/**
 * Unit tests for src/agents/message-bus.ts
 * Covers publish/subscribe delivery, unsubscribe, and request/response
 * timeout + happy path.
 */
import { describe, it, expect } from "vitest";

import { EventEmitterMessageBus } from "./message-bus.js";

describe("EventEmitterMessageBus", () => {
  it("delivers a published payload to a subscribed handler exactly once", () => {
    const bus = new EventEmitterMessageBus();
    let count = 0;
    let lastPayload: { image_id: string; hash: string } | null = null;
    const unsub = bus.subscribe<{ image_id: string; hash: string }>(
      "agent.preprocess.done",
      (msg) => {
        count++;
        lastPayload = msg.payload;
      },
    );
    const delivered = bus.publish("agent.preprocess.done", {
      image_id: "img-1",
      hash: "deadbeef",
    });
    expect(delivered).toBe(1);
    expect(count).toBe(1);
    expect(lastPayload).toEqual({ image_id: "img-1", hash: "deadbeef" });
    unsub();
  });

  it("unsubscribe stops further deliveries", () => {
    const bus = new EventEmitterMessageBus();
    let count = 0;
    const unsub = bus.subscribe("ch", () => {
      count++;
    });
    bus.publish("ch", 1);
    unsub();
    bus.publish("ch", 2);
    expect(count).toBe(1);
  });

  it("request/response resolves with the responder's payload", async () => {
    const bus = new EventEmitterMessageBus();
    bus.subscribe<{ value: number }>("score.request", (msg) => {
      bus.publish("score.response", { value: 99 }, msg.correlationId);
    });
    const result = await bus.request<unknown, { value: number }>("score", null);
    expect(result).toEqual({ value: 99 });
  });

  it("request/response times out when no responder is registered", async () => {
    const bus = new EventEmitterMessageBus();
    await expect(
      bus.request("never-responds", {}, 100),
    ).rejects.toThrow(/timed out/);
  });

  it("request/response passes the correlationId through the envelope", async () => {
    const bus = new EventEmitterMessageBus();
    let seenCorrelation: string | undefined;
    bus.subscribe<unknown>("echo.request", (msg) => {
      seenCorrelation = msg.correlationId;
      bus.publish("echo.response", "ok", msg.correlationId);
    });
    await bus.request<unknown, string>("echo", null);
    expect(typeof seenCorrelation).toBe("string");
    expect((seenCorrelation ?? "").length).toBeGreaterThan(0);
  });
});
