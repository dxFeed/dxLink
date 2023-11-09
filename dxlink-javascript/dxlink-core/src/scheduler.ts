/**
 * Scheduler for scheduling callbacks.
 */
export class Scheduler {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private timeoutIds: Record<string, any> = {}

  schedule = (callback: () => void, timeout: number, key: string) => {
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
