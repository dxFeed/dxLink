import React from 'react'

export function DebugConsoleEntry() {
  const [value, setValue] = React.useState(1)

  return (
    <div>
      <p>Debug console</p>
      <a href="#" onClick={() => setValue((v) => v + 1)}>
        Plus
      </a>
      <p>Value: {value}</p>
    </div>
  )
}
