import DarkModeIcon from '@mui/icons-material/DarkModeOutlined'
import LightModeIcon from '@mui/icons-material/LightModeOutlined'
import SettingsBrightnessIcon from '@mui/icons-material/SettingsBrightnessOutlined'
import { useColorScheme } from '@mui/material/styles'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Tooltip from '@mui/material/Tooltip'

type Mode = 'system' | 'light' | 'dark'

const MODES: ReadonlyArray<{ value: Mode; label: string; icon: React.ReactNode }> = [
  { value: 'system', label: 'System', icon: <SettingsBrightnessIcon fontSize="small" /> },
  { value: 'light', label: 'Light', icon: <LightModeIcon fontSize="small" /> },
  { value: 'dark', label: 'Dark', icon: <DarkModeIcon fontSize="small" /> },
]

/**
 * System / Light / Dark switcher. Reads and writes the MUI color scheme; the
 * choice is persisted by MUI to localStorage. Renders nothing until the scheme
 * is resolved on the client to avoid a hydration/first-paint mismatch.
 */
export const ThemeModeToggle = () => {
  const { mode, setMode } = useColorScheme()

  if (!mode) {
    return null
  }

  return (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={mode}
      aria-label="Theme mode"
      onChange={(_event, next: Mode | null) => {
        if (next !== null) {
          setMode(next)
        }
      }}
    >
      {MODES.map(({ value, label, icon }) => (
        <ToggleButton key={value} value={value} aria-label={`${label} theme`}>
          <Tooltip title={label}>{icon as React.ReactElement}</Tooltip>
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  )
}
