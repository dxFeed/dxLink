import type { DXLinkIndiChartIndicatorParameterMeta } from '@dxfeed/dxlink-api'
import { Button } from '@dxfeed/ui-kit/Button'
import { Chevron } from '@dxfeed/ui-kit/Icons'
import { TextField } from '@dxfeed/ui-kit/TextField'
import { useMemo, useState } from 'react'
import styled from 'styled-components'

const SelectField = styled.select`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 14px;
  background-color: white;
  &:focus {
    outline: none;
    border-color: #007acc;
    box-shadow: 0 0 0 2px rgba(0, 122, 204, 0.2);
  }
`

const ColorField = styled.input`
  width: 100%;
  height: 40px;
  border: 1px solid #ccc;
  border-radius: 4px;
  cursor: pointer;
  &:focus {
    outline: none;
    border-color: #007acc;
    box-shadow: 0 0 0 2px rgba(0, 122, 204, 0.2);
  }
`

const SessionFieldRoot = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`

const FieldLabel = styled.label`
  font-size: 14px;
  font-weight: 500;
  color: #333;
  margin: 0;
`

const InlineField = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

const SessionTrigger = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  box-sizing: border-box;
  padding: 8px 12px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 14px;
  color: #333;
  text-align: left;
  background-color: white;
  cursor: pointer;
  min-height: 38px;

  &:focus {
    outline: none;
    border-color: #007acc;
    box-shadow: 0 0 0 2px rgba(0, 122, 204, 0.2);
  }
`

const SessionTriggerValue = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const SessionTriggerIcon = styled(Chevron)`
  flex: 0 0 auto;
  color: #666;
`

const DialogOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.35);
`

const DialogPanel = styled.div`
  width: min(520px, 100%);
  border-radius: 6px;
  border: 1px solid #ddd;
  background: #fff;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.24);
`

const DialogHeader = styled.div`
  padding: 16px 20px;
  border-bottom: 1px solid #e6e6e6;
  font-size: 16px;
  font-weight: 600;
  color: #222;
`

const DialogBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 20px;
`

const DialogActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 20px;
  border-top: 1px solid #e6e6e6;
`

const SessionControls = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
`

const SessionControl = styled.label`
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #555;
`

const NativeInput = styled.input`
  width: 100%;
  box-sizing: border-box;
  padding: 8px 12px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 14px;
  background-color: white;
  &:focus {
    outline: none;
    border-color: #007acc;
    box-shadow: 0 0 0 2px rgba(0, 122, 204, 0.2);
  }
  &:disabled {
    color: #666;
    background-color: #f7f7f7;
  }
`

const ModeButtons = styled.div`
  display: inline-flex;
  border: 1px solid #ccc;
  border-radius: 4px;
  overflow: hidden;
`

const ModeButton = styled.button<{ active: boolean }>`
  border: 0;
  border-right: 1px solid #ccc;
  padding: 7px 10px;
  cursor: pointer;
  font-size: 13px;
  background: ${(props) => (props.active ? '#007acc' : '#fff')};
  color: ${(props) => (props.active ? '#fff' : '#333')};

  &:last-child {
    border-right: 0;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
`

const DaysGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
`

const DayToggle = styled.label<{ active: boolean }>`
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 32px;
  border: 1px solid ${(props) => (props.active ? '#007acc' : '#ccc')};
  border-radius: 4px;
  color: ${(props) => (props.active ? '#fff' : '#333')};
  background: ${(props) => (props.active ? '#007acc' : '#fff')};
  font-size: 12px;
  cursor: pointer;

  input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
