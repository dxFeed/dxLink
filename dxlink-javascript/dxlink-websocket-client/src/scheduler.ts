export interface Disoisable {
  (): void
}

export interface Scheduler {
  schedule(cb: () => void, delay?: number): Disoisable
  scheduleInterval(cb: () => void, period: number): Disoisable
}

export const newDefaultScheduler = (): Scheduler => ({
  schedule(cb: () => void, delay: number = 0): Disoisable {
    const timer = setTimeout(cb, delay)
    return () => clearTimeout(timer)
  },
  scheduleInterval(cb: () => void, period: number): Disoisable {
    const timer = setInterval(cb, period)
    return () => clearInterval(timer)
  },
})
