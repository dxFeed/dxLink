import { create, toBinary, toJsonString } from '@bufbuild/protobuf'
import {
  FieldDescriptorProto_Label,
  FieldDescriptorProto_Type,
  FileDescriptorSetSchema,
} from '@bufbuild/protobuf/wkt'

const field = (
  name: string,
  number: number,
  type: FieldDescriptorProto_Type,
  typeName?: string
) => ({
  name,
  jsonName: name,
  number,
  label: FieldDescriptorProto_Label.OPTIONAL,
  type,
  ...(typeName === undefined ? {} : { typeName }),
})

/**
 * A small descriptor set for tests: two services, one of which declares a client-streaming
 * method and a bidirectional one beside its unary method.
 */
export const descriptorSet = create(FileDescriptorSetSchema, {
  file: [
    {
      name: 'demo/v1/demo.proto',
      package: 'demo.v1',
      syntax: 'proto3',
      enumType: [
        {
          name: 'Side',
          value: [
            { name: 'BUY', number: 0 },
            { name: 'SELL', number: 1 },
          ],
        },
      ],
      messageType: [
        {
          name: 'Order',
          field: [
            field('symbol', 1, FieldDescriptorProto_Type.STRING),
            field('quantity', 2, FieldDescriptorProto_Type.INT64),
            field('live', 3, FieldDescriptorProto_Type.BOOL),
            field('price', 4, FieldDescriptorProto_Type.DOUBLE),
            field('side', 5, FieldDescriptorProto_Type.ENUM, '.demo.v1.Side'),
          ],
        },
        {
          name: 'Ack',
          field: [field('id', 1, FieldDescriptorProto_Type.STRING)],
        },
      ],
      service: [
        {
          name: 'OrderService',
          method: [
            {
              name: 'Issue',
              inputType: '.demo.v1.Order',
              outputType: '.demo.v1.Ack',
            },
            {
              name: 'Collect',
              inputType: '.demo.v1.Order',
              outputType: '.demo.v1.Ack',
              clientStreaming: true,
            },
            {
              name: 'Trade',
              inputType: '.demo.v1.Order',
              outputType: '.demo.v1.Ack',
              clientStreaming: true,
              serverStreaming: true,
            },
          ],
        },
        {
          name: 'AccountService',
          method: [
            {
              name: 'Get',
              inputType: '.demo.v1.Ack',
              outputType: '.demo.v1.Ack',
            },
          ],
        },
      ],
    },
  ],
})

export const binaryDescriptorSet = (): Uint8Array<ArrayBuffer> =>
  new Uint8Array(toBinary(FileDescriptorSetSchema, descriptorSet))

export const jsonDescriptorSet = (): Uint8Array<ArrayBuffer> =>
  new Uint8Array(new TextEncoder().encode(toJsonString(FileDescriptorSetSchema, descriptorSet)))
