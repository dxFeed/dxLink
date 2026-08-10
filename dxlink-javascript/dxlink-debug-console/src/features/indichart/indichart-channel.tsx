import { DXLinkChannelState } from '@dxfeed/dxlink-api'
import type { DXLinkIndiChartIndicatorState } from '@dxfeed/dxlink-api'
import { IndiChart } from '@dxscript/dxlink-dxcharts-lite'
import type { IndiChartHandle } from '@dxscript/dxlink-dxcharts-lite'
import CheckCircleIcon from '@mui/icons-material/CheckCircleOutlineOutlined'
import ErrorIcon from '@mui/icons-material/ErrorOutlineOutlined'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import InsightsIcon from '@mui/icons-material/Insights'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import TuneIcon from '@mui/icons-material/Tune'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import type { ChipProps } from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import { styled } from '@mui/material/styles'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useEffect, useRef, useState } from 'react'

import { IndiChartViewModel } from './indichart-view-model'
import type { IndicatorOutputKind, IndicatorOutputMeta } from './indichart-view-model'
import { ParameterField, initialParameterValue } from './parameter-field'
import type { ParameterValue } from './parameter-field'
import { describeScriptError } from './script-error'
import { DocLink } from '../../shared/components/doc-link'
import { CANDLE_SYMBOLS_DOC_URL, EPOCH_MILLIS_DOC_URL } from '../../shared/lib/order-sources'
import { useVM } from '../../shared/view-model'
import { ChannelWidget } from '../channels/channel-widget'
import type { IndiChartConfig } from '../channels/types'
import { useConnectionVM } from '../connection/connection-context'

import '@dxscript/dxlink-dxcharts-lite/styles.css'

type ParamValues = Record<string, Record<string, ParameterValue>>

const ChartSurface = styled(IndiChart)({ height: 420, width: '100%' })

interface IndicatorEntry {
  name: string
  code: string
  state: DXLinkIndiChartIndicatorState | undefined
  /** Declared outputs (output/spline/shape/barColor/backgroundColor) from the indicator state. */
  outputs: IndicatorOutputMeta[]
}

// Distinct chip color per output kind.
const OUTPUT_COLOR: Record<IndicatorOutputKind, ChipProps['color']> = {
  output: 'primary',
  spline: 'info',
  shape: 'secondary',
  barColor: 'warning',
  backgroundColor: 'success',
}

