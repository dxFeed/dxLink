/** Sorted array with binary-search insert and lookup; equal items replace each other. */
export class SortedList<T> {
  private items: Array<T> = []
  private readonly comparator: (a: T, b: T) => number

  constructor(comparator: (a: T, b: T) => number) {
    this.comparator = comparator
  }

  get length(): number {
    return this.items.length
  }

  insert(item: T): void {
    const { found, index } = this.search(item)
    this.items.splice(index, found ? 1 : 0, item)
  }

  indexOf(item: T): number {
    const { found, index } = this.search(item)

    return found ? index : -1
  }

  remove(item: T): boolean {
    const { found, index } = this.search(item)
    if (found) {
      this.items.splice(index, 1)
    }

    return found
  }

  toArray(): ReadonlyArray<Readonly<T>> {
    return this.items
  }

  clear(): void {
    this.items = []
  }

  /** Where the item is, or where it would be inserted to keep the order. */
  private search(
    item: T,
    low = 0,
    high = this.items.length - 1
  ): Readonly<{ found: boolean; index: number }> {
    if (low > high) {
      return { found: false, index: low }
    }
    const mid = Math.floor((low + high) / 2)
    const candidate = this.items[mid]
    if (candidate === undefined) {
      return { found: false, index: low }
    }
    const order = this.comparator(item, candidate)
    if (order === 0) {
      return { found: true, index: mid }
    }

    return order < 0 ? this.search(item, low, mid - 1) : this.search(item, mid + 1, high)
  }
}
