import { createContext, useContext, useEffect, useState } from 'react'
import type { Context, Provider } from 'react'
import type { StoreApi } from 'zustand'
import { useStore } from 'zustand'

/**
 * Base contract for every ViewModel. A ViewModel owns its UI state in a vanilla
 * Zustand store and exposes `dispose()` to release resources (listeners, sockets).
 *
 * `dispose()` MUST be idempotent: React 19 StrictMode mounts → unmounts → remounts
 * components, so a VM may be disposed and re-created; double-dispose must be a no-op.
 */
export interface ViewModel<State = unknown> {
  readonly store: StoreApi<State>
  dispose(): void
}

/**
 * Bind a React component to a slice of a ViewModel's store. Re-renders only when
 * the selected slice changes. This is the single binding primitive for the app —
 * no manual `useEffect` listener plumbing in views.
 */
export const useVM = <State, Slice>(
  vm: { readonly store: StoreApi<State> },
  selector: (state: State) => Slice
): Slice => useStore(vm.store, selector)

/**
 * Own a ViewModel for the lifetime of the calling component.
 *
 * StrictMode-safe: the VM is constructed exactly once via lazy `useState` init
 * (never `new VM()` inline in render), and `dispose()` runs on unmount. Combined
 * with an idempotent `dispose()`, this prevents leaking resources across React's
 * mount → unmount → remount double-invoke in development.
 */
export const useOwnedViewModel = <VM extends { dispose(): void }>(factory: () => VM): VM => {
  const [vm] = useState(factory)

  useEffect(() => () => vm.dispose(), [vm])

  return vm
}

/**
 * Create a typed React context for sharing a ViewModel down a page subtree
 * (avoids prop-drilling). The returned `useContextValue` hook throws if used
 * outside its provider.
 */
export const createViewModelContext = <VM>(
  displayName: string
): {
  Provider: Provider<VM | null>
  Context: Context<VM | null>
  useContextValue: () => VM
} => {
  const ViewModelContext = createContext<VM | null>(null)
  ViewModelContext.displayName = displayName

  const useContextValue = (): VM => {
    const value = useContext(ViewModelContext)
    if (value === null) {
      throw new Error(`${displayName}: used outside of its provider`)
    }
    return value
  }

  return { Provider: ViewModelContext.Provider, Context: ViewModelContext, useContextValue }
}
