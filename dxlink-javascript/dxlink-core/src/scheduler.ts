const BATCHING_SIZE = 0.01

const getBatchTime = (timeoutMs: number): number => {
  const intervalMs = Math.max(1, timeoutMs * BATCHING_SIZE)
  return Math.floor((Date.now() + timeoutMs) / intervalMs) * intervalMs
}

type Batch = {
  timeoutId: ReturnType<typeof setTimeout>
  callbacks: Map<string, () => void>
}

/**
 * Scheduler for scheduling callbacks.
 * Batches timers by quantized end time so repeated schedules in the same time window share one timer.
 */
export class Scheduler {
  private batches = new Map<number, Batch>()
  private keyToBatch = new Map<string, number>()

  private removeKeyFromBatch(key: string, batchKey: number): void {
    const batch = this.batches.get(batchKey)
    if (batch === undefined) return
    batch.callbacks.delete(key)
    if (batch.callbacks.size === 0) {
      clearTimeout(batch.timeoutId)
      this.batches.delete(batchKey)
    }
  }

  private runBatch(batchKey: number): void {
    const batch = this.batches.get(batchKey)
    if (batch === undefined) return
    this.batches.delete(batchKey)
    for (const [k, cb] of batch.callbacks) {
      this.keyToBatch.delete(k)
      cb()
    }
  }

  schedule = (callback: () => void, timeout: number, key: string) => {
    const batchKey = getBatchTime(timeout)
    const existingBatchKey = this.keyToBatch.get(key)

    if (existingBatchKey !== undefined) {
      if (existingBatchKey === batchKey) {
        const batch = this.batches.get(batchKey)
        if (batch !== undefined) {
          batch.callbacks.set(key, callback)
          return key
        }
      }
      this.removeKeyFromBatch(key, existingBatchKey)
    }

    let batch = this.batches.get(batchKey)
    if (batch === undefined) {
      const delay = Math.max(0, batchKey - Date.now())
      batch = {
        timeoutId: setTimeout(() => this.runBatch(batchKey), delay),
        callbacks: new Map(),
      }
      this.batches.set(batchKey, batch)
    }

    batch.callbacks.set(key, callback)
    this.keyToBatch.set(key, batchKey)
    return key
  }

  cancel = (key: string) => {
    const batchKey = this.keyToBatch.get(key)
    if (batchKey === undefined) return
    this.keyToBatch.delete(key)
    this.removeKeyFromBatch(key, batchKey)
  }

  clear = () => {
    for (const batch of this.batches.values()) {
      clearTimeout(batch.timeoutId)
    }
    this.batches.clear()
    this.keyToBatch.clear()
  }

  has = (key: string) => {
    return this.keyToBatch.has(key)
  }
}
