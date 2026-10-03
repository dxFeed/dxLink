import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { RpcChannelRequest } from './rpc-channel-request'
import type { RpcRequest } from './types'

const request: RpcRequest = {
  url: '/proto/docs',
  registry: null,
  source: null,
  serviceName: '',
  methodName: '',
  json: '{}',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('RpcChannelRequest loading', () => {
  it('reports a load that fails, in the form', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 404, statusText: 'Not Found' }))
    )
    render(<RpcChannelRequest value={request} onChange={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Load' }))

    expect(
      await screen.findByText('Could not load definitions from /proto/docs: 404 Not Found')
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Load' })).toBeEnabled()
  })

  it('abandons a load in flight when the dialog closes, aborting its request', async () => {
    let signal: AbortSignal | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => {
        signal = init.signal ?? undefined
        return new Promise<Response>(() => undefined)
      })
    )
    const onChange = vi.fn()
    const { unmount } = render(<RpcChannelRequest value={request} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Load' }))
    await waitFor(() => expect(signal).toBeDefined())
    expect(screen.getByRole('button', { name: 'Load' })).toBeDisabled()

    unmount()

    await waitFor(() => expect(signal?.aborted).toBe(true))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('aborts a request whose headers came back while its body is still arriving', async () => {
    let signal: AbortSignal | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => {
        signal = init.signal ?? undefined
        // Headers now; a body that never finishes.
        return Promise.resolve(new Response(new ReadableStream(), { status: 200 }))
      })
    )
    const { unmount } = render(<RpcChannelRequest value={request} onChange={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Load' }))
    await waitFor(() => expect(signal).toBeDefined())
    // Give the fetch time to resolve, so the load is reading the body when the dialog closes.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(signal?.aborted).toBe(false)

    unmount()

    await waitFor(() => expect(signal?.aborted).toBe(true))
  })
})
