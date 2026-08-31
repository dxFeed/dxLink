import type {
  DescField,
  DescMessage,
  DescMethod,
  DescService,
  FileRegistry,
  JsonValue,
} from '@bufbuild/protobuf'
import { ScalarType } from '@bufbuild/protobuf'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import FormControlLabel from '@mui/material/FormControlLabel'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useMemo, useRef, useState } from 'react'

import {
  createRequestTemplate,
  fetchDescriptorSet,
  isMethodSupported,
  listServices,
  methodModel,
  parseRequest,
  readDescriptorSet,
} from './descriptors'
import type { RpcRequest } from './types'

interface RpcChannelRequestProps {
  value: RpcRequest
  onChange: (value: RpcRequest) => void
  /**
   * Whether the deployment pinned the descriptor-set URL.
   *
   * Read-only rather than hidden, and Load still works: the same reasoning as the connection
   * panel's pinned endpoint — in a debug console the definitions you are calling against are
   * worth seeing even when you cannot point somewhere else.
   */
  urlLocked?: boolean
}

const stringify = (json: JsonValue): string => JSON.stringify(json, null, 2)

/** Fields the generated controls can edit; everything else is edited as JSON. */
const isEditableField = (field: DescField): boolean =>
  (field.fieldKind === 'scalar' || field.fieldKind === 'enum') && field.oneof === undefined

const STRING_SCALARS = new Set<ScalarType>([
  ScalarType.STRING,
  ScalarType.BYTES,
  ScalarType.INT64,
  ScalarType.UINT64,
  ScalarType.FIXED64,
  ScalarType.SFIXED64,
  ScalarType.SINT64,
])

const scalarHelp = (scalar: ScalarType): string | undefined => {
  if (scalar === ScalarType.BYTES) return 'bytes — base64'
  if (STRING_SCALARS.has(scalar) && scalar !== ScalarType.STRING) return '64-bit — sent as a string'

  return undefined
}

/**
 * Controls generated from the request message descriptor.
 *
 * The protobuf-JSON text is the single source of truth: each control reads its value out of
 * the parsed object and writes a new object back. While the text is not valid JSON the
 * controls stand down — the raw editor below is then the only sane way to fix it.
 */
const RequestFields = ({
  message,
  json,
  onChange,
}: {
  message: DescMessage
  json: string
  onChange: (json: string) => void
}) => {
  const parsed = useMemo((): Record<string, JsonValue> | null => {
    try {
      const value: unknown = JSON.parse(json)

      return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as Record<string, JsonValue>)
        : null
    } catch {
      return null
    }
  }, [json])

  const fields = message.fields.filter(isEditableField)
  if (fields.length === 0) {
    return null
  }

  if (parsed === null) {
    return (
      <Typography variant="body2" color="text.secondary">
        Fields are editable again once the request below is a JSON object.
      </Typography>
    )
  }

  const set = (field: DescField, fieldValue: JsonValue) =>
    onChange(stringify({ ...parsed, [field.jsonName]: fieldValue }))

  return (
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
      {fields.map((field) => {
        const current = parsed[field.jsonName]

        if (field.fieldKind === 'enum') {
          return (
            <TextField
              key={field.number}
              select
              label={field.name}
              value={typeof current === 'string' ? current : ''}
              onChange={(e) => set(field, e.target.value)}
              size="small"
              helperText={field.enum.typeName}
            >
              {field.enum.values.map((enumValue) => (
                <MenuItem key={enumValue.number} value={enumValue.name}>
                  {enumValue.name}
                </MenuItem>
              ))}
            </TextField>
          )
        }

        if (field.fieldKind !== 'scalar') {
          return null
        }

        if (field.scalar === ScalarType.BOOL) {
          return (
            <FormControlLabel
              key={field.number}
              control={
                <Switch
                  checked={current === true}
                  onChange={(e) => set(field, e.target.checked)}
                  size="small"
                />
              }
              label={field.name}
            />
          )
        }

        if (STRING_SCALARS.has(field.scalar)) {
          return (
            <TextField
              key={field.number}
              label={field.name}
              value={typeof current === 'string' ? current : ''}
              onChange={(e) => set(field, e.target.value)}
              size="small"
              helperText={scalarHelp(field.scalar)}
            />
          )
        }

        return (
          <TextField
            key={field.number}
            label={field.name}
            type="number"
            value={typeof current === 'number' ? String(current) : ''}
            onChange={(e) => set(field, e.target.value === '' ? 0 : Number(e.target.value))}
            size="small"
          />
        )
      })}
    </Box>
  )
}

/**
 * RPC channel request form: load a descriptor set, pick a service and a method, fill in the
 * request.
 *
 * There is no built-in service list on purpose — the console is pointed at whatever
 * definitions the server (or a local `buf build -o set.binpb`) provides, so it is not tied
 * to any one API's release cycle.
 */
