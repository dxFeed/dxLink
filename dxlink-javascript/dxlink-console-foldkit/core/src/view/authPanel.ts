import { Redacted, String } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'

import * as Kit from '../kit'
import { Message } from '../message'
import type { Model } from '../model'

/**
 * Authorization panel, shown while the server reports UNAUTHORIZED or AUTHORIZING. Once the
 * client is authorized the page shows the channels area in its place.
 */
export const authPanel = (model: Model, isAuthorizing: boolean, h: HtmlBuilder<Message>): Html => {
  const token = Redacted.value(model.authToken)

  return h.section(
    [h.Class(Kit.CARD_CLASS), h.AriaLabel('Authorization')],
    [
      h.form(
        [h.Class('flex flex-col gap-4 p-4'), h.OnSubmit(Message.SubmittedAuthToken())],
        [
          h.h2([h.Class('font-bold')], ['Authorization']),
          h.div(
            [h.Class('flex flex-col gap-4 sm:flex-row sm:items-start')],
            [
              h.div(
                [h.Class('grow')],
                [
                  Kit.textField(
                    {
                      id: 'dxlink-auth-token',
                      label: 'Token',
                      type: 'password',
                      value: token,
                      onInput: (value) =>
                        Message.UpdatedAuthToken({
                          value: Redacted.make(value),
                        }),
                      isDisabled: isAuthorizing,
                      placeholder: 'Bearer token',
                      helperText: 'This server requires authorization before opening channels.',
                    },
                    h
                  ),
                ]
              ),
              h.div(
                [h.Class('sm:pt-5')],
                [
                  Kit.button(
                    {
                      label: isAuthorizing ? 'Authorizing…' : 'Authorize',
                      type: 'submit',
                      variant: 'Primary',
                      isDisabled: isAuthorizing || String.isEmpty(token.trim()),
                    },
                    h
                  ),
                ]
              ),
            ]
          ),
        ]
      ),
    ]
  )
}
