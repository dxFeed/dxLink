import { createContext, useContext } from 'react'

import type { ConsoleConfig } from './console-config'

const ConsoleConfigContext = createContext<ConsoleConfig | null>(null)
ConsoleConfigContext.displayName = 'ConsoleConfig'

/**
 * Provides the resolved {@link ConsoleConfig} to the console subtree.
 *
 * A context rather than props because the values are read in two places at different
 * depths — the connection panel and the channels area — and threading a profile through
 * every layer between would be noise. Same reasoning as the connection ViewModel context;
 * this one carries plain data, so it is not built on the ViewModel helper.
 */
export const ConsoleConfigProvider = ConsoleConfigContext.Provider

/** Read the console's configuration profile (throws if used outside the provider). */
export const useConsoleConfig = (): ConsoleConfig => {
  const value = useContext(ConsoleConfigContext)
  if (value === null) {
    throw new Error('ConsoleConfig: used outside of its provider')
  }

  return value
}
