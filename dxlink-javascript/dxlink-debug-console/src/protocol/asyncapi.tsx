import AsyncApi, { ConfigInterface } from '@asyncapi/react-component/browser'
import '@asyncapi/react-component/styles/default.css'
import styled from 'styled-components'
import { Download as DownloadIcon } from '@dxfeed/ui-kit/Icons'
import { IconButton } from '@dxfeed/ui-kit/IconButton'
import schemaUrl from '../../../../dxlink-specification/asyncapi.yml?url'

const CONFIG: ConfigInterface = {
  show: {
    sidebar: false,
  },
}

const Root = styled.div`
  position: relative;
  width: 100%;
  min-height: 100px;
  background-color: #fff;
`

const Download = styled(IconButton)`
  position: absolute;
  top: 2rem;
  right: 2rem;
  z-index: 1000;
`

export function AsyncApiProtocol() {
  return (
    <Root>
      <AsyncApi schema={{ url: schemaUrl }} config={CONFIG} />

      <Download
        size={'large'}
        title={'Download schema'}
        onClick={() => {
          window.open(schemaUrl, '_blank', 'noopener,noreferrer')
        }}
      >
        <DownloadIcon />
      </Download>
    </Root>
  )
}
