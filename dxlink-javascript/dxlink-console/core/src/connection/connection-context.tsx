import type { ConnectionViewModel } from './connection-view-model'
import { createViewModelContext } from '../view-model'

const context = createViewModelContext<ConnectionViewModel>('ConnectionViewModel')

/** Provides the page-scoped {@link ConnectionViewModel} to the console subtree. */
export const ConnectionProvider = context.Provider

/** Read the page's {@link ConnectionViewModel} (throws if used outside the provider). */
export const useConnectionVM = context.useContextValue
