import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

import type { DomRequest } from './types'
import { DocLink } from '../components/doc-link'
import { ORDER_SOURCES_DOC_URL } from '../lib/order-sources'

interface DomChannelRequestProps {
  value: DomRequest
  onChange: (value: DomRequest) => void
}

/** DOM channel request form (draft / presentational only). */
export const DomChannelRequest = ({ value, onChange }: DomChannelRequestProps) => (
  <Stack spacing={2.5} sx={{ pt: 1 }}>
    <TextField
      label="Symbol"
      required
      value={value.symbol}
      onChange={(e) => onChange({ ...value, symbol: e.target.value })}
      size="small"
      fullWidth
      helperText="Subscription symbol for Depth of Market."
    />
    <TextField
      label="Sources"
      value={value.source}
      onChange={(e) => onChange({ ...value, source: e.target.value })}
      size="small"
      fullWidth
      helperText={
        <>
          Price level sources, comma/space separated — <code>AGGREGATE</code>, <code>REGIONAL</code>
          , or a venue in lower case such as <code>ntv</code> or <code>glbx</code>. Full list on{' '}
          <DocLink href={ORDER_SOURCES_DOC_URL}>kb.dxfeed.com</DocLink>.
        </>
      }
    />
    <Accordion disableGutters variant="outlined" sx={{ '&::before': { display: 'none' } }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography sx={{ fontWeight: 600 }}>Feed</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={2.5}>
          <TextField
            label="Feed qualification"
            value={value.feed}
            onChange={(e) => onChange({ ...value, feed: e.target.value })}
            size="small"
            fullWidth
            helperText="Optional — leave empty to omit from the request."
          />
          <TextField
            label="Feed space"
            value={value.space}
            onChange={(e) => onChange({ ...value, space: e.target.value })}
            size="small"
            fullWidth
            helperText="Optional — leave empty to omit from the request."
          />
        </Stack>
      </AccordionDetails>
    </Accordion>
  </Stack>
)
