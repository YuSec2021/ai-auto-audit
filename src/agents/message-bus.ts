/**
 * Sprint 1 — In-process MessageBus implementation.
 *
 * Backed by Node's `events.EventEmitter`. The bus is hidden behind the
 * `MessageBus` interface (see ./types.ts) so a future NATS/Kafka
 * transport can drop in without touching agent code.
 *
 * Concurrency note (see sprint-contract.md Risks §2):
 *   EventEmitter dispatches synchronously, in registration order. A
 *   handler that `await`s long work will block later subscribers.
 *   Sprint 1 keeps the contract simple; a real async-safe transport is
 *   a future concern.
 */

import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";

import type {
  AgentMessage,
  CorrelationId,
  MessageBus,
  MessageHandler,
  Unsubscribe,
} from "./types.js";

/** Default request timeout in milliseconds (per sprint-contract.md open question #4). */
const DEFAULT_REQUEST_TIMEOUT_MS = 5000;

/**
 * EventEmitter-backed MessageBus.
 * Public surface is only the methods declared on `MessageBus`.
 */
export class EventEmitterMessageBus implements MessageBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    // The orchestrator can register many subscribers; bump the cap so we
    // do not warn under realistic Sprint-4 fan-out (≤ ~20 subscribers).
    this.emitter.setMaxListeners(50);
  }

  publish<T>(type: string, payload: T, correlationId?: CorrelationId): number {
    const message: AgentMessage<T> = {
      type,
      payload,
      publishedAt: new Date().toISOString(),
    };
    if (correlationId !== undefined) {
      message.correlationId = correlationId;
    }
    // EventEmitter.listenerCount returns the number of listeners that
    // will actually be invoked; use that as the "delivered" count.
    const delivered = this.emitter.listenerCount(type);
    this.emitter.emit(type, message);
    return delivered;
  }

  subscribe<T>(type: string, handler: MessageHandler<T>): Unsubscribe {
    // Cast through `unknown` because EventEmitter uses a loose `(...args: any[])`
    // signature; our contract narrows it to AgentMessage<T>.
    const wrapped = (msg: AgentMessage<T>): void => {
      void Promise.resolve(handler(msg)).catch((err) => {
        // An async handler rejection should not crash the process or
        // starve sibling subscribers. Log to stderr for visibility.
        console.error(
          `[MessageBus] subscriber for "${type}" threw:`,
          err,
        );
      });
    };
    this.emitter.on(type, wrapped as (...args: unknown[]) => void);
    return () => {
      this.emitter.off(type, wrapped as (...args: unknown[]) => void);
    };
  }

  request<TReq, TRes>(
    type: string,
    payload: TReq,
    timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
  ): Promise<TRes> {
    const correlationId: CorrelationId = randomUUID();
    const responseType = `${type}.response`;

    return new Promise<TRes>((resolve, reject) => {
      const timer = setTimeout(() => {
        unsubscribe();
        reject(
          new Error(
            `MessageBus.request("${type}") timed out after ${timeoutMs} ms (correlationId=${correlationId})`,
          ),
        );
      }, timeoutMs);

      const unsubscribe: Unsubscribe = this.subscribe<TRes>(responseType, (msg) => {
        if (msg.correlationId !== correlationId) return;
        clearTimeout(timer);
        unsubscribe();
        resolve(msg.payload);
      });

      // Publish the request on the request channel so responders
      // listening on `<type>.request` see the correlationId in the envelope.
      this.publish<TReq>(`${type}.request`, payload, correlationId);
    });
  }
}

// ---------- Swap point (setMessageBus / getMessageBus) ----------

let activeBus: MessageBus = new EventEmitterMessageBus();

/** Replace the active bus (used by future NATS/Kafka impls and by tests). */
export function setMessageBus(bus: MessageBus): void {
  activeBus = bus;
}

/** Access the active bus. Always non-null; defaults to EventEmitterMessageBus. */
export function getMessageBus(): MessageBus {
  return activeBus;
}
