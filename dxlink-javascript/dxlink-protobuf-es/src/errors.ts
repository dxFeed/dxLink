/**
 * Thrown when a service descriptor declares a method whose interaction model the dxLink
 * protocol v1.0 wire cannot carry.
 *
 * Raised while the service client is being built, not when the method is called, so an
 * unsupported method is reported as soon as the descriptor is bound.
 * @see {@link createDXLinkService}
 */
export class DXLinkUnsupportedMethodKindError extends Error {
  /**
   * Fully qualified name of the service that declares the method.
   */
  readonly service: string
  /**
   * Name of the method as declared in the protobuf source.
   */
  readonly method: string
  /**
   * protobuf-es method kind that has no dxLink interaction model.
   */
  readonly methodKind: string

  constructor(service: string, method: string, methodKind: string) {
    super(
      `dxLink does not support the ${methodKind} interaction model required by ${service}/${method}`
    )
    this.name = 'DXLinkUnsupportedMethodKindError'
    this.service = service
    this.method = method
    this.methodKind = methodKind
  }
}
