import CloseIcon from '@mui/icons-material/Close'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import Avatar from '@mui/material/Avatar'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useState } from 'react'

import type { TimestampedError } from '../../shared/lib/timestamped-error'
import { ErrorCenter } from '../errors/error-center'

interface ChannelWidgetProps {
  icon: React.ReactNode
  title: string
  subtitle?: string
  /** Status slot (e.g. a Chip) shown before the collapse/close actions. */
  status?: React.ReactNode
  /**
   * Protocol channel id, shown next to the subtitle so a card can be correlated with
   * a protocol log. Distinct from the card's own sequential number in `title`.
   */
  channelId?: number | null
  /** Parameters the channel was opened with, listed as chips under the header. */
  parameters?: Readonly<Record<string, unknown>> | null
  /**
   * Errors scoped to this channel. Surfaced here rather than in the connection-level
   * error center, so it stays obvious which channel failed.
   */
  errors?: readonly TimestampedError[]
  onClearErrors?: () => void
  /**
   * Fired once when the user closes the channel. The card stays (closed state is
   * owned here) — use this to release the channel's resources (e.g. close the
   * underlying dxlink channel).
   */
  onClose?: () => void
  defaultExpanded?: boolean
  children: React.ReactNode
}

/**
 * Generic collapsible channel card shell (draft / presentational). Every channel
 * kind (feed, dom, indichart) renders its content inside this shell.
 *
 * Closing is a channel-view concern: it does NOT remove the card from the area —
 * the widget owns its own closed state. Closing is terminal (the dxlink channel
 * CLOSED state): the card stays as a header-only record marked "closed" — its
 * content is no longer rendered — and it cannot be reopened.
 */
export const ChannelWidget = ({
  icon,
  title,
  subtitle,
  status,
  channelId,
  parameters,
  errors,
  onClearErrors,
  onClose,
  defaultExpanded = true,
  children,
}: ChannelWidgetProps) => {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [closed, setClosed] = useState(false)

  const handleClose = () => {
    setClosed(true)
    onClose?.()
  }

  const subheader =
    channelId != null ? [subtitle, `channel #${channelId}`].filter(Boolean).join(' · ') : subtitle

  const parameterEntries = Object.entries(parameters ?? {}).filter(
    ([, value]) => value !== undefined
  )

  return (
    <Card>
      <CardHeader
        // Center the action slot (status chip + icon buttons) against the
        // avatar/title instead of MUI's default top-right offset.
        sx={{ '& .MuiCardHeader-action': { alignSelf: 'center', m: 0 } }}
        avatar={
          <Avatar
            variant="rounded"
            sx={{
              bgcolor: closed ? 'action.disabledBackground' : 'action.selected',
              color: closed ? 'text.disabled' : 'text.primary',
              width: 38,
              height: 38,
            }}
          >
            {icon}
          </Avatar>
        }
        title={
          <Typography sx={{ fontWeight: 700, color: closed ? 'text.secondary' : 'text.primary' }}>
            {title}
          </Typography>
        }
        subheader={subheader}
        action={
          closed ? (
            <Chip size="small" variant="outlined" label="closed" />
          ) : (
            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
              {errors !== undefined && (
                <ErrorCenter errors={errors} onClear={onClearErrors} label="Channel" size="small" />
              )}
              {status}
              <Tooltip title={expanded ? 'Collapse' : 'Expand'}>
                <IconButton
                  onClick={() => setExpanded((value) => !value)}
                  sx={{ transition: '0.2s', transform: expanded ? 'rotate(180deg)' : 'none' }}
                  aria-label={expanded ? 'Collapse' : 'Expand'}
                >
                  <ExpandMoreIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Close channel">
                <IconButton onClick={handleClose} aria-label="Close channel">
                  <CloseIcon />
                </IconButton>
              </Tooltip>
            </Stack>
          )
        }
      />
      {!closed && (
        // Collapsed content stays mounted: charts consume pushed data imperatively
        // (outside the store), so unmounting would lose everything streamed while
        // collapsed — including the dxScript spline pane placements deltas rely on.
        <Collapse in={expanded} timeout="auto">
          <CardContent sx={{ pt: 0 }}>
            {parameterEntries.length > 0 && (
              <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap', mb: 2 }}>
                {parameterEntries.map(([key, value]) => (
                  <Chip
                    key={key}
                    size="small"
                    variant="outlined"
                    label={`${key}: ${String(value)}`}
                  />
                ))}
              </Stack>
            )}
            {children}
          </CardContent>
        </Collapse>
      )}
    </Card>
  )
}