export const RpcChannelRequest = ({ value, onChange, urlLocked }: RpcChannelRequestProps) => {
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const services = useMemo(
    () => (value.registry === null ? [] : listServices(value.registry)),
    [value.registry]
  )
  const service: DescService | undefined = services.find((s) => s.typeName === value.serviceName)
  const method: DescMethod | undefined = service?.method[value.methodName]

  const parsedRequest = useMemo(
    () => (method === undefined ? null : parseRequest(method.input, value.json)),
    [method, value.json]
  )

  const selectMethod = (next: DescMethod | undefined, patch: Partial<RpcRequest> = {}) =>
    onChange({
      ...value,
      ...patch,
      methodName: next?.localName ?? '',
      json: next === undefined ? '{}' : stringify(createRequestTemplate(next.input)),
    })

  const selectService = (next: DescService | undefined) =>
    selectMethod(next?.methods.find(isMethodSupported), { serviceName: next?.typeName ?? '' })

  const load = async (source: string, loader: () => Promise<void>) => {
    setLoading(true)
    setLoadError(null)
    try {
      await loader()
    } catch (error) {
      setLoadError(
        `Could not load definitions from ${source}: ${error instanceof Error ? error.message : String(error)}`
      )
    } finally {
      setLoading(false)
    }
  }

  // Loading a new set invalidates the current selection — preselect its first service and
  // that service's first supported method, the same as a fresh dialog would.
  const applyRegistry = (registry: FileRegistry, source: string) => {
    const firstService = listServices(registry)[0]
    const firstMethod = firstService?.methods.find(isMethodSupported)

    onChange({
      ...value,
      registry,
      source,
      serviceName: firstService?.typeName ?? '',
      methodName: firstMethod?.localName ?? '',
      json: firstMethod === undefined ? '{}' : stringify(createRequestTemplate(firstMethod.input)),
    })
  }

  const loadUrl = () =>
    load(value.url, async () => {
      applyRegistry(await fetchDescriptorSet(value.url), value.url)
    })

  const loadFile = (file: File) =>
    load(file.name, async () => {
      applyRegistry(await readDescriptorSet(file), file.name)
    })

  return (
    <Stack spacing={2.5} sx={{ pt: 1 }}>
      <Stack spacing={1.5}>
        <Typography variant="subtitle2">Service definitions</Typography>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
          <TextField
            label="Descriptor set URL"
            value={value.url}
            onChange={(e) => onChange({ ...value, url: e.target.value })}
            disabled={urlLocked}
            size="small"
            fullWidth
            helperText={
              urlLocked
                ? 'Fixed by this deployment.'
                : 'An endpoint serving a FileDescriptorSet, binary or protobuf-JSON.'
            }
          />
          <Button
            variant="outlined"
            onClick={() => void loadUrl()}
            disabled={loading || value.url.trim() === ''}
            sx={{ mt: 0.25 }}
          >
            Load
          </Button>
        </Stack>
        <Box>
          <Button
            size="small"
            startIcon={<UploadFileIcon />}
            onClick={() => fileInput.current?.click()}
            disabled={loading}
          >
            Load from file
          </Button>
          <input
            ref={fileInput}
            type="file"
            hidden
            accept=".binpb,.bin,.pb,.json"
            onChange={(e) => {
              const file = e.target.files?.[0]
              // Clear the input so picking the same file again still fires a change.
              e.target.value = ''
              if (file !== undefined) void loadFile(file)
            }}
          />
        </Box>
        {loadError !== null && <Alert severity="error">{loadError}</Alert>}
        {value.registry !== null && loadError === null && (
          <Typography variant="caption" color="text.secondary">
            {services.length} service{services.length === 1 ? '' : 's'} from {value.source}
          </Typography>
        )}
      </Stack>

      {value.registry !== null && (
        <>
          <TextField
            select
            label="Service"
            value={service?.typeName ?? ''}
            onChange={(e) => selectService(services.find((s) => s.typeName === e.target.value))}
            size="small"
            fullWidth
            disabled={services.length === 0}
            helperText={services.length === 0 ? 'The descriptor set declares no services.' : ' '}
          >
            {services.map((option) => (
              <MenuItem key={option.typeName} value={option.typeName}>
                {option.typeName}
              </MenuItem>
            ))}
          </TextField>

          {service !== undefined && (
            <TextField
              select
              label="Method"
              value={method?.localName ?? ''}
              onChange={(e) =>
                selectMethod(service.methods.find((m) => m.localName === e.target.value))
              }
              size="small"
              fullWidth
              helperText={method === undefined ? ' ' : methodModel(method).description}
            >
              {service.methods.map((option) => (
                <MenuItem
                  key={option.name}
                  value={option.localName}
                  disabled={!isMethodSupported(option)}
                >
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <span>{option.name}</span>
                    <Chip size="small" variant="outlined" label={methodModel(option).label} />
                  </Stack>
                </MenuItem>
              ))}
            </TextField>
          )}

          {method !== undefined && (
            <Stack spacing={1.5}>
              <Typography variant="subtitle2">Request · {method.input.typeName}</Typography>
              <RequestFields
                message={method.input}
                json={value.json}
                onChange={(json) => onChange({ ...value, json })}
              />
              <Accordion
                disableGutters
                variant="outlined"
                defaultExpanded
                sx={{ '&::before': { display: 'none' } }}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography sx={{ fontWeight: 600 }}>Request JSON</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <TextField
                    value={value.json}
                    onChange={(e) => onChange({ ...value, json: e.target.value })}
                    multiline
                    minRows={6}
                    fullWidth
                    size="small"
                    slotProps={{ input: { sx: { fontFamily: 'monospace', fontSize: 13 } } }}
                    helperText="Canonical protobuf-JSON — exactly what is sent on the channel."
                  />
                </AccordionDetails>
              </Accordion>
              {parsedRequest !== null && 'error' in parsedRequest && (
                <Alert severity="error">{parsedRequest.error}</Alert>
              )}
            </Stack>
          )}
        </>
      )}
    </Stack>
  )
}

/** Whether the current request form can open a channel. */
export const canOpenRpcChannel = (value: RpcRequest): boolean => {
  if (value.registry === null) return false
  const service = value.registry.getService(value.serviceName)
  const method = service?.method[value.methodName]
  if (method === undefined || !isMethodSupported(method)) return false

  return !('error' in parseRequest(method.input, value.json))
}
