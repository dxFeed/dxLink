import { TextField } from '@dxfeed/ui-kit/TextField'
import styled from 'styled-components'

import type { DXLinkIndiChartIndicatorParameterMeta } from '@dxfeed/dxlink-api'

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

interface ParameterFieldProps {
  parameter: Readonly<DXLinkIndiChartIndicatorParameterMeta>
  value: any
  onChange?: (value: any) => void
}

export function ParameterField({ parameter, value, onChange }: ParameterFieldProps) {
  const handleChange = (newValue: any) => {
    onChange?.(newValue)
  }

  const renderField = () => {
    const commonProps = {
      label: parameter.name,
      value,
      onChange: (e: any) => handleChange(e.target.value),
    }

    switch (parameter.type) {
      case 'DOUBLE':
        if (parameter.options && parameter.options.length > 0) {
          // Dropdown for predefined double values
          return (
            <div style={{ width: '100%' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: '500',
                color: '#333'
              }}>
                {parameter.name}
              </label>
              <SelectField
                value={value}
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
            onChange={(e) => {
              const num = Number.parseFloat(e.target.value)
              handleChange(Number.isNaN(num) ? 0 : num)
            }}
          />
        )
      case 'BOOL':
        return (
          <div style={{ width: '100%' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: '500',
              color: '#333'
            }}>
              {parameter.name}
            </label>
            <input
              id={`checkbox-${parameter.name}`}
              type="checkbox"
              checked={value}
              onChange={(e: any) => handleChange(e.target.checked)}
              style={{
                width: '20px',
                height: '20px',
                cursor: 'pointer',
                accentColor: '#007acc' // or theme color
              }}
            />
          </div>
        )
      case 'STRING':
        if (parameter.options && parameter.options.length > 0) {
          // Dropdown for string options
          return (
            <div style={{ width: '100%' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: '500',
                color: '#333'
              }}>
                {parameter.name}
              </label>
              <SelectField
                value={value}
                onChange={(e) => handleChange(e.target.value)}
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
          />
        )
      case 'COLOR':
        return (
          <div style={{ gridColumn: 'span 2' }}>
            <div style={{ width: '100%' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: '500',
                color: '#333'
              }}>
                {parameter.name}
              </label>
              <ColorField
                type="color"
                value={value}
                onChange={(e) => handleChange(e.target.value.slice(0, 7))}
              />
            </div>
          </div>
        )
      case 'SOURCE':
        const sourceOptions = parameter.options || ['open', 'high', 'low', 'close', 'volume']
        return (
          <div style={{ gridColumn: 'span 2' }}>
            <div style={{ width: '100%' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: '500',
                color: '#333'
              }}>
                {parameter.name}
              </label>
              <SelectField
                value={value}
                onChange={(e) => handleChange(e.target.value)}
              >
                {sourceOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </SelectField>
            </div>
          </div>
        )
      case 'SESSION':
        if (parameter.options && parameter.options.length > 0) {
          // Dropdown for predefined sessions
          return (
            <div style={{ width: '100%' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: '500',
                color: '#333'
              }}>
                {parameter.name}
              </label>
              <SelectField
                value={value}
                onChange={(e) => handleChange(e.target.value)}
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
            placeholder="e.g., 0930-1600:12345"
          />
        )
      case 'MAP':
        // For MAP type, we'll assume options contains the mapping keys
        // In a real implementation, there might be a separate mapping property
        if (parameter.options && parameter.options.length > 0) {
          return (
            <div style={{ width: '200px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: '500',
                color: '#333'
              }}>
                {parameter.name}
              </label>
              <SelectField
                value={value}
                onChange={(e) => handleChange(e.target.value)}
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
          />
        )
      default:
        return (
          <TextField
            {...commonProps}
          />
        )
    }
  }

  return renderField()
}
