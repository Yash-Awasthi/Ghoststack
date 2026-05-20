/**
 * Event store persistence interface.
 *
 * IEventStore provides append-only write-before-dispatch semantics for
 * durable event persistence. Implementations may use JSONL files,
 * in-memory stores, or any backend supporting sequential writes and replay.
 *
 * This interface was extracted from orchestration/event-bus.ts to resolve
 * the circular/re-export dependency pattern between event-bus.ts and
 * interfaces/persistence.interface.ts. Both modules now import from here.
 */

export interface IEventStore {
  /** Serialize and persist an event. The payload is the full event object, not a pre-serialized string. */
  saveEvent(event: string, payload: any): Promise<void>;
  /** Replay events, optionally filtered since a given timestamp. Returns parsed event records. */
  replayEvents(since?: Date): Promise<any[]>;
}
