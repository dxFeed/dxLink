/**
 * Scheduler for scheduling callbacks.
 */
export interface DXLinkScheduler {
  schedule(callback: () => void, timeout: number, key: string): string
  cancel(key: string): void
  clear(): void
  has(key: string): boolean
}

/**
 * Default scheduler implementation based on browser timers.
 */
export class DefaultDXLinkScheduler implements DXLinkScheduler {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private timeoutIds: Record<string, any> = {}

  schedule = (callback: () => void, timeout: number, key: string): string => {
    this.cancel(key)
    this.timeoutIds[key] = setTimeout(() => {
      delete this.timeoutIds[key]
      callback()
    }, timeout)

    return key
  }

  cancel = (key: string) => {
    if (this.timeoutIds[key] !== undefined) {
      clearTimeout(this.timeoutIds[key])
      delete this.timeoutIds[key]
    }
  }

  clear = () => {
    for (const key of Object.keys(this.timeoutIds)) {
      this.cancel(key)
    }
  }

  has = (key: string) => {
    return this.timeoutIds[key] !== undefined
  }
}

/**
 * @deprecated Use {@link DefaultDXLinkScheduler} instead.
 */
export class Scheduler extends DefaultDXLinkScheduler {}
