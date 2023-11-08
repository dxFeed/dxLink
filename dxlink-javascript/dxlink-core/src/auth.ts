/**
 * Authentication state that can be used to check if user is authorized on the remote endpoint.
 */
export enum DXLinkAuthState {
  /**
   * User is unauthorized on the remote endpoint.
   */
  UNAUTHORIZED = 'UNAUTHORIZED',
  /**
   * User in the process of authorization, but not yet authorized.
   */
  AUTHORIZING = 'AUTHORIZING',
  /**
   * User is authorized on the remote endpoint and can use it.
   */
  AUTHORIZED = 'AUTHORIZED',
}

/**
 * Listener for authentication state changes.
 */
export type DXLinkAuthStateChangeListener = (state: DXLinkAuthState, prev: DXLinkAuthState) => void
