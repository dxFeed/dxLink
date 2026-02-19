import type { DXLinkIndiChartIndicatorParameterMeta } from '@dxfeed/dxlink-api'
import { Button } from '@dxfeed/ui-kit/Button'
import { unit } from '@dxfeed/ui-kit/utils'
import { useEffect, useMemo, useState } from 'react'
import styled from 'styled-components'

import { ParameterField } from './parameter-field'

// dxScript default colors mapping
const COLOR_MAP: Record<string, string> = {
  BLACK: '#000000',
  SILVER: '#C0C0C0',
  GRAY: '#808080',
  WHITE: '#FFFFFF',
  MAROON: '#800000',
  RED: '#FF0000',
  PURPLE: '#800080',
  FUCHSIA: '#FF00FF',
  MAGENTA: '#FF00FF',
  GREEN: '#008000',
  LIME: '#00FF00',
  OLIVE: '#808000',
  YELLOW: '#FFFF00',
  ORANGE: '#FFA500',
  NAVY: '#000080',
  BLUE: '#0000FF',
  TEAL: '#008080',
  AQUA: '#00FFFF',
  CYAN: '#00FFFF',
  CRIMSON: '#DC143C',
  CORAL: '#FF7F50',
  GOLD: '#FFD700',
  DODGER_BLUE: '#1E90FF',
  SKY_BLUE: '#87CEEB',
  VIOLET: '#EE82EE',
  PINK: '#FFC0CB',
}

type ParameterValue = number | string | boolean
type ParameterValues = Record<string, ParameterValue>

function getColorValue(value: unknown): string {
  if (typeof value === 'string') {
    if (value.startsWith('#')) {
      return value.slice(0, 7)
    }
    // If it's a named color, look it up
    return COLOR_MAP[value.toUpperCase()] || '#000000'
  }

  if (value && typeof value === 'object' && 'value' in value) {
    const colorName = value.value
    if (typeof colorName === 'string') {
      if (colorName.startsWith('#')) {
        return colorName.slice(0, 7)
      }
      return COLOR_MAP[colorName.toUpperCase()] || '#000000'
    }
  }

  return '#000000'
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${unit(1)};
`

const FieldsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: ${unit(1)};
  align-items: start;
`

const Actions = styled.div`
  display: flex;
  justify-content: flex-end;
  margin-top: ${unit(2)};
`

interface ParameterFieldContainerProps {
  parameters: readonly DXLinkIndiChartIndicatorParameterMeta[]
  onApply?: (values: ParameterValues) => void
}

export function ParameterFieldContainer({ parameters, onApply }: ParameterFieldContainerProps) {
  const initialValues = useMemo(() => {
    return parameters.reduce((acc, param) => {
      let initialValue: ParameterValue

      if (param.type === 'DOUBLE') {
        const val = param.value ?? param.defaultValue ?? 0
        initialValue = typeof val === 'number' ? val : Number.parseFloat(val) || 0
      } else if (param.type === 'BOOL') {
        initialValue = param.value ?? param.defaultValue ?? false
      } else if (param.type === 'COLOR') {
        initialValue = getColorValue(param.value ?? param.defaultValue)
      } else {
        initialValue = param.value ?? param.defaultValue ?? ''
      }

      acc[param.name] = initialValue
      return acc
    }, {} as ParameterValues)
  }, [parameters])

  const [values, setValues] = useState<ParameterValues>({})

  useEffect(() => {
    setValues(initialValues)
  }, [initialValues])

  const handleApply = () => {
    onApply?.(values)
  }

  return (
    <Container>
      <FieldsGrid>
        {[...parameters]
          .sort((a, b) => {
            if (a.type === 'BOOL' && b.type !== 'BOOL') return 1
            if (b.type === 'BOOL' && a.type !== 'BOOL') return -1
            return 0
          })
          .map((param) => (
            <ParameterField
              key={param.name}
              parameter={param}
              value={values[param.name] ?? initialValues[param.name]}
              onChange={(newValue) => setValues((prev) => ({ ...prev, [param.name]: newValue }))}
            />
          ))}
      </FieldsGrid>
      <Actions>
        <Button onClick={handleApply} color="secondary">
          Apply
        </Button>
      </Actions>
    </Container>
  )
}
