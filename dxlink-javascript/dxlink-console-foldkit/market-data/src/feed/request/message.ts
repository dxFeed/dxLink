import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import { RadioGroup } from '@foldkit/ui'

export const Message = defineMessageUnion({
  GotViewRadioGroupMessage: { message: RadioGroup.Message },
  UpdatedFeed: { value: Schema.String },
  UpdatedSpace: { value: Schema.String },
  ToggledFeedSection: { isOpen: Schema.Boolean },
})
export type Message = typeof Message.Type
