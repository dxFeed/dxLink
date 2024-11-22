import {
  type DXLinkChannel,
  type DXLinkChartSubscription,
  type DXLinkClient,
  DXLinkChart,
} from '@dxfeed/dxlink-api'

export class ChartHolder {
  private chart: DXLinkChart | null = null

  constructor(private readonly client: DXLinkClient) {}

  update(subscription: DXLinkChartSubscription, indicator: string): DXLinkChart {
    this.close()

    this.chart = new DXLinkChart(this.client, {
      current: {
        lang: 'dxScript',
        content: indicator,
      },
    })

    this.chart.setSubscription(subscription, {})

    return this.chart
  }

  getChart(): DXLinkChart | null {
    return this.chart
  }

  getChannel() {
    return this.chart?.getChannel()
  }

  get id() {
    return this.chart?.id
  }

  close() {
    if (this.chart !== null) {
      this.chart.close()
      this.chart = null
    }
  }
}
