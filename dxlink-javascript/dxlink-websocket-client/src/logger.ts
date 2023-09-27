/**
 * A logger interface that can be used to log messages.
 */
export interface DXLinkLogger {
  debug(message: string, ...args: unknown[]): void
  info(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
}

/**
 * Level of logging that can be used to filter out messages.
 */
export enum DXLinkLogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

/**
 * A logger that uses the console to log messages.
 * @internal
 */
export class Logger implements DXLinkLogger {
  constructor(private readonly prefix: string, private readonly level: DXLinkLogLevel) {}

  debug(message: string, ...args: unknown[]): void {
    if (this.level <= DXLinkLogLevel.DEBUG) {
      console.debug(`[${this.prefix}] ${message}`, ...args)
    }
  }
  info(message: string, ...args: unknown[]): void {
    if (this.level <= DXLinkLogLevel.INFO) {
      console.info(`[${this.prefix}] ${message}`, ...args)
    }
  }
  warn(message: string, ...args: unknown[]): void {
    if (this.level <= DXLinkLogLevel.WARN) {
      console.warn(`[${this.prefix}] ${message}`, ...args)
    }
  }
  error(message: string, ...args: unknown[]): void {
    if (this.level <= DXLinkLogLevel.ERROR) {
      console.error(`[${this.prefix}] ${message}`, ...args)
    }
  }
}
