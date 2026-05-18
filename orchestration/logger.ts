import { ILogger } from './interfaces/logger.interface';

export class StructuredLogger implements ILogger {
  info(message: string, context?: any): void {
    console.log(`[INFO] ${message}`, context ? JSON.stringify(context) : "");
  }

  warn(message: string, context?: any): void {
    console.warn(`[WARN] ${message}`, context ? JSON.stringify(context) : "");
  }

  error(message: string, error?: any, context?: any): void {
    console.error(`[ERROR] ${message}`, error, context ? JSON.stringify(context) : "");
  }

  debug(message: string, context?: any): void {
    console.debug(`[DEBUG] ${message}`, context ? JSON.stringify(context) : "");
  }
}
