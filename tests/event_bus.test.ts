import { LocalEventBus } from '../orchestration/event-bus';

describe("Event Bus", () => {
  it("should subscribe, publish, and unsubscribe successfully", async () => {
    const bus = new LocalEventBus();
    let receivedPayload: any = null;
    
    const subscription = bus.subscribe("test_event", (payload) => {
      receivedPayload = payload;
    });
    
    await bus.publish("test_event", { message: "hello" });
    expect(receivedPayload).toEqual({ message: "hello" });
    
    // Reset and unsubscribe
    receivedPayload = null;
    subscription.unsubscribe();
    
    await bus.publish("test_event", { message: "ignored" });
    expect(receivedPayload).toBeNull();
  });
});
