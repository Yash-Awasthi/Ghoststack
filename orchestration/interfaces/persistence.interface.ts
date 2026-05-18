export interface IEventStore {
  saveEvent(event: string, payload: any): Promise<void>;
  replayEvents(since?: Date): Promise<any[]>;
}

export interface IRuntimePersistence {
  saveState(key: string, state: any): Promise<void>;
  getState<T>(key: string): Promise<T | undefined>;
  clearState(key: string): Promise<void>;
}
