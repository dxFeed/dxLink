import { useEffect, useState } from 'react'
import { Observable } from 'rxjs'

export function useObservable<T>(observable: Observable<T>, initial: T): T {
  const [value, setValue] = useState(initial)

  useEffect(() => {
    const subscription = observable.subscribe((v) => {
      setValue(v)
    })
    return () => subscription.unsubscribe()
  }, [observable])

  return value
}
