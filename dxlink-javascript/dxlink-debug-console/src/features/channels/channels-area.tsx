import InsightsIcon from '@mui/icons-material/Insights'
import ShowChartIcon from '@mui/icons-material/ShowChart'
import ViewColumnIcon from '@mui/icons-material/ViewColumn'
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
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { createIndicatorEntry } from './types'
import type {
  ChannelConfig,
  ChannelKind,
  DomRequest,
  DraftChannel,
  FeedRequest,
  IndiChartRequest,
} from './types'
import { ErrorBoundary } from '../../shared/components/error-boundary'
import { DomChannel } from '../dom/dom-channel'
import { DomChannelRequest } from '../dom/dom-channel-request'
import { FeedChannel } from '../feed/feed-channel'
import { FeedChannelRequest } from '../feed/feed-channel-request'
import { IndiChartChannel } from '../indichart/indichart-channel'
import { IndiChartChannelRequest } from '../indichart/indichart-channel-request'

const ADD_BUTTONS: { kind: ChannelKind; label: string; icon: ReactNode }[] = [
  { kind: 'feed', label: 'Feed', icon: <ShowChartIcon /> },
  { kind: 'dom', label: 'DOM', icon: <ViewColumnIcon /> },
  { kind: 'indichart', label: 'IndiChart', icon: <InsightsIcon /> },
]

const LABELS: Record<ChannelKind, string> = { feed: 'Feed', dom: 'DOM', indichart: 'IndiChart' }

const DIALOG_TITLES: Record<ChannelKind, string> = {
  feed: 'New Feed channel',
  dom: 'New DOM channel',
  indichart: 'New IndiChart channel',
}

const renderChannel = (channel: DraftChannel) => {
  const title = `${LABELS[channel.config.kind]} #${channel.id}`
  switch (channel.config.kind) {
    case 'feed':
      return <FeedChannel title={title} config={channel.config} />
    case 'dom':
      return <DomChannel title={title} config={channel.config} />
    case 'indichart':
      return <IndiChartChannel title={title} config={channel.config} />
  }
}

/**
 * Channels area (draft / presentational only). Owns the open channels and the
 * per-service channel-request dialog. Request forms keep their values between
 * opens so the user can quickly open several channels; each opened channel
 * manages its own state.
 */
export const ChannelsArea = () => {
  const [channels, setChannels] = useState<DraftChannel[]>([])
  const [requestKind, setRequestKind] = useState<ChannelKind | null>(null)

  const [feedRequest, setFeedRequest] = useState<FeedRequest>({
    view: 'subscriptions',
    feed: '',
    space: '',
  })
  const [domRequest, setDomRequest] = useState<DomRequest>({
    symbol: 'AAPL',
    // AGGREGATE is the price-level source that works without picking a venue.
    source: 'AGGREGATE',
    feed: '',
    space: '',
  })
  const [indiRequest, setIndiRequest] = useState<IndiChartRequest>(() => ({
    indicators: [createIndicatorEntry()],
  }))

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

  /**
   * Open the request dialog for a service.
   *
   * All three requests keep their values between opens, so several similar channels are
   * quick to create. IndiChart used to be reset here, on the assumption that its editor
   * was uncontrolled — it is not: `DxScriptEditor` takes a `script` prop and pushes it
   * back into the editor, so the scripts are restored along with the state.
   */
  const openRequest = (kind: ChannelKind) => {
    setRequestKind(kind)
  }

  const openChannel = () => {
    if (requestKind === null) {
      return
    }
    const id = String(nextId.current)
    nextId.current += 1

    let config: ChannelConfig
    if (requestKind === 'feed') {
      config = {
        kind: 'feed',
        view: feedRequest.view,
        feed: feedRequest.feed.trim(),
        space: feedRequest.space.trim(),
      }
    } else if (requestKind === 'dom') {
      config = {
        kind: 'dom',
        symbol: domRequest.symbol.trim(),
        source: domRequest.source.trim(),
        feed: domRequest.feed.trim(),
        space: domRequest.space.trim(),
      }
    } else {
      config = {
        kind: 'indichart',
        indicators: indiRequest.indicators
          .map((entry) => entry.code)
          .filter((code) => code.trim() !== ''),
      }
    }

    setChannels((current) => [...current, { id, config }])
    setRequestKind(null)
    setScrollToId(id)
  }

  const canOpen =
    requestKind === 'dom'
      ? domRequest.symbol.trim().length > 0
      : requestKind === 'indichart'
        ? indiRequest.indicators.some((entry) => entry.code.trim() !== '')
        : true

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography variant="h6" sx={{ fontWeight: 700, mr: 1 }}>
          Channels
        </Typography>
        {ADD_BUTTONS.map((button) => (
          <Button
            key={button.kind}
            size="small"
            variant="outlined"
            color="inherit"
            startIcon={button.icon}
            onClick={() => openRequest(button.kind)}
          >
            {button.label}
          </Button>
        ))}
      </Stack>

      {channels.length === 0 ? (
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
              No channels open. Use the buttons above to open a Feed, DOM or IndiChart channel.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        channels.map((channel) => (
          <Box key={channel.id} id={`channel-${channel.id}`} sx={{ scrollMarginTop: 80 }}>
            {/* One failing channel must not take the others down with it. */}
            <ErrorBoundary title={`${LABELS[channel.config.kind]} channel #${channel.id} failed`}>
              {renderChannel(channel)}
            </ErrorBoundary>
          </Box>
        ))
      )}

      <Dialog
        open={requestKind !== null}
        onClose={() => setRequestKind(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{requestKind ? DIALOG_TITLES[requestKind] : ''}</DialogTitle>
        <DialogContent dividers>
          {requestKind === 'feed' && (
            <FeedChannelRequest value={feedRequest} onChange={setFeedRequest} />
          )}
          {requestKind === 'dom' && (
            <DomChannelRequest value={domRequest} onChange={setDomRequest} />
          )}
          {requestKind === 'indichart' && (
            <IndiChartChannelRequest value={indiRequest} onChange={setIndiRequest} />
          )}
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setRequestKind(null)}>
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
