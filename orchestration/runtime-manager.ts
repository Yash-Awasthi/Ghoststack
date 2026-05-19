import { IConfigLoader } from "../runtime/config-loader";

export interface IRuntimeManager {
  getActiveServices(): Promise<string[]>;
}

export class RuntimeManager implements IRuntimeManager {
  private configLoader: IConfigLoader;

  constructor(configLoader: IConfigLoader) {
    this.configLoader = configLoader;
  }

  async getActiveServices(): Promise<string[]> {
    try {
      const servicesConfig = await this.configLoader.loadServices();
      return Object.keys(servicesConfig?.services || {});
    } catch (err) {
      console.error("RuntimeManager failed to load services:", err);
      return [];
    }
  }
}
