export interface EventSubscription {
  unsubscribe(): void;
}

export interface IEventBus {
  publish(event: string, payload: any): Promise<void>;
  subscribe(event: string, handler: (payload: any) => void | Promise<void>): EventSubscription;
}

export class LocalEventBus implements IEventBus {
  private handlers = new Map<string, Set<(payload: any) => void | Promise<void>>>();

  async publish(event: string, payload: any): Promise<void> {
    const eventHandlers = this.handlers.get(event);
    if (!eventHandlers) return;
    
    const promises = Array.from(eventHandlers).map(async (handler) => {
      try {
        await handler(payload);
      } catch (err) {
        console.error(`Error executing event handler for ${event}:`, err);
      }
    });
    
    await Promise.all(promises);
  }

  subscribe(event: string, handler: (payload: any) => void | Promise<void>): EventSubscription {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    
    return {
      unsubscribe: () => {
        const eventHandlers = this.handlers.get(event);
        if (eventHandlers) {
          eventHandlers.delete(handler);
          if (eventHandlers.size === 0) {
            this.handlers.delete(event);
          }
        }
      }
    };
  }
}