/** Meta line for one output: title/id · style · overlay/separate · offset. */
const outputMetaLabel = (output: IndicatorOutputMeta): string =>
  [
    output.title ?? (output.id !== undefined ? `#${output.id}` : null),
    output.style,
    output.overlay === undefined ? null : output.overlay ? 'overlay' : 'separate',
    output.offset ? `offset ${output.offset}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

const StatusChip = ({ state }: { state: DXLinkIndiChartIndicatorState | undefined }) => {
  if (state === undefined) {
    return <Chip size="small" variant="outlined" label="pending" />
  }
  return state.enabled ? (
    <Chip
      size="small"
      color="success"
      variant="outlined"
      icon={<CheckCircleIcon />}
      label="compiled"
    />
  ) : (
    <Chip size="small" color="error" variant="outlined" icon={<ErrorIcon />} label="error" />
  )
}

const indicatorSummary = (entry: IndicatorEntry): string => {
  const { state, outputs } = entry
  if (state === undefined) return 'apply a subscription to compile'
  if (!state.enabled) return 'compilation error'
  const inN = state.inParameters?.length ?? 0
  const outN = outputs.length
  return `${inN} input${inN === 1 ? '' : 's'} · ${outN} output${outN === 1 ? '' : 's'}`
}

const IndicatorPanel = ({
  entry,
  values,
  expanded,
  onToggle,
  onParam,
}: {
  entry: IndicatorEntry
  values: Record<string, ParameterValue> | undefined
  expanded: boolean
  onToggle: (expanded: boolean) => void
  onParam: (name: string, value: ParameterValue) => void
}) => {
  const { name, code, state } = entry
  const scriptError = describeScriptError(state)

  return (
    <Accordion
      variant="outlined"
      disableGutters
      expanded={expanded}
      onChange={(_event, isExpanded) => onToggle(isExpanded)}
      sx={{ '&::before': { display: 'none' } }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            width: '100%',
            pr: 1,
            minWidth: 0,
          }}
        >
          <Typography sx={{ fontWeight: 600 }}>Indicator {name}</Typography>
          <Typography variant="caption" color="text.secondary" noWrap sx={{ flexGrow: 1 }}>
            {indicatorSummary(entry)}
          </Typography>
          <StatusChip state={state} />
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        <Accordion disableGutters variant="outlined" sx={{ '&::before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="body2">Source</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Box
              component="pre"
              sx={{
                m: 0,
                p: 1.5,
                borderRadius: 1,
                bgcolor: 'action.hover',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                fontSize: 13,
                lineHeight: 1.6,
                overflow: 'auto',
              }}
            >
              {code}
            </Box>
          </AccordionDetails>
        </Accordion>

        {state !== undefined && state.enabled && (
          <Stack spacing={1.5} sx={{ mt: 1.5 }}>
            {(state.inParameters ?? []).length > 0 && (
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Inputs
                </Typography>
                <Box
                  sx={{
                    display: 'grid',
                    gap: 1.5,
                    mt: 1.25,
                    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  }}
                >
                  {(state.inParameters ?? []).map((meta) => (
                    <ParameterField
                      key={meta.name}
                      meta={meta}
                      value={values?.[meta.name]}
                      onChange={(v) => onParam(meta.name, v)}
                    />
                  ))}
                </Box>
              </Box>
            )}
            {entry.outputs.length > 0 && (
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Outputs
                </Typography>
                <Box
                  sx={{
                    display: 'grid',
                    gap: 1,
                    mt: 1,
                    // Fill the width: as many ~200px columns as fit, wrapping the rest.
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  }}
                >
                  {entry.outputs.map((output, index) => (
                    <Stack
                      key={`${output.kind}:${output.id ?? output.title ?? index}`}
                      direction="row"
                      spacing={1}
                      sx={{ alignItems: 'center', minWidth: 0 }}
                    >
                      <Chip
                        size="small"
                        color={OUTPUT_COLOR[output.kind]}
                        variant="outlined"
                        label={output.kind}
                        sx={{ flexShrink: 0 }}
                      />
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        noWrap
                        sx={{ minWidth: 0, textOverflow: 'ellipsis', overflow: 'hidden' }}
                      >
                        {outputMetaLabel(output)}
                      </Typography>
                    </Stack>
                  ))}
                </Box>
              </Box>
            )}
          </Stack>
        )}

        {scriptError !== undefined && (
          <Alert severity="error" variant="outlined" sx={{ mt: 1.5 }}>
            <AlertTitle>{scriptError.title}</AlertTitle>
            <Box
              component="pre"
              sx={{
                m: 0,
                whiteSpace: 'pre-wrap',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                fontSize: 13,
              }}
            >
              {scriptError.message}
            </Box>
            {scriptError.location !== undefined && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                In {scriptError.location}
              </Typography>
            )}
            {scriptError.stack !== undefined && scriptError.stack.length > 0 && (
              <>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
                  Stack trace
                </Typography>
                <Box
                  component="pre"
                  sx={{
                    m: 0,
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                    fontSize: 12,
                  }}
                >
                  {scriptError.stack.map((frame) => `  ${frame}`).join('\n')}
                </Box>
              </>
            )}
          </Alert>
        )}
      </AccordionDetails>
    </Accordion>
  )
}

interface IndiChartChannelProps {
  title: string
  config: IndiChartConfig
}

/** Live IndiChart channel — wraps {@link IndiChartViewModel} + the dxcharts IndiChart. */
export const IndiChartChannel = ({ title, config }: IndiChartChannelProps) => {
  const connectionVM = useConnectionVM()
  const [vm] = useState(() => {
    const client = connectionVM.getClient()
    if (client === null) {
      throw new Error('IndiChart channel opened without an active connection')
    }
    return new IndiChartViewModel(client, config.indicators)
  })

  const chartRef = useRef<IndiChartHandle>(null)
  const [resetKey, setResetKey] = useState(0)
  const [symbol, setSymbol] = useState('AAPL{=d}')
  const [fromTime, setFromTime] = useState('0')
  const [values, setValues] = useState<ParamValues>({})
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())
  const [chartError, setChartError] = useState<string | null>(null)
  const [hasData, setHasData] = useState(false)

  useEffect(() => {
    vm.start()
    vm.setChartListener((candles, indicators, dataType) => {
      // pushData runs synchronously inside the WebSocket frame dispatch, which does not
      // guard its listeners. An escaping throw would abort processing of that frame for
      // every other channel, and React's error boundary cannot see it — this is not a
      // render error. Contain it here and report it as a chart error.
      try {
        chartRef.current?.pushData(candles, indicators, dataType)
        if (candles.length > 0) setHasData(true)
      } catch (error) {
        setChartError(error instanceof Error ? error.message : String(error))
      }
    })
    return () => {
      vm.setChartListener(null)
      vm.stop()
    }
  }, [vm])

  const channelState = useVM(vm, (s) => s.channelState)
  const indicatorStates = useVM(vm, (s) => s.indicatorStates)
  const indicatorOutputs = useVM(vm, (s) => s.outputs)
  const subscription = useVM(vm, (s) => s.subscription)
  const channelId = useVM(vm, (s) => s.channelId)
  // `parameters` is deliberately not shown: for INDICHART it carries the full
  // indicator source, which the panels below already render properly.
  const errors = useVM(vm, (s) => s.errors)

  // Seed parameter values from the inParameters defaults as states arrive.
  useEffect(() => {
    if (indicatorStates === null) return
    setValues((prev) => {
      const next = { ...prev }
      for (const [name, state] of Object.entries(indicatorStates)) {
        if (state.enabled && next[name] === undefined) {
          const params: Record<string, ParameterValue> = {}
          for (const meta of state.inParameters ?? []) {
            params[meta.name] = initialParameterValue(meta)
          }
          next[name] = params
        }
      }
      return next
    })
  }, [indicatorStates])

  const entries: IndicatorEntry[] = config.indicators.map((code, index) => {
    const name = String(index + 1)
    return { name, code, state: indicatorStates?.[name], outputs: indicatorOutputs[name] ?? [] }
  })

  const errorCount = entries.filter((e) => e.state !== undefined && !e.state.enabled).length

  const setParam = (indicator: string, name: string, value: ParameterValue) =>
    setValues((prev) => ({ ...prev, [indicator]: { ...(prev[indicator] ?? {}), [name]: value } }))

  const setIndicatorExpanded = (name: string, isExpanded: boolean) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (isExpanded) next.add(name)
      else next.delete(name)
      return next
    })

  const apply = () => {
    setChartError(null)
    setHasData(false)
    chartRef.current?.reset()
    setResetKey((k) => k + 1)
    vm.apply(symbol.trim(), Number(fromTime) || 0, values)
  }

  /**
   * Re-apply only the parameters. The server keeps the subscription and recomputes the
   * indicators, so the candles are not refetched — the chart is left as it is and only
   * the indicator series change.
   */
  const applyParameters = () => {
    setChartError(null)
    vm.applyParameters(values)
  }

  /** Drop the subscription and clear the chart, leaving the channel open. */
  const reset = () => {
    setChartError(null)
    setHasData(false)
    chartRef.current?.reset()
    setResetKey((k) => k + 1)
    vm.reset()
  }

  const statusChip =
    channelState === DXLinkChannelState.CLOSED ? (
      <Chip size="small" variant="outlined" label="closed" />
    ) : errorCount > 0 ? (
      <Chip
        size="small"
        color="error"
        variant="outlined"
        label={`${errorCount} error${errorCount === 1 ? '' : 's'}`}
      />
    ) : subscription !== null && channelState === DXLinkChannelState.OPENED ? (
      <Chip size="small" color="success" variant="outlined" label="running" />
    ) : (
      <Chip size="small" color="warning" variant="outlined" label="ready" />
    )

  return (
    <ChannelWidget
      icon={<InsightsIcon />}
      title={title}
      subtitle={`IndiChart · ${entries.length} indicator${entries.length === 1 ? '' : 's'}`}
      onClose={vm.close}
      status={statusChip}
      channelId={channelId}
      errors={errors}
      onClearErrors={vm.clearErrors}
    >
      <Stack spacing={2}>
        <Box>
          <Typography variant="subtitle2" gutterBottom>
            Subscription
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gap: 1.5,
              alignItems: 'start',
              gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr) auto' },
            }}
          >
            <TextField
              label="Symbol"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              size="small"
              helperText={
                <>
                  <DocLink href={CANDLE_SYMBOLS_DOC_URL}>Candle symbol</DocLink>, e.g. AAPL
                  {'{=d}'}
                </>
              }
            />
            <TextField
              label="From time"
              value={fromTime}
              onChange={(e) => setFromTime(e.target.value.replace(/[^0-9]/g, ''))}
              size="small"
              helperText={
                <>
                  <DocLink href={EPOCH_MILLIS_DOC_URL}>Unix ms</DocLink>, or 0 for full history
                </>
              }
            />
            <Button
              variant="contained"
              startIcon={<PlayArrowIcon />}
              onClick={apply}
              disabled={symbol.trim() === ''}
              sx={{ height: 40 }}
            >
              Apply
            </Button>
          </Box>
          <Stack
            direction="row"
            spacing={1}
            sx={{ mt: 1.5, alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}
          >
            <Button
              variant="outlined"
              startIcon={<TuneIcon />}
              onClick={applyParameters}
              disabled={subscription === null}
            >
              Apply parameters
            </Button>
            <Button
              color="inherit"
              startIcon={<RestartAltIcon />}
              onClick={reset}
              disabled={subscription === null}
            >
              Reset
            </Button>
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            <b>Apply</b> re-subscribes and reloads the candles. <b>Apply parameters</b> recomputes
            the indicators against the candles already loaded. <b>Reset</b> drops the subscription
            and clears the chart, leaving the channel open.
          </Typography>
        </Box>

        <Divider />

        <Box>
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}
          >
            <Typography variant="subtitle2">Indicators ({entries.length})</Typography>
            <Stack direction="row" spacing={0.5}>
              <Button
                size="small"
                color="inherit"
                onClick={() => setExpanded(new Set(entries.map((e) => e.name)))}
                disabled={expanded.size === entries.length}
              >
                Expand all
              </Button>
              <Button
                size="small"
                color="inherit"
                onClick={() => setExpanded(new Set())}
                disabled={expanded.size === 0}
              >
                Collapse all
              </Button>
            </Stack>
          </Stack>
          <Stack spacing={1}>
            {entries.map((entry) => (
              <IndicatorPanel
                key={entry.name}
                entry={entry}
                values={values[entry.name]}
                expanded={expanded.has(entry.name)}
                onToggle={(isExpanded) => setIndicatorExpanded(entry.name, isExpanded)}
                onParam={(name, value) => setParam(entry.name, name, value)}
              />
            ))}
          </Stack>
        </Box>

        {chartError !== null && (
          <Alert severity="error" variant="outlined">
            {chartError}
          </Alert>
        )}

        <Box>
          <Box sx={{ position: 'relative' }}>
            <ChartSurface
              ref={chartRef}
              resetKey={resetKey}
              showLabels={true}
              onIndicatorError={setChartError}
            />
            {!hasData && (
              <Stack
                spacing={1}
                sx={{
                  position: 'absolute',
                  inset: 0,
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'text.secondary',
                  bgcolor: 'background.paper',
                  border: '1px dashed',
                  borderColor: 'divider',
                  borderRadius: 2,
                }}
              >
                <InsightsIcon fontSize="large" />
                <Typography variant="body2">
                  {subscription === null
                    ? 'Apply a subscription to load the chart.'
                    : 'Loading candles…'}
                </Typography>
              </Stack>
            )}
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            Chart powered by DXCharts.
          </Typography>
        </Box>
      </Stack>
    </ChannelWidget>
  )
}
