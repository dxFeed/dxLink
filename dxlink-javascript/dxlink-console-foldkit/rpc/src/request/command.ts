import { Effect, Option, Schema } from 'effect'
import { Command, File } from 'foldkit'

import type { FileRegistry } from '@bufbuild/protobuf'

import { Descriptors, Summary } from '../domain'
import { RpcRegistry, resolveMethod } from '../service'
import { Message, checkedRequestFields } from './message'

/**
 * Retain a registry and hand its plain summary, with the identity it was retained under,
 * to the Model. The registry is retained before the summary is returned, so by the time
 * the form shows a service the registry can resolve it.
 */
const publishRegistry = (source: string, registry: FileRegistry) =>
  Effect.gen(function* () {
    const services = yield* Effect.try({
      try: () => Summary.summarizeRegistry(registry),
      catch: (cause) =>
        new Descriptors.DescriptorSetError({ message: Descriptors.describeFailure(cause), cause }),
    })
    const store = yield* RpcRegistry
    const registryId = yield* store.add(registry)

    return Message.SucceededLoadDescriptors({ registryId, source, services })
  })

export const LoadDescriptorUrl = Command.define('LoadDescriptorUrl', {
  args: { url: Schema.String },
  messages: [Message.SucceededLoadDescriptors, Message.FailedLoadDescriptors],
  execute: ({ url }) =>
    Descriptors.fetchDescriptorSet(url).pipe(
      Effect.flatMap((registry) => publishRegistry(url, registry)),
      Effect.catch((error) =>
        Effect.succeed(Message.FailedLoadDescriptors({ source: url, reason: error.message }))
      )
    ),
})

const DESCRIPTOR_FILE_TYPES = ['.binpb', '.bin', '.pb', '.json']

export const LoadDescriptorFile = Command.define('LoadDescriptorFile', {
  messages: [
    Message.SucceededLoadDescriptors,
    Message.FailedLoadDescriptors,
    Message.CancelledLoadDescriptorFile,
  ],
  execute: Effect.gen(function* () {
    const maybeFile = yield* File.select(DESCRIPTOR_FILE_TYPES)
    if (Option.isNone(maybeFile)) {
      return Message.CancelledLoadDescriptorFile()
    }
    const file = maybeFile.value
    const source = File.name(file)

    return yield* File.readAsArrayBuffer(file).pipe(
      Effect.mapError((error) => new Descriptors.DescriptorSetError({ message: error.reason })),
      Effect.flatMap((buffer) => Descriptors.decodeRegistry(new Uint8Array(buffer))),
      Effect.flatMap((registry) => publishRegistry(source, registry)),
      Effect.catch((error) =>
        Effect.succeed(Message.FailedLoadDescriptors({ source, reason: error.message }))
      )
    )
  }),
})

/**
 * Check the request JSON against the input message of the method it names, in the registry
 * it names. Succeeds with a verdict; fails when that method cannot be resolved, which is
 * the case once its registry is not retained.
 *
 * Either result names what was checked, so one that arrives after the text or the selection
 * moved on can be told apart from one about the current request.
 */
export const ValidateRequest = Command.define('ValidateRequest', {
  args: checkedRequestFields,
  messages: [Message.SucceededValidateRequest, Message.FailedValidateRequest],
  execute: ({ registryId, serviceName, methodName, json }) =>
    resolveMethod({ registryId, serviceName, methodLocalName: methodName }).pipe(
      Effect.map(({ method }) => {
        const parsed = Descriptors.parseRequest(method.input, json)

        return Message.SucceededValidateRequest({
          registryId,
          serviceName,
          methodName,
          json,
          maybeError: 'error' in parsed ? Option.some(parsed.error) : Option.none(),
        })
      }),
      Effect.catch((error) =>
        Effect.succeed(
          Message.FailedValidateRequest({
            registryId,
            serviceName,
            methodName,
            json,
            reason: error.message,
          })
        )
      )
    ),
})
