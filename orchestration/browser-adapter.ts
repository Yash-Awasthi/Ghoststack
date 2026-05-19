import { IBrowserExecutionAdapter, IBrowserTask, IEnvironmentTelemetry } from "./interfaces/environment.interface";
import { IExecutionContext } from "./interfaces/execution.interface";
import { isSafeUrl } from "./security-utils";

export class BrowserExecutionAdapter implements IBrowserExecutionAdapter {
  constructor(
    private telemetry: IEnvironmentTelemetry,
    private isOfflineMode = true
  ) {}

  canExecute(taskType: string): boolean {
    return taskType === "browser";
  }

  async execute(task: any, context: IExecutionContext): Promise<any> {
    const payload = task.payload || {};
    const browserTask: IBrowserTask = {
      id: context.taskId,
      url: payload.url || "",
      actions: payload.actions || [],
      timeoutMs: payload.timeoutMs || 5000
    };
    return this.executeBrowserTask(browserTask);
  }

  async executeBrowserTask(
    task: IBrowserTask
  ): Promise<{ success: boolean; screenshotUrl?: string; content?: string; logs: string[] }> {
    const logs: string[] = [];
    logs.push(`Initiating browser task execution for: ${task.url}`);

    // Safety Policy verification
    if (!isSafeUrl(task.url)) {
      logs.push(`Safety Policy Block: Forbidden URL protocol/host: ${task.url}`);
      return {
        success: false,
        content: "BLOCKED_BY_SAFETY_POLICY",
        logs
      };
    }

    this.telemetry.browserSessionsActive += 1;
    this.telemetry.recordNavigation(task.url);

    if (this.isOfflineMode) {
      logs.push(`Simulating offline execution context for browser task...`);

      // Simulate timeout bounds
      if (task.timeoutMs <= 50) {
        this.telemetry.browserSessionsActive -= 1;
        logs.push(`Session timeout breached limits of ${task.timeoutMs}ms.`);
        return {
          success: false,
          content: "TIMEOUT_BREACHED",
          logs
        };
      }

      for (const action of task.actions) {
        logs.push(`Executing interactive event: ${action.type} (Selector: ${action.selector || "none"})`);
        if (action.type === "navigate" && action.value) {
          if (!isSafeUrl(action.value)) {
            this.telemetry.browserSessionsActive -= 1;
            logs.push(`Safety Policy Block: Forbidden redirect URL: ${action.value}`);
            return {
              success: false,
              content: "BLOCKED_BY_SAFETY_POLICY",
              logs
            };
          }
          this.telemetry.recordNavigation(action.value);
        }
      }

      this.telemetry.browserSessionsActive -= 1;
      return {
        success: true,
        screenshotUrl: `http://localhost:4566/screenshots/${task.id}.png`,
        content: `<html><body>Mock page loaded: ${task.url}</body></html>`,
        logs
      };
    }

    // High fidelity production Playwright integration with active request filtering
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { chromium } = require("playwright");
      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext();
      const page = await context.newPage();

      logs.push("Real chromium browser context initiated.");

      // Route intercepting to prevent DNS rebinding or in-page malicious redirects
      await page.route("**/*", (route: any) => {
        const reqUrl = route.request().url();
        if (!isSafeUrl(reqUrl)) {
          logs.push(`In-page redirect / asset load blocked by safety policy: ${reqUrl}`);
          route.abort("blockedbyclient");
        } else {
          route.continue();
        }
      });

      const loadPromise = page.goto(task.url);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout of ${task.timeoutMs}ms breached.`)), task.timeoutMs)
      );

      await Promise.race([loadPromise, timeoutPromise]);

      for (const action of task.actions) {
        if (action.type === "click" && action.selector) {
          await page.click(action.selector);
        } else if (action.type === "type" && action.selector && action.value) {
          await page.type(action.selector, action.value);
        }
      }

      const content = await page.content();
      await browser.close();
      this.telemetry.browserSessionsActive -= 1;

      return {
        success: true,
        content,
        logs
      };
    } catch (err: any) {
      this.telemetry.browserSessionsActive -= 1;
      logs.push(`Playwright execution failure: ${err.message}`);
      return {
        success: false,
        content: `Error: ${err.message}`,
        logs
      };
    }
  }
}
