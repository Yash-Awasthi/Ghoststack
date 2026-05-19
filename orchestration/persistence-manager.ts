import { IEventStore, IRuntimePersistence } from "./interfaces/persistence.interface";
import * as fs from "fs";
import * as path from "path";

export class FileEventStore implements IEventStore {
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.ensureFileExists();
  }

  private ensureFileExists() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  async saveEvent(event: string, payload: any): Promise<void> {
    const record = {
      event,
      payload,
      timestamp: new Date().toISOString()
    };
    fs.appendFileSync(this.filePath, JSON.stringify(record) + "\n", "utf8");
  }

  async replayEvents(since?: Date): Promise<any[]> {
    if (!fs.existsSync(this.filePath)) {
      return [];
    }
    const content = fs.readFileSync(this.filePath, "utf8");
    const lines = content.split("\n").filter((line) => line.trim().length > 0);
    const parsed = lines.map((line) => JSON.parse(line));

    if (since) {
      const sinceTime = since.getTime();
      return parsed.filter((item) => new Date(item.timestamp).getTime() >= sinceTime);
    }

    return parsed;
  }
}

export class FileRuntimePersistence implements IRuntimePersistence {
  private filePath: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(filePath: string) {
    this.filePath = filePath;
    this.ensureFileExists();
  }

  private ensureFileExists() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private readState(): Record<string, any> {
    if (!fs.existsSync(this.filePath)) {
      return {};
    }
    try {
      const content = fs.readFileSync(this.filePath, "utf8");
      return JSON.parse(content || "{}");
    } catch {
      return {};
    }
  }

  private writeState(state: Record<string, any>) {
    const tempPath = `${this.filePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(state, null, 2), "utf8");
    fs.renameSync(tempPath, this.filePath);
  }

  async saveState(key: string, state: any): Promise<void> {
    this.writeQueue = this.writeQueue
      .then(() => {
        const current = this.readState();
        current[key] = state;
        this.writeState(current);
      })
      .catch(() => {});
    return this.writeQueue;
  }

  async getState<T>(key: string): Promise<T | undefined> {
    await this.writeQueue;
    const current = this.readState();
    return current[key] as T;
  }

  async clearState(key: string): Promise<void> {
    this.writeQueue = this.writeQueue
      .then(() => {
        const current = this.readState();
        delete current[key];
        this.writeState(current);
      })
      .catch(() => {});
    return this.writeQueue;
  }
}
