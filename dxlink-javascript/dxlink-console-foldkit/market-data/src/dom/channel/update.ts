import { Option } from 'effect'
import type { Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import {
  type ReportedError,
  clearErrors as clearErrorLog,
  emptyErrorLog,
  prependError,
} from '@dxfeed/dxlink-console-foldkit-core'

import { type Config, Ladder } from '../domain'
import type { DomServices } from '../service'
import { ConfigureDomChannel } from './command'
import { Message } from './message'
import { type AcceptForm, Lifecycle, Model, type Opened } from './model'

type UpdateReturn = Update.Return<Model, Message, DomServices>

// INIT

/**
 * A channel starts out opening: the console connects its live side for as long as the card is
 * open, and the result of that arrives as a Message.
 */
export const init = ({
  channelId,
  config,
}: Readonly<{ channelId: string; config: Config.DomConfig }>): UpdateReturn => ({
  model: Model.make({
    channelId,
    config,
    lifecycle: Lifecycle.Opening(),
    errorLog: emptyErrorLog(),
  }),
})

// UPDATE

/**
 * The order fields start at what the server returns today, so the request starts from
 * reality. Any other field can be typed in — the server decides, and what it applied is
 * shown beside what was asked.
 */
const INITIAL_ACCEPT_FORM: AcceptForm = {
  aggregationPeriod: '',
  depthLimit: '',
  orderFields: 'price, size',
}

/** Change what an opened channel holds. In every other state the Model is returned as it is. */
const modifyOpened = (model: Model, modify: (opened: Opened) => Opened): Model =>
  modifyFields(model, {
    lifecycle: (lifecycle) =>
      Lifecycle.matchOrElse(lifecycle, { Opened: modify }, (other): Lifecycle => other),
  })

const modifyAcceptForm = (model: Model, modify: (acceptForm: AcceptForm) => AcceptForm): Model =>
  modifyOpened(model, (opened) => modifyFields(opened, { acceptForm: modify }))

const logError = (model: Model, error: ReportedError): Model =>
  modifyFields(model, { errorLog: (errorLog) => prependError(errorLog, error) })

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    SucceededOpenDomChannel: ({ protocolChannelId, parameters, channelState, applied }) => ({
      model: modifyFields(model, {
        lifecycle: (lifecycle) =>
          Lifecycle.matchOrElse(
            lifecycle,
            {
              Opening: () =>
                Lifecycle.Opened({
                  protocolChannelId,
                  parameters,
                  channelState,
                  applied,
                  maybeSnapshot: Option.none(),
                  acceptForm: INITIAL_ACCEPT_FORM,
                  isConfigurationOpen: false,
                }),
            },
            (other): Lifecycle => other
          ),
      }),
    }),

    FailedOpenDomChannel: ({ error }) => ({
      model: modifyFields(logError(model, error), {
        lifecycle: (lifecycle) =>
          Lifecycle.matchOrElse(
            lifecycle,
            { Opening: () => Lifecycle.FailedToOpen() },
            (other): Lifecycle => other
          ),
      }),
    }),

    ReceivedSnapshot: ({ snapshot }) => ({
      model: modifyOpened(model, (opened) =>
        modifyFields(opened, { maybeSnapshot: () => Option.some(snapshot) })
      ),
    }),

    ChangedChannelState: ({ channelState }) => ({
      model: modifyOpened(model, (opened) =>
        modifyFields(opened, { channelState: () => channelState })
      ),
    }),

    ChangedAppliedConfig: ({ applied }) => ({
      model: modifyOpened(model, (opened) => modifyFields(opened, { applied: () => applied })),
    }),

    ReportedChannelError: ({ error }) => ({ model: logError(model, error) }),

    ToggledConfiguration: ({ isOpen }) => ({
      model: modifyOpened(model, (opened) =>
        modifyFields(opened, { isConfigurationOpen: () => isOpen })
      ),
    }),

    UpdatedAcceptAggregationPeriod: ({ value }) => ({
      model: modifyAcceptForm(model, (acceptForm) =>
        modifyFields(acceptForm, { aggregationPeriod: () => value })
      ),
    }),

    UpdatedAcceptDepthLimit: ({ value }) => ({
      model: modifyAcceptForm(model, (acceptForm) =>
        modifyFields(acceptForm, { depthLimit: () => value })
      ),
    }),

    UpdatedAcceptOrderFields: ({ value }) => ({
      model: modifyAcceptForm(model, (acceptForm) =>
        modifyFields(acceptForm, { orderFields: () => value })
      ),
    }),

    // NOTE: any field name is let through, deliberately. The server decides what it returns
    // and may honour none of it — which is the point of asking from a debug console.
    ClickedApplyConfiguration: () =>
      Lifecycle.matchOrElse(
        model.lifecycle,
        {
          Opened: ({ acceptForm }): UpdateReturn => ({
            model,
            commands: [
              ConfigureDomChannel({
                channelId: model.channelId,
                maybeAggregationPeriod: Ladder.parseOptionalNumber(acceptForm.aggregationPeriod),
                maybeDepthLimit: Ladder.parseOptionalNumber(acceptForm.depthLimit),
                maybeOrderFields:
                  acceptForm.orderFields.trim() === ''
                    ? Option.none()
                    : Option.some(Ladder.parseList(acceptForm.orderFields)),
              }),
            ],
          }),
        },
        (): UpdateReturn => ({ model })
      ),

    SucceededConfigureDomChannel: () => ({ model }),

    FailedConfigureDomChannel: ({ error }) => ({ model: logError(model, error) }),
  })

/**
 * The channel as it reads once its card is closed. What stays is the record of the channel:
 * what it was opened with, its protocol channel id and its errors.
 */
export const close = (model: Model): Model =>
  modifyFields(model, {
    lifecycle: (lifecycle) =>
      Lifecycle.Closed({
        maybeProtocolChannelId: Lifecycle.match(lifecycle, {
          Opening: () => Option.none(),
          Opened: ({ protocolChannelId }) => Option.some(protocolChannelId),
          FailedToOpen: () => Option.none(),
          Closed: ({ maybeProtocolChannelId }) => maybeProtocolChannelId,
        }),
      }),
  })

export const clearErrors = (model: Model): Model => modifyFields(model, { errorLog: clearErrorLog })
