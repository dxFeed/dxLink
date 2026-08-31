import { getDefaultWsUrl } from '../shared/lib/connection-url'
import { readInjectedConfig, resolveConsoleConfig } from '../shared/lib/console-config'
import type { ConsoleConfig } from '../shared/lib/console-config'

/**
 * Resolve the profile this build of the console starts from.
 *
 * The one place that reads globals: the page location, whatever the host injected as
 * `window.__DXLINK_CONFIG__`, and the query string. Everything below takes the resolved
 * profile as data, which is what lets the console page be embedded by a host that has its
 * own answers.
 *
 * The app layer carries the only build-time choice — a development build points at the
 * shared relay rather than at the page's own origin, which is what `getDefaultWsUrl` has
 * always decided.
 */
export const resolveAppConsoleConfig = (): ConsoleConfig =>
  resolveConsoleConfig({
    location: window.location,
    app: { wsUrl: getDefaultWsUrl(window.location, import.meta.env.PROD) },
    injected: readInjectedConfig(window),
    search: window.location.search,
  })
