import type { DXLinkIndiChartIndicatorParameterMeta } from '@dxfeed/dxlink-api'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SessionParameterField } from './session-parameter-field'

type SessionMeta = Extract<DXLinkIndiChartIndicatorParameterMeta, { type: 'SESSION' }>

const meta = (fields: Partial<SessionMeta> = {}): SessionMeta => ({
  name: 'session',
  type: 'SESSION',
  defaultValue: '0930-1600',
  ...fields,
})

const trigger = () => screen.getByRole('button', { name: /configure session/i })

const openDialog = () => fireEvent.click(trigger())

const resultValue = (): string => (screen.getByLabelText('Result') as HTMLInputElement).value

describe('SessionParameterField', () => {
  it('shows the value on a trigger that can be operated from the keyboard', () => {
    render(<SessionParameterField meta={meta()} value="0930-1600" onChange={vi.fn()} />)

    // A real <button>, not a readOnly input with onClick: browsers activate a button on
    // Enter/Space, so the field is reachable without a mouse.
    expect(trigger().tagName).toBe('BUTTON')
    expect(trigger()).toHaveTextContent('0930-1600')

    trigger().focus()
    expect(trigger()).toHaveFocus()
  })

  it('prompts when there is no value yet', () => {
    render(<SessionParameterField meta={meta()} value="" onChange={vi.fn()} />)

    expect(trigger()).toHaveTextContent('Configure session')
  })

  it('opens in interval mode for a parseable value', () => {
    render(<SessionParameterField meta={meta()} value="0930-1600" onChange={vi.fn()} />)
    openDialog()

    expect((screen.getByLabelText('Start') as HTMLInputElement).value).toBe('09:30')
    expect((screen.getByLabelText('End') as HTMLInputElement).value).toBe('16:00')
  })

  it('edits the window through the time pickers', () => {
    const onChange = vi.fn()
    render(<SessionParameterField meta={meta()} value="0930-1600" onChange={onChange} />)
    openDialog()

    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '08:00' } })
    expect(resultValue()).toBe('0800-1600')

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onChange).toHaveBeenCalledWith('0800-1600')
  })

  it('adds a day suffix once the week is restricted', () => {
    const onChange = vi.fn()
    render(<SessionParameterField meta={meta()} value="0930-1600" onChange={onChange} />)
    openDialog()

    // Starts unrestricted (all seven selected) — drop the weekend.
    fireEvent.click(screen.getByRole('button', { name: 'Sat' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sun' }))
    expect(resultValue()).toBe('0930-1600:12345')

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onChange).toHaveBeenCalledWith('0930-1600:12345')
  })

  it('discards edits on cancel', () => {
    const onChange = vi.fn()
    render(<SessionParameterField meta={meta()} value="0930-1600" onChange={onChange} />)
    openDialog()

    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '08:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onChange).not.toHaveBeenCalled()
  })

  it('opens in raw mode for a value the interval form cannot express', () => {
    render(<SessionParameterField meta={meta()} value="ALWAYS" onChange={vi.fn()} />)
    openDialog()

    expect(screen.getByLabelText('Session')).toBeInTheDocument()
    expect(screen.queryByLabelText('Start')).not.toBeInTheDocument()
  })

  it('passes raw text through untouched', () => {
    const onChange = vi.fn()
    render(<SessionParameterField meta={meta()} value="ALWAYS" onChange={onChange} />)
    openDialog()

    fireEvent.change(screen.getByLabelText('Session'), { target: { value: 'CUSTOM_WINDOW' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

    expect(onChange).toHaveBeenCalledWith('CUSTOM_WINDOW')
  })

  it('switching to interval commits the window it shows, not the raw value behind it', () => {
    const onChange = vi.fn()
    render(<SessionParameterField meta={meta()} value="ALWAYS" onChange={onChange} />)
    openDialog()

    fireEvent.click(screen.getByRole('button', { name: 'Interval' }))

    // The pickers show 09:30-16:00, so that is what Apply must send — not 'ALWAYS'.
    expect((screen.getByLabelText('Start') as HTMLInputElement).value).toBe('09:30')
    expect(resultValue()).toBe('0930-1600')

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onChange).toHaveBeenCalledWith('0930-1600')
  })

  it('normalizes a cleared time instead of emitting a malformed session', () => {
    const onChange = vi.fn()
    render(<SessionParameterField meta={meta()} value="0930-1600" onChange={onChange} />)
    openDialog()

    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '' } })

    // Formatting '' straight through would yield '-1600', which parses to nothing: the
    // pickers would snap back while Apply sent the broken string.
    expect(resultValue()).toBe('0000-1600')
    expect((screen.getByLabelText('Start') as HTMLInputElement).value).toBe('00:00')

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onChange).toHaveBeenCalledWith('0000-1600')
  })

  it('offers only the presets when the parameter constrains them', () => {
    render(
      <SessionParameterField
        meta={meta({ options: ['0930-1600', '0400-0930'] })}
        value="0930-1600"
        onChange={vi.fn()}
      />
    )
    openDialog()

    expect(screen.getByLabelText('Preset')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Interval' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Start')).not.toBeInTheDocument()
  })

  it('starts a constrained parameter from the first preset when the value is off-list', () => {
    render(
      <SessionParameterField
        meta={meta({ options: ['0400-0930', '0930-1600'] })}
        value="9999-9999"
        onChange={vi.fn()}
      />
    )
    openDialog()

    expect(resultValue()).toBe('0400-0930')
  })

  it('shows the indicator-defined time zone, not an editable one', () => {
    render(
      <SessionParameterField
        meta={meta({ timeZone: 'America/New_York' })}
        value="0930-1600"
        onChange={vi.fn()}
      />
    )

    expect(screen.getByText('SESSION · America/New_York')).toBeInTheDocument()

    openDialog()
    expect(screen.getByLabelText('Time zone')).toBeDisabled()
  })

  it('defaults the time zone to UTC when the indicator does not say', () => {
    render(<SessionParameterField meta={meta()} value="0930-1600" onChange={vi.fn()} />)

    expect(screen.getByText('SESSION · UTC')).toBeInTheDocument()
  })
})
