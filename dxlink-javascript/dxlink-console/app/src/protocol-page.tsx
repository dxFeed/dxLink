import AsyncApi from '@asyncapi/react-component/browser'
import type { ConfigInterface } from '@asyncapi/react-component/browser'
import DownloadIcon from '@mui/icons-material/Download'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
import Typography from '@mui/material/Typography'

import schemaUrl from '../../../../dxlink-specification/asyncapi.yml?url'

import '@asyncapi/react-component/styles/default.css'

// The viewer renders inside our own Card, which already provides the heading and
// the download action — its sidebar would duplicate that navigation.
const CONFIG: ConfigInterface = {
  show: {
    sidebar: false,
  },
}

/**
 * Protocol page — renders the dxLink AsyncAPI specification.
 *
 * Uses the `@asyncapi/react-component/browser` standalone bundle, which embeds its
 * own AsyncAPI parser (the plain entry expects a pre-parsed document). The spec is
 * imported with Vite's `?url` so it is emitted as a hashed asset and can be both
 * fetched by the viewer and downloaded by the user.
 *
 * Default-exported only, so `app/routes.tsx` can lazy-load it and keep the parser and
 * highlighter out of the initial chunk.
 */
const ProtocolPage = () => (
  <Card variant="outlined">
    <CardHeader
      title={<Typography sx={{ fontWeight: 700 }}>dxLink WebSocket protocol</Typography>}
      subheader="AsyncAPI specification"
      action={
        <Button
          component="a"
          href={schemaUrl}
          download="asyncapi.yml"
          startIcon={<DownloadIcon />}
          size="small"
        >
          Download spec
        </Button>
      }
    />
    <CardContent>
      {/*
        The AsyncAPI stylesheet is light-only, so pin this subtree to a light surface
        instead of letting it inherit our dark palette (which would leave dark-on-dark
        text). `colorScheme: 'light'` keeps native scrollbars/controls consistent too.
      */}
      <Box
        sx={{
          bgcolor: '#fff',
          color: '#1a1a1a',
          colorScheme: 'light',
          borderRadius: 1,
          overflowX: 'auto',
        }}
      >
        <AsyncApi schema={{ url: schemaUrl }} config={CONFIG} />
      </Box>
    </CardContent>
  </Card>
)

export default ProtocolPage
