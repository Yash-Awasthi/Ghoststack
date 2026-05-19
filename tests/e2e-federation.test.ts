import * as path from "path";
import { createRuntimeContext, startRuntime, stopRuntime } from "../runtime/runtime-context";
import { runFederationE2e } from "../runtime/e2e-federation";
import { probeFlociHealth, resolveFlociEndpoint } from "../orchestration/floci-client";

const runLive = process.env.GHOSTSTACK_FLOCI_INTEGRATION === "1";

(runLive ? describe : describe.skip)("Federation E2E workflow (live Floci)", () => {
  const repoRoot = path.resolve(__dirname, "..");

  beforeAll(async () => {
    const h = await probeFlociHealth(resolveFlociEndpoint(), 8000);
    if (!h.reachable) {
      throw new Error(`Floci required for E2E: ${h.error}`);
    }
  });

  it("runs S3 → Lambda create → invoke pipeline", async () => {
    process.env.GHOSTSTACK_DATA_DIR = path.join(__dirname, "../temp-e2e-federation-db");
    const ctx = await createRuntimeContext(repoRoot);
    await startRuntime(ctx);
    try {
      const result = await runFederationE2e(ctx, { strict: true, cleanup: true });
      expect(result.status).toBe("succeeded");
      expect(result.workflowId).toMatch(/^federation-e2e-/);
    } finally {
      await stopRuntime(ctx);
    }
  }, 180000);
});

describe("Federation E2E workflow (offline mock)", () => {
  it("registers dynamic workflow and completes with mocks", async () => {
    process.env.GHOSTSTACK_DATA_DIR = path.join(__dirname, "../temp-e2e-mock-db");
    process.env.GHOSTSTACK_OFFLINE_MODE = "true";
    process.env.GHOSTSTACK_FLOCI_STRICT = "0";
    process.env.GHOSTSTACK_FLOCI_MOCK_FALLBACK = "true";

    const repoRoot = path.resolve(__dirname, "..");
    const ctx = await createRuntimeContext(repoRoot);
    await startRuntime(ctx);
    try {
      const result = await runFederationE2e(ctx, { strict: false, cleanup: false });
      expect(result.status).toBe("succeeded");
    } finally {
      await stopRuntime(ctx);
    }
  }, 60000);
});
