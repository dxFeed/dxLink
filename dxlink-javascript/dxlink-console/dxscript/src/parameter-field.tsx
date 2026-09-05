import type { DXLinkIndiChartIndicatorParameterMeta, JSONNumber } from '@dxfeed/dxlink-api'
import Box from '@mui/material/Box'
import FormControl from '@mui/material/FormControl'
import FormHelperText from '@mui/material/FormHelperText'
import InputAdornment from '@mui/material/InputAdornment'
import MenuItem from '@mui/material/MenuItem'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

import { toHexColor } from './colors'
import { SessionParameterField } from './session-parameter-field'

export type ParameterValue = number | string | boolean

const toNumber = (value: JSONNumber | undefined): number =>
  typeof value === 'number' ? value : Number(value ?? 0)

/** Initial value for a parameter: its current value, else its default. Null-safe — the
 * server's parameter metadata is dynamic and may omit fields, so this never throws. */
export const initialParameterValue = (
  meta: DXLinkIndiChartIndicatorParameterMeta
): ParameterValue => {
  switch (meta.type) {
    case 'COLOR':
      return toHexColor(meta.value ?? meta.defaultValue)
    case 'DOUBLE':
      return toNumber(meta.value ?? meta.defaultValue)
    case 'BOOL':
      return meta.value ?? meta.defaultValue ?? false
    default:
      return meta.value ?? meta.defaultValue ?? ''
  }
}

interface ParameterFieldProps {
  meta: DXLinkIndiChartIndicatorParameterMeta
  value: ParameterValue | undefined
  onChange: (value: ParameterValue) => void
}

/**
 * Schema-driven control for a single indicator parameter. Renders the right MUI
 * input per parameter type (DOUBLE / STRING / BOOL / COLOR / SOURCE / SESSION /
 * ENUM), driven by the dxlink-indichart parameter metadata.
 */
export const ParameterField = ({ meta, value, onChange }: ParameterFieldProps) => {
  if (meta.type === 'BOOL') {
    const checked = typeof value === 'boolean' ? value : (meta.value ?? meta.defaultValue)
    return (
      <FormControl size="small" fullWidth>
        <Box
          sx={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
            minHeight: 40,
            pl: 1.5,
            pr: 0.5,
            border: 1,
            borderColor: 'divider',
            borderRadius: 1,
          }}
        >
          <Typography
            component="span"
            sx={{
              position: 'absolute',
              top: 0,
              left: 9,
              transform: 'translateY(-50%)',
              px: 0.5,
              bgcolor: 'background.paper',
              color: 'text.secondary',
              fontSize: 12,
              lineHeight: 1,
              pointerEvents: 'none',
            }}
          >
            {meta.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {checked ? 'On' : 'Off'}
          </Typography>
          <Switch
            size="small"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            slotProps={{ input: { 'aria-label': meta.name } }}
          />
        </Box>
        <FormHelperText sx={{ mx: 1.75 }}>BOOL</FormHelperText>
      </FormControl>
    )
  }

  if (meta.type === 'COLOR') {
    // Resolve through the palette: the value may still be a dxScript color name (e.g.
    // after a server update), which a color input cannot render.
    const hex = toHexColor(typeof value === 'string' ? value : (meta.value ?? meta.defaultValue))
    return (
      <TextField
        label={meta.name}
        value={hex}
        onChange={(e) => onChange(e.target.value)}
        size="small"
        fullWidth
        helperText="COLOR"
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <input
                  type="color"
                  aria-label={meta.name}
                  value={hex}
                  onChange={(e) => onChange(e.target.value)}
                  style={{
                    width: 22,
                    height: 22,
                    padding: 0,
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                  }}
                />
              </InputAdornment>
            ),
          },
        }}
      />
    )
  }

  if (meta.type === 'DOUBLE') {
    const current = typeof value === 'number' ? value : toNumber(meta.value ?? meta.defaultValue)
    if (meta.options && meta.options.length > 0) {
      return (
        <TextField
          select
          label={meta.name}
          value={String(current)}
          onChange={(e) => onChange(Number(e.target.value))}
          size="small"
          fullWidth
          helperText="DOUBLE"
        >
          {meta.options.map((option) => (
            <MenuItem key={String(option)} value={String(option)}>
              {String(option)}
            </MenuItem>
          ))}
        </TextField>
      )
    }
    return (
      <TextField
        label={meta.name}
        type="number"
        value={current}
        onChange={(e) => onChange(e.target.value === '' ? (meta.min ?? 0) : Number(e.target.value))}
        size="small"
        fullWidth
        helperText="DOUBLE"
        slotProps={{ htmlInput: { min: meta.min, max: meta.max, step: meta.step } }}
      />
    )
  }

  // STRING | SOURCE | SESSION | ENUM
  const current = typeof value === 'string' ? value : String(meta.value ?? meta.defaultValue)

  if (meta.type === 'SESSION') {
    return <SessionParameterField meta={meta} value={current} onChange={onChange} />
  }

  const helper = meta.type

  if (meta.options && meta.options.length > 0) {
    return (
      <TextField
        select
        label={meta.name}
        value={current}
        onChange={(e) => onChange(e.target.value)}
        size="small"
        fullWidth
        helperText={helper}
      >
        {meta.options.map((option) => (
          <MenuItem key={option} value={option}>
            {option}
          </MenuItem>
        ))}
      </TextField>
    )
  }

  return (
    <TextField
      label={meta.name}
      value={current}
      onChange={(e) => onChange(e.target.value)}
      size="small"
      fullWidth
      helperText={helper}
    />
  )
}
