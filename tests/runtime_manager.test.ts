import { RuntimeManager } from "../orchestration/runtime-manager";
import { YAMLConfigLoader } from "../runtime/config-loader";
import * as path from "path";

describe("Runtime Manager", () => {
  const loader = new YAMLConfigLoader({
    portsPath: path.join(__dirname, "../runtime/ports.yaml"),
    servicesPath: path.join(__dirname, "../runtime/services.yaml"),
    healthchecksPath: path.join(__dirname, "../runtime/healthchecks.yaml"),
    runtimePath: path.join(__dirname, "../runtime/ghoststack.runtime.yaml")
  });

  it("should detect active services and parse service health status dynamically via loaded config", async () => {
    const rm = new RuntimeManager(loader);
    const active = await rm.getActiveServices();
    expect(active).toBeDefined();
    expect(active).toContain("floci");
    expect(active).toContain("fcc");
    expect(active).toContain("mcp");
  });
});
