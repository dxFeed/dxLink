export class Scheduler {
  private timeoutIds: Record<string, any> = {}

  schedule = (callback: () => void, timeout: number, key: string) => {
    this.cancel(key)
    this.timeoutIds[key] = setTimeout(callback, timeout)

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
}
