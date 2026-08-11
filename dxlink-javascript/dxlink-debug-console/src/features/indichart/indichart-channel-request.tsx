import { DxScriptEditor } from '@dxscript/dxlink-dxscript-editor'
import AddIcon from '@mui/icons-material/Add'
import CloseIcon from '@mui/icons-material/Close'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'

import { useResolvedColorScheme } from '../../shared/lib/color-scheme'
import { MAX_INDICATORS, createIndicatorEntry } from '../channels/types'
import type { IndiChartRequest } from '../channels/types'

interface IndiChartChannelRequestProps {
  value: IndiChartRequest
  onChange: (value: IndiChartRequest) => void
}

/**
 * IndiChart channel request form: 1..N dxScript indicator sources.
 *
 * Uses the first-party `DxScriptEditor`, which brings dxScript syntax highlighting,
 * completion and its own bundled sample picker (it depends on `@dxscript/js-samples`) —
 * the same editor dxlink-docs used.
 *
 * The editor is **controlled** through its `script` prop, which it pushes back into the
 * buffer whenever it changes. Two consequences:
 *  - `script` is passed as `entry.code || undefined`. Passing `''` would mount the editor
 *    empty; leaving it `undefined` lets the editor seed a new card with its first bundled
 *    sample, which it then reports through `onChange` on mount. So a fresh card arrives
 *    pre-filled and state agrees with what is on screen;
 *  - cards are keyed by entry id, never by array index. With an index key, removing a
 *    card makes React reuse the mounted editors for the entries that shifted down, so
 *    the visible scripts and the request state silently disagree and the channel opens
 *    with the wrong source.
 */
export const IndiChartChannelRequest = ({ value, onChange }: IndiChartChannelRequestProps) => {
  const colorScheme = useResolvedColorScheme()
  const setAt = (id: string, code: string) =>
    onChange({
      indicators: value.indicators.map((entry) => (entry.id === id ? { ...entry, code } : entry)),
    })

  const add = () => onChange({ indicators: [...value.indicators, createIndicatorEntry()] })

  const remove = (id: string) =>
    onChange({ indicators: value.indicators.filter((entry) => entry.id !== id) })

  const full = value.indicators.length >= MAX_INDICATORS

  return (
    <Stack spacing={2} sx={{ pt: 1 }}>
      {value.indicators.map((entry, index) => (
        <Card key={entry.id} variant="outlined">
          <CardContent>
            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}
            >
              <Typography variant="subtitle2">Indicator {index + 1}</Typography>
              {value.indicators.length > 1 && (
                <Tooltip title="Remove indicator">
                  <IconButton
                    aria-label={`Remove indicator ${index + 1}`}
                    onClick={() => remove(entry.id)}
                  >
                    <CloseIcon />
                  </IconButton>
                </Tooltip>
              )}
            </Stack>
            <DxScriptEditor
              script={entry.code || undefined}
              onChange={(code) => setAt(entry.id, code)}
              placeholder="dxScript indicator source"
              height="260px"
              enableSamplesButton={true}
              showLangLogo={true}
              colorScheme={colorScheme}
            />
          </CardContent>
        </Card>
      ))}
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Button startIcon={<AddIcon />} onClick={add} disabled={full}>
          Add indicator
        </Button>
        <Typography variant="caption" color="text.secondary">
          {value.indicators.length}/{MAX_INDICATORS}
        </Typography>
      </Stack>
    </Stack>
  )
}
