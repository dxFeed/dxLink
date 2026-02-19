import {
  FeedContract,
  FeedDataFormat,
  DXLinkWebSocketClient,
  DXLinkFeed,
  DXLinkDepthOfMarket,
  DXLinkIndiChart,
  type DXLinkIndiChartIndicators,
} from '../src'


const DEFAULT_URL = 'wss://demo.dxfeed.com/dxlink-ws'

function startFeed(url: string): DXLinkWebSocketClient {
  console.log('Start Feed')

  const client = new DXLinkWebSocketClient()
  client.connect(url)

  const feed = new DXLinkFeed(client, FeedContract.TICKER)

  feed.addEventListener((events) => {
    // your buisness logic here
    console.log('Feed Events', events)
  })

  feed.configure({
    acceptAggregationPeriod: 10,
    acceptDataFormat: FeedDataFormat.COMPACT,
    acceptEventFields: {
      Quote: ['eventSymbol', 'askPrice', 'bidPrice'],
    },
  })

  feed.addSubscriptions({ type: 'Quote', symbol: 'AAPL' })

  // setTimeout(() => {
  //   feed.addSubscriptions(sub2)
  //   feed.removeSubscriptions(sub1)

  //   setTimeout(() => {
  //     feed.clearSubscriptions()
  //   }, 3000)
  // }, 3000)

  return client
}

function startDepthOfMarket(url: string): DXLinkWebSocketClient {
  console.log('Start Dom')

  const client = new DXLinkWebSocketClient()
  client.connect(url)

  const dom = new DXLinkDepthOfMarket(client, { symbol: 'AAPL', sources: ['ntv'] })

  dom.addSnapshotListener((time, bids, asks) => {
    // your buisness logic here
    console.log('Dom Snapshot', time, bids, asks)
  })

  dom.configure({
    acceptAggregationPeriod: 10,
    acceptDepthLimit: 5,
  })

  return client
}

function startIndichart(url: string): DXLinkWebSocketClient {
  console.log('Start Indichart')

  const client = new DXLinkWebSocketClient()
  client.connect(url)

  const indicators: DXLinkIndiChartIndicators = {
    indicator1: {
      lang: 'js',
      content:
          `function onTick() {
            const sma = ta.sma(close, input.double("length", 20));
            spline(sma, {title: "SMA"});
          }`,
    },
  }

  const indichart = new DXLinkIndiChart(client, indicators)

  indichart.addIndicatorsStateChangeListener((indicators) => {
    // your buisness logic here
    console.log('Indicators State', indicators)
  })

  indichart.addUpdateListener((candles, indicators, pending) => {
    // your buisness logic here
    console.log('Chart Data', indichart.getSubscription(), candles, indicators, pending)
  })

  indichart.setSubscription(
    {
      symbol: 'AAPL{=d}',
      fromTime: 0,
    },
    {}
  )

  return client
}


function createUi(): void {
  type DemoDefinition = {
    label: string
    defaultUrl: string
    start: (url: string) => DXLinkWebSocketClient
  }
  
  const DEMOS = {
    feed: {
      label: 'Feed',
      defaultUrl: DEFAULT_URL,
      start: startFeed,
    } satisfies DemoDefinition,
    dom: {
      label: 'DepthOfMarket',
      defaultUrl: DEFAULT_URL,
      start: startDepthOfMarket,
    } satisfies DemoDefinition,
    indichart: {
      label: 'Indichart',
      defaultUrl: DEFAULT_URL,
      start: startIndichart,
    } satisfies DemoDefinition,
  } as const
  
  const DEMO_KEYS = Object.keys(DEMOS) as (keyof typeof DEMOS)[]
  
  let activeClient: DXLinkWebSocketClient | undefined

  const root = document.getElementById('root')
  if (!(root instanceof HTMLElement)) {
    throw new Error('Missing #root element')
  }

  const wrapper = document.createElement('main')
  wrapper.style.display = 'grid'
  wrapper.style.gap = '8px'
  wrapper.style.maxWidth = '680px'
  wrapper.style.padding = '16px'

  const demoLabel = document.createElement('label')
  demoLabel.textContent = 'Demo'
  demoLabel.style.display = 'grid'
  demoLabel.style.gap = '4px'

  const demoSelect = document.createElement('select')
  for (const demoId of DEMO_KEYS) {
    const option = document.createElement('option')
    option.value = demoId
    option.textContent = DEMOS[demoId].label
    demoSelect.append(option)
  }
  demoLabel.append(demoSelect)

  const urlLabel = document.createElement('label')
  urlLabel.textContent = 'URL'
  urlLabel.style.display = 'grid'
  urlLabel.style.gap = '4px'

  const urlInput = document.createElement('input')
  urlInput.type = 'text'
  urlInput.spellcheck = false
  urlInput.autocomplete = 'off'
  urlLabel.append(urlInput)

  const startButton = document.createElement('button')
  startButton.type = 'button'
  startButton.textContent = 'Start'

  const getSelectedDemo = (): DemoDefinition => {
    const demoId = demoSelect.value
    if (demoId in DEMOS) {
      return DEMOS[demoId as keyof typeof DEMOS]
    }
    throw new Error(`Unknown demo: ${demoId}`)
  }

  const syncUrlWithSelectedDemo = (): void => {
    urlInput.value = getSelectedDemo().defaultUrl
  }

  demoSelect.addEventListener('change', syncUrlWithSelectedDemo)
  syncUrlWithSelectedDemo()

  startButton.addEventListener('click', () => {
    const selectedDemo = getSelectedDemo()
    const url = urlInput.value.trim() || selectedDemo.defaultUrl
    urlInput.value = url

    activeClient?.disconnect()
    activeClient = selectedDemo.start(url)
  })

  window.addEventListener('beforeunload', () => {
    activeClient?.disconnect()
  })

  wrapper.append(demoLabel, urlLabel, startButton)
  root.append(wrapper)
}

createUi()
