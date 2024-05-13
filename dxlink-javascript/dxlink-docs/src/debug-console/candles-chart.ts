import type { ChartColors } from '@devexperts/dxcharts-lite/dist/chart/chart.config'

export const candleChartColors: ChartColors = {
  candleTheme: {
    upColor: '#0fa68a',
    downColor: '#e91d25',
    downWickColor: '#e91d25',
    upWickColor: '#0fa68a',
    noneColor: '#4c5458',
  },
  barTheme: {
    upColor: '#0fa68a',
    downColor: '#e91d25',
    noneColor: '#4c5458',
  },
  lineTheme: {
    upColor: '#0fa68a',
    downColor: '#e91d25',
    noneColor: '#4c5458',
  },
  scatterPlot: {
    mainColor: '#ffffff',
  },
  areaTheme: {
    lineColor: 'rgba(226,61,25,1)',
    startColor: 'rgba(226,61,25,0.8)',
    stopColor: 'rgba(226,61,25,0)',
  },
  baseLineTheme: {
    lowerSectionStrokeColor: '#D92C40',
    upperSectionStrokeColor: '#4D9953',
    lowerSectionFillColor: 'rgba(217,44,64,0.07)',
    upperSectionFillColor: 'rgba(77,153,83,0.07)',
    baselineColor: 'rgba(255, 255, 255, 0.15)',
  },
  histogram: {
    upCap: 'rgba(51, 153, 51, 0.4)',
    upBottom: 'rgba(51, 153, 51, 0.1)',
    upBright: 'rgba(77, 153, 83, 1)',
    downCap: 'rgba(153, 51, 51, 0.4)',
    downBottom: 'rgba(153, 51, 51, 0.1)',
    downBright: 'rgba(217, 44, 64, 1)',
    noneCap: 'rgba(255,255,255,0.4)',
    noneBottom: 'rgba(255,255,255,0.1)',
    noneBright: 'rgba(255,255,255,1)',
  },
  chartAreaTheme: {
    backgroundMode: 'regular',
    backgroundGradientTopColor: '#ffffff',
    backgroundGradientBottomColor: '#ffffff',
    backgroundColor: '#ffffff',
    gridColor: '#373d40',
  },
  crossTool: {
    lineColor: 'rgb(59, 59, 59)',
    labelBoxColor: 'rgb(59, 59, 59)',
    labelTextColor: '#aeb1b3',
  },
  waterMarkTheme: {
    firstRowColor: 'rgba(0, 0, 0, .3)',
    secondRowColor: 'rgba(0, 0, 0, .3)',
    thirdRowColor: 'rgba(0, 0, 0, .3)',
  },
  xAxis: {
    backgroundColor: '#ffffff',
    labelTextColor: '#318b6f',
  },
  yAxis: {
    backgroundColor: '#ffffff',
    labelTextColor: '#99922a',
  },
}