`

const SESSION_DAYS = [
  { value: '1', label: 'Mon' },
  { value: '2', label: 'Tue' },
  { value: '3', label: 'Wed' },
  { value: '4', label: 'Thu' },
  { value: '5', label: 'Fri' },
  { value: '6', label: 'Sat' },
  { value: '7', label: 'Sun' },
] as const

type SessionParts = {
  start: string
  end: string
  days: string[]
}

type SessionMode = 'interval' | 'raw'

type ParameterValue = number | string | boolean

function parseSession(value: string): SessionParts | undefined {
  const match = value.trim().match(/^(\d{2}:?\d{2})-(\d{2}:?\d{2})(?::([1-7]+))?$/)
  if (!match) {
    return undefined
  }

  const [, start, end, days] = match
  const normalizedStart = normalizeSessionTime(start)
  const normalizedEnd = normalizeSessionTime(end)
  if (!isValidSessionTime(normalizedStart) || !isValidSessionTime(normalizedEnd)) {
    return undefined
  }

  return {
    start: normalizedStart,
    end: normalizedEnd,
    days: days ? [...new Set(days.split(''))] : SESSION_DAYS.map((day) => day.value),
  }
}

function normalizeSessionTime(value: string | undefined): string {
  if (!value) {
    return '00:00'
  }
  const compact = value.replace(':', '')
  return `${compact.slice(0, 2)}:${compact.slice(2, 4)}`
}

function isValidSessionTime(value: string): boolean {
  const [hour, minute] = value.split(':').map(Number)
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59
}

function formatSessionTime(value: string): string {
  return value.replace(':', '')
}

function formatSession({ start, end, days }: SessionParts): string {
  const base = `${formatSessionTime(start)}-${formatSessionTime(end)}`
  const normalizedDays = SESSION_DAYS.filter((day) => days.includes(day.value)).map(
    (day) => day.value
  )

  if (normalizedDays.length === 0 || normalizedDays.length === SESSION_DAYS.length) {
    return base
  }

  return `${base}:${normalizedDays.join('')}`
}

function getStringOptions(options: string[] | undefined): string[] {
  if (!options) {
    return []
  }
  return options.filter((option) => typeof option === 'string')
}

function SessionParameterField({ parameter, value, onChange }: ParameterFieldProps) {
  const stringValue = String(value)
  const parsedValue = useMemo(() => parseSession(stringValue), [stringValue])
  const constrainedOptions = getStringOptions(parameter.options)
  const hasConstrainedOptions = constrainedOptions.length > 0
  const [dialogOpen, setDialogOpen] = useState(false)
  const [draftValue, setDraftValue] = useState(stringValue)
  const draftParsedValue = useMemo(() => parseSession(draftValue), [draftValue])
  const [mode, setMode] = useState<SessionMode>(parsedValue ? 'interval' : 'raw')

  const sessionParts = draftParsedValue ?? {
    start: '09:30',
    end: '16:00',
    days: SESSION_DAYS.map((day) => day.value),
  }

  const updateSession = (nextParts: SessionParts) => {
    setDraftValue(formatSession(nextParts))
  }

  const toggleDay = (day: string) => {
    const days = sessionParts.days.includes(day)
      ? sessionParts.days.filter((item) => item !== day)
      : [...sessionParts.days, day]

    updateSession({ ...sessionParts, days })
  }

  const openDialog = () => {
    setDraftValue(
      hasConstrainedOptions && !constrainedOptions.includes(stringValue)
        ? constrainedOptions[0] ?? stringValue
        : stringValue
    )
    setMode(parsedValue ? 'interval' : 'raw')
    setDialogOpen(true)
  }

  const applyDialog = () => {
    onChange?.(draftValue)
    setDialogOpen(false)
  }

  return (
    <SessionFieldRoot>
      <FieldLabel>{parameter.name}</FieldLabel>
      <SessionTrigger type="button" onClick={openDialog}>
        <SessionTriggerValue>{stringValue || 'Configure session'}</SessionTriggerValue>
        <SessionTriggerIcon aria-hidden="true" />
      </SessionTrigger>

      {dialogOpen && (
        <DialogOverlay role="presentation" onMouseDown={() => setDialogOpen(false)}>
          <DialogPanel
            role="dialog"
            aria-modal="true"
            aria-labelledby={`session-dialog-${parameter.name}`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <DialogHeader id={`session-dialog-${parameter.name}`}>{parameter.name}</DialogHeader>
            <DialogBody>
              <InlineField>
                <FieldLabel>Mode</FieldLabel>
                <ModeButtons aria-label={`${parameter.name} editor mode`}>
                  <ModeButton
                    type="button"
                    active={mode === 'interval'}
                    disabled={hasConstrainedOptions}
                    onClick={() => setMode('interval')}
                  >
                    Interval
                  </ModeButton>
                  <ModeButton
                    type="button"
                    active={mode === 'raw'}
                    disabled={hasConstrainedOptions}
                    onClick={() => setMode('raw')}
                  >
                    Raw
                  </ModeButton>
                </ModeButtons>
              </InlineField>

              {hasConstrainedOptions && (
                <SessionControl>
                  Preset
                  <SelectField value={draftValue} onChange={(e) => setDraftValue(e.target.value)}>
                    {constrainedOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </SelectField>
                </SessionControl>
              )}

              {!hasConstrainedOptions &&
                (mode === 'raw' ? (
                  <TextField
                    label="Session"
                    value={draftValue}
                    onChange={(e) => setDraftValue(e.target.value)}
                    placeholder="e.g., 0930-1600:12345"
                  />
                ) : (
                  <>
                    <SessionControls>
                      <SessionControl>
                        Start
                        <NativeInput
                          type="time"
                          value={sessionParts.start}
                          onChange={(e) =>
                            updateSession({ ...sessionParts, start: e.target.value })
                          }
                        />
                      </SessionControl>
                      <SessionControl>
                        End
                        <NativeInput
                          type="time"
                          value={sessionParts.end}
                          onChange={(e) => updateSession({ ...sessionParts, end: e.target.value })}
                        />
                      </SessionControl>
                    </SessionControls>
                    <DaysGrid>
                      {SESSION_DAYS.map((day) => (
                        <DayToggle key={day.value} active={sessionParts.days.includes(day.value)}>
                          <input
                            type="checkbox"
                            checked={sessionParts.days.includes(day.value)}
                            onChange={() => toggleDay(day.value)}
                          />
                          {day.label}
                        </DayToggle>
                      ))}
                    </DaysGrid>
                  </>
                ))}

              <SessionControl>
                Time zone
                <NativeInput value={parameter.timeZone ?? 'UTC'} disabled readOnly />
              </SessionControl>
            </DialogBody>
            <DialogActions>
              <Button color="secondary" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={applyDialog}>Apply</Button>
            </DialogActions>
          </DialogPanel>
        </DialogOverlay>
      )}
    </SessionFieldRoot>
  )
}

interface ParameterFieldProps {
  parameter: Readonly<DXLinkIndiChartIndicatorParameterMeta>
  value: ParameterValue
  onChange?: (value: ParameterValue) => void
}

export function ParameterField({ parameter, value, onChange }: ParameterFieldProps) {
  const handleChange = (newValue: ParameterValue) => {
    onChange?.(newValue)
  }

  const renderField = () => {
    const commonProps = {
      label: parameter.name,
      value: String(value),
      onChange: (e) => handleChange(e.target.value),
    }

    switch (parameter.type) {
      case 'DOUBLE':
        if (parameter.options && parameter.options.length > 0) {
          // Dropdown for predefined double values
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label
                style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#333',
                  margin: 0,
                }}
              >
                {parameter.name}
              </label>
              <SelectField
                value={String(value)}
                onChange={(e) => handleChange(Number.parseFloat(e.target.value))}
              >
                {parameter.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </SelectField>
            </div>
          )
        }
        return (
          <TextField
            {...commonProps}
            type="number"
            min={parameter.min}
            max={parameter.max}
            step={parameter.step}
            onChange={(e) => {
              const num = Number.parseFloat(e.target.value)
              handleChange(Number.isNaN(num) ? 0 : num)
            }}
          />
        )
      case 'BOOL':
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label
              style={{
                fontSize: '14px',
                fontWeight: '500',
                color: '#333',
                margin: 0,
              }}
            >
              {parameter.name}
            </label>
            <input
              id={`checkbox-${parameter.name}`}
              type="checkbox"
              checked={Boolean(value)}
              onChange={(e) => handleChange(e.target.checked)}
              style={{
                width: '20px',
                height: '20px',
                cursor: 'pointer',
                accentColor: '#007acc',
              }}
            />
          </div>
        )
      case 'STRING':
        if (parameter.options && parameter.options.length > 0) {
          // Dropdown for string options
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label
                style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#333',
                  margin: 0,
                }}
              >
                {parameter.name}
              </label>
              <SelectField value={String(value)} onChange={(e) => handleChange(e.target.value)}>
                {parameter.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </SelectField>
            </div>
          )
        }
        return <TextField {...commonProps} />
      case 'COLOR':
        return (
          <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label
              style={{
                fontSize: '14px',
                fontWeight: '500',
                color: '#333',
                margin: 0,
              }}
            >
              {parameter.name}
            </label>
            <ColorField
              type="color"
              value={String(value).slice(0, 7)}
              onChange={(e) => handleChange(e.target.value.slice(0, 7))}
            />
          </div>
        )
      case 'SOURCE': {
        const sourceOptions = parameter.options ?? []
        const options =
          sourceOptions.length > 0 ? sourceOptions : ['open', 'high', 'low', 'close', 'volume']
        return (
          <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label
              style={{
                fontSize: '14px',
                fontWeight: '500',
                color: '#333',
                margin: 0,
              }}
            >
              {parameter.name}
            </label>
            <SelectField value={String(value)} onChange={(e) => handleChange(e.target.value)}>
              {options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </SelectField>
          </div>
        )
      }
      case 'SESSION':
        return <SessionParameterField parameter={parameter} value={value} onChange={handleChange} />
      case 'ENUM':
        if (parameter.options && parameter.options.length > 0) {
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label
                style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#333',
                  margin: 0,
                }}
              >
                {parameter.name}
              </label>
              <SelectField value={String(value)} onChange={(e) => handleChange(e.target.value)}>
                {parameter.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </SelectField>
            </div>
          )
        }
        return <TextField {...commonProps} />
      default:
        return <TextField {...commonProps} />
    }
  }

  return renderField()
}
