import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Box from '@mui/material/Box'
import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  /** Heading for the fallback alert — name the part that failed. */
  title?: string
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Contains a render-time failure to one subtree instead of blanking the app.
 *
 * Channel cards are the motivating case: they construct ViewModels (which throw if the
 * connection vanished between opening the dialog and mounting) and they host a
 * third-party chart component. Without a boundary either one takes down the whole
 * console, losing every other open channel too.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // A debug console should leave the full trace in the browser console.
    console.error('Channel render failed', error, info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    const { children, title = 'Something went wrong' } = this.props

    if (error !== null) {
      return (
        <Box sx={{ my: 1 }}>
          <Alert severity="error" variant="outlined">
            <AlertTitle>{title}</AlertTitle>
            {error.message}
          </Alert>
        </Box>
      )
    }

    return children
  }
}
