import { Array, Option, Predicate, Record, pipe } from 'effect'

/**
 * Render one channel parameter, or `None` when it carries no information.
 *
 * Channel parameters are `unknown`: DOM sends `sources` as an array, other services send
 * strings or numbers, and optional ones arrive as `undefined`. A parameter the client omitted,
 * or an empty list, means "server default" — showing `sources: ` with nothing after it is
 * worse than showing nothing at all.
 */
const describeParameter = (value: unknown): Option.Option<string> => {
  if (Predicate.isNullish(value)) {
    return Option.none()
  }
  if (Array.isArray(value)) {
    return Array.isArrayNonEmpty(value) ? Option.some(value.join(', ')) : Option.none()
  }
  if (Predicate.isObject(value)) {
    return Option.some(JSON.stringify(value))
  }

  return Option.liftPredicate(globalThis.String(value), (text) => text !== '')
}

/**
 * The parameters a channel was opened with, as text, without the ones that say nothing.
 *
 * This is the form a channel keeps in its Model: what a dxLink channel reports can hold
 * `undefined` and arbitrary objects, and a Model holds plain data only.
 */
export const describeChannelParameters = (
  parameters: Readonly<Record<string, unknown>>
): Readonly<Record<string, string>> =>
  pipe(
    Record.toEntries(parameters),
    Array.map(([key, value]) =>
      Option.map(describeParameter(value), (text): [string, string] => [key, text])
    ),
    Array.getSomes,
    Record.fromEntries
  )
