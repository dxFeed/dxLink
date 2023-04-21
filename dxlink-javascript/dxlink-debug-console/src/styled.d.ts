import 'styled-components'

import { Theme } from '@dxfeed/ui-kit/Theme/types'

declare module 'styled-components' {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/naming-convention
  export interface DefaultTheme extends Theme {}
}
