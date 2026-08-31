import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useEffect, useMemo, useRef, useState } from 'react'

import type { ErasedChannelPlugin } from './plugin'
import type { DraftChannel } from './types'
import { ErrorBoundary } from '../../shared/components/error-boundary'
import { useConsoleConfig } from '../../shared/lib/console-config-context'

/**
 * Letters whose *name* starts with a vowel sound, so an acronym beginning with one takes
 * "an": an RPC, an FX, an SLA. Note U is absent — "a U-turn", because its name is "yoo".
 */
const VOWEL_SOUND_LETTERS = 'AEFHILMNORSX'

/**
 * "a" or "an" for a channel label.
 *
 * Pronunciation decides this, not spelling, and the two disagree for exactly the labels this
 * console has: RPC is read "ar-pee-see" and takes "an", while DOM is read as a word and
 * takes "a". So an all-caps label is judged by its first letter's name and anything else by
 * its first letter's sound.
 */
const indefiniteArticle = (label: string): string => {
  const first = (label[0] ?? '').toUpperCase()
  const vowelSound =
    label === label.toUpperCase() ? VOWEL_SOUND_LETTERS.includes(first) : 'AEIOU'.includes(first)

  return vowelSound ? 'an' : 'a'
}

/**
 * "a Feed channel", "an RPC channel", "a Feed, DOM or RPC channel".
 *
 * The article agrees with the first label, which is the only one it touches. Never called
 * with an empty list — the caller has its own copy for a console offering nothing.
 */
const formatKindList = (plugins: readonly ErasedChannelPlugin[]): string => {
  const labels = plugins.map((plugin) => plugin.label)
  const last = labels[labels.length - 1]
  const list = labels.length === 1 ? last : `${labels.slice(0, -1).join(', ')} or ${last}`

  return `${indefiniteArticle(labels[0] ?? '')} ${list} channel`
}

export interface ChannelsAreaProps {
  /**
   * The channel services this console offers, in the order their add-buttons appear.
   *
   * Required, and deliberately so: which services exist is a composition decision, not a
   * default. A console that should not offer market data simply does not register those
   * plugins — and then never imports their code either.
   */
  channels: readonly ErasedChannelPlugin[]
}

/**
 * Channels area (draft / presentational only). Owns the open channels and the
 * per-service channel-request dialog. Request forms keep their values between
 * opens so the user can quickly open several channels; each opened channel
 * manages its own state.
 *
 * Knows nothing about any particular service. Add-buttons, dialog titles, request forms,
 * validation and the channel bodies all come from the registered {@link ChannelPlugin}s, so
 * adding or removing a service touches only the composition site.
 *
 * Two filters, doing different jobs: the registered plugins say which services exist in
 * this build, and the profile's `channelKinds` says which of those this deployment offers.
 * The second filters buttons only — an already-open channel keeps rendering, so a profile
 * that disagrees with what is on screen degrades instead of crashing.
 */
export const ChannelsArea = ({ channels }: ChannelsAreaProps) => {
  const config = useConsoleConfig()
  const offered = channels.filter((plugin) => config.channelKinds.includes(plugin.kind))
  const byKind = useMemo(() => new Map(channels.map((plugin) => [plugin.kind, plugin])), [channels])

  const [openChannels, setOpenChannels] = useState<DraftChannel[]>([])
  const [activePlugin, setActivePlugin] = useState<ErasedChannelPlugin | null>(null)

  /**
   * One request value per registered plugin, seeded once.
   *
   * Every request keeps its values between opens, so several similar channels are quick to
   * create. IndiChart used to be reset on open, on the assumption that its editor was
   * uncontrolled — it is not: `DxScriptEditor` takes a `script` prop and pushes it back
   * into the editor, so the scripts are restored along with the state.
   */
  const [requests, setRequests] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(channels.map((plugin) => [plugin.kind, plugin.createRequest()]))
  )

  const nextId = useRef(1)
  const [scrollToId, setScrollToId] = useState<string | null>(null)

  useEffect(() => {
    if (scrollToId === null) {
      return
    }
    document
      .getElementById(`channel-${scrollToId}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setScrollToId(null)
  }, [scrollToId])

  const openChannel = () => {
    if (activePlugin === null) {
      return
    }
    const channelConfig = activePlugin.buildConfig(requests[activePlugin.kind])
    if (channelConfig === null) {
      return
    }
    const id = String(nextId.current)
    nextId.current += 1

    setOpenChannels((current) => [
      ...current,
      { id, kind: activePlugin.kind, config: channelConfig },
    ])
    setActivePlugin(null)
    setScrollToId(id)
  }

  const canOpen =
    activePlugin !== null && (activePlugin.canOpen?.(requests[activePlugin.kind]) ?? true)

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography variant="h6" sx={{ fontWeight: 700, mr: 1 }}>
          Channels
        </Typography>
        {offered.map((plugin) => (
          <Button
            key={plugin.kind}
            size="small"
            variant="outlined"
            color="inherit"
            startIcon={plugin.icon}
            onClick={() => setActivePlugin(plugin)}
          >
            {plugin.label}
          </Button>
        ))}
      </Stack>

      {openChannels.length === 0 ? (
        <Card variant="outlined">
          <CardContent
            sx={{
              minHeight: 160,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
            }}
          >
            <Typography color="text.secondary">
              {offered.length === 0
                ? 'This console is configured with no channel services.'
                : `No channels open. Use the buttons above to open ${formatKindList(offered)}.`}
            </Typography>
          </CardContent>
        </Card>
      ) : (
        openChannels.map((channel) => {
          const plugin = byKind.get(channel.kind)
          if (plugin === undefined) {
            return null
          }

          return (
            <Box key={channel.id} id={`channel-${channel.id}`} sx={{ scrollMarginTop: 80 }}>
              {/* One failing channel must not take the others down with it. */}
              <ErrorBoundary title={`${plugin.label} channel #${channel.id} failed`}>
                <plugin.Channel title={`${plugin.label} #${channel.id}`} config={channel.config} />
              </ErrorBoundary>
            </Box>
          )
        })
      )}

      <Dialog
        open={activePlugin !== null}
        onClose={() => setActivePlugin(null)}
        fullWidth
        maxWidth={activePlugin?.dialogMaxWidth ?? 'sm'}
      >
        <DialogTitle>{activePlugin?.dialogTitle ?? ''}</DialogTitle>
        <DialogContent dividers>
          {activePlugin !== null && (
            <activePlugin.RequestForm
              value={requests[activePlugin.kind]}
              onChange={(next) =>
                setRequests((current) => ({ ...current, [activePlugin.kind]: next }))
              }
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setActivePlugin(null)}>
            Cancel
          </Button>
          <Button variant="contained" onClick={openChannel} disabled={!canOpen}>
            Open channel
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}
