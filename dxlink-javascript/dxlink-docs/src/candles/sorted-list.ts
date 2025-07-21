export class SortedList<T> {
  private items: T[]
  private comparator: (a: T, b: T) => number

  constructor(comparator: (a: T, b: T) => number) {
    this.items = []
    this.comparator = comparator
  }

  public static from<T>(array: T[], comparator: (a: T, b: T) => number): SortedList<T> {
    const sortedList = new SortedList(comparator)
    for (const item of array) {
      sortedList.insert(item)
    }
    return sortedList
  }

  public insert(item: T): void {
    const [mid, low] = this.search(item)
    if (mid === -1) {
      this.items.splice(low, 0, item)
      return
    }

    this.items[mid] = item
  }

  public indexOf(item: T): number {
    const [index] = this.search(item)
    return index
  }

  private search(item: T): [number, number] {
    let low = 0
    let high = this.items.length - 1

    while (low <= high) {
      const mid = Math.floor((low + high) / 2)
      const compareResult = this.comparator(item, this.items[mid]!)

      if (compareResult === 0) {
        return [mid, mid]
      } else if (compareResult < 0) {
        high = mid - 1
      } else {
        low = mid + 1
      }
    }

    return [-1, low]
  }

  public remove(item: T): boolean {
    const index = this.indexOf(item)
    if (index !== -1) {
      this.items.splice(index, 1)
      return true
    }

    return false
  }

  public get length(): number {
    return this.items.length
  }

  public toArray(): ReadonlyArray<Readonly<T>> {
    return this.items
  }

  public clear(): void {
    this.items = []
  }
}
