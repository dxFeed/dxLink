export interface IndichartIndicatorExample {
  id: string
  docUrl?: string
}

export type Lang = 'dxScript' | 'js'

export const INDICHART_DXSCRIPT_INDICATORS = {
  'Accumulation Distribution (ADL)': `def h = high
def l = low
def c = close
def vol = volume

def moneyFlowMultiplier = if (h != l) ((c - l) - (h - c)) / (h - l) else 1.0
def moneyFlowVolume = moneyFlowMultiplier * vol

def adl = adl[1] + moneyFlowVolume default moneyFlowVolume
out adl = adl
out zero = 0`,

  Aroon: `in n = 25
in overBought = 70
in overSold = 30

def h = high
def l = low
out aroonUp = aroonUp(h, n)
out aroonDown = aroonDown(l, n)
out overBought = overBought
out overSold = overSold

fun aroonUp {
    in x: number
    in n: const number
    out = ((n - 1) - x.indexOfMaximum(n)) / (n - 1) * 100
}

fun aroonDown {
    in x: number
    in n: const number
    out = ((n - 1) - x.indexOfMinimum(n)) / (n - 1) * 100
}`,

  'Awesome Oscillator (AO)': `def mid = (high + low) / 2
out awesome = sma(mid, 5) - sma(mid, 34);
out zero = 0`,

  'Chande Momentum Oscillator (CMO)': `in n = 20
def c = close
def diff = c - c[1]
def increment = max(diff, 0)
def decrement = max(diff * -1, 0)
def sumInc = increment.sum(n)
def sumDec = decrement.sum(n)
out CMO = (sumInc - sumDec) / (sumInc + sumDec) * 100
out UpperLevel = 50
out LowerLevel = -50
out Zero = 0`,

  'Commodity Channel Index (CCI)': `in n = 20
def c = close
def diff = c - c[1]
def increment = max(diff, 0)
def decrement = max(diff * -1, 0)
def sumInc = increment.sum(n)
def sumDec = decrement.sum(n)
out CMO = (sumInc - sumDec) / (sumInc + sumDec) * 100
out UpperLevel = 50
out LowerLevel = -50
out Zero = 0`,

  Momentum: `in n = 12
out momentum = close - close[n]`,

  'Money Flow (MFI)': `in n: const number = 14
in overBought: const number = 80
in overSold: const number = 20

def tp = (high + low + close) / 3
def positiveMoneyFlow = if (isNaN(tp[1])) 0 else if (tp > tp[1]) tp * volume else 0
def negativeMoneyFlow = if (isNaN(tp[1])) 0 else if (tp < tp[1]) tp * volume else 0
def sumPositiveMoneyFlow = positiveMoneyFlow.sum(n)
def sumNegativeMoneyFlow = negativeMoneyFlow.sum(n)
out MFidx = 100 - (100 / (1 + sumPositiveMoneyFlow / sumNegativeMoneyFlow))
out OverBought = overBought
out OverSold = overSold`,

  'On Balance Volume (OBV)': `def diff = close - close[1]
def v = if (diff > 0) volume else if (diff < 0) -volume else 0
def res = res[1] + v default v
out obv = res`,

  'Price Volume Trend (PVT)': `def prevClose = close[1]
def currentClose = close
def v = ((currentClose - prevClose) / prevClose) * volume
out pvt = pvt[1] + v default if (isNaN(v)) 0 else v`,

  'Rate of Change (ROC)': `in n: const number = 12
def prevClose = close[n]
def currentClose = close
out roc = ((currentClose - prevClose) / prevClose) * 100
out zero = 0`,

  'Relative Vigor Index (RVI)': `def nominator = close - open
def denominator = high - low
out rvi = nominator / denominator`,

  'Simple Moving Average': `in n = 1
out sma = sma(open, n)`,

  'Smoothed Moving Average': `in n: const number = 9

def initialSMMA = close.sma(n)
out SMMA = (SMMA[1] * (n - 1) + close) / n default initialSMMA`,

  'Weighted Moving Average': `in n = 1
out wma = wma(open, n)`,
}

export const INDICHART_JS_INDICATORS = {
  'Accumulation Distribution (ADL)': `const h = high.last()
const l = low.last()
const c = close.last()
const vol = volume.last()

const moneyFlowMultiplier = h !== l ? (c - l - (h - c)) / (h - l) : 1.0
const moneyFlowVolume = moneyFlowMultiplier * vol

let computeStep = (prev) => prev + moneyFlowVolume
output.adl = cumulativeSum(0, computeStep)
output.zero = 0`,

  Aroon: `input.n = 25
input.overBought = 70
input.overSold = 30

let h = high
let l = low
output.aroonUp = aroonUp(h, input.n)
output.aroonDown = aroonDown(l, input.n)
output.overBought = input.overBought
output.overSold = input.overSold

function aroonUp(x, n) {
    return ((n - 1) - indexOfMaximum(x, n)) / (n - 1) * 100
}

function aroonDown(x, n) {
    return ((n - 1) - indexOfMinimum(x, n)) / (n - 1) * 100
}

function indexOfMaximum(x, n) {
    if (!rangeCheck(x, n)) {
        return NaN;
    }
    let indexMaxVal = 0
    let maxVal = x.last(0)
    for (let i = 1; i < n; ++i) {
        let v = x.last(i)
        if (!isNaN(v) && v > maxVal) {
            maxVal = v
            indexMaxVal = i
        }
    }
    return indexMaxVal
}

function indexOfMinimum(x, n) {
    if (!rangeCheck(x, n)) {
        return NaN;
    }
    let indexMinVal = 0
    let minVal = x.last(0)
    for (let i = 1; i < n; ++i) {
        let v = x.last(i)
        if (!isNaN(v) && v < minVal) {
            minVal = v
            indexMinVal = i
        }
    }
    return indexMinVal
}`,

  'Awesome Oscillator (AO)': `let mid  = ResultSeries.apply("ao", () => { return (high.last() + low.last()) / 2 })
output.awesome = sma(mid, 5) - sma(mid, 34);
output.zero = 0`,

  'Chande Momentum Oscillator (CMO)': `input.n = 20
let c = close
let diff = c.last() - c.last(1)
let inc = ResultSeries.apply("inc", () => { return Math.max(diff, 0) })
let dec = ResultSeries.apply("dec", () => { return Math.max(diff * -1, 0) })
let sumInc = sum(inc, input.n)
let sumDec = sum(dec, input.n)
output.CMO = (sumInc - sumDec) / (sumInc + sumDec) * 100
output.UpperLevel = 50
output.LowerLevel = -50
output.Zero = 0`,

  'Commodity Channel Index (CCI)': `input.n = 14;
input.overBought = 100
input.overSold = -100

let x =  ResultSeries.apply("sum", () => { return high.last() + low.last() + close.last() })
let ld = linerDev(x, input.n);
output.cci = (x.last() - sma(x, input.n)) / ld / 0.015;
output.OverBought = input.overBought
output.OverSold = input.overSold
output.Zero = 0

function avg(x, n) {
    if (!rangeCheck(x, n)) {
        return NaN
    }

    let sum = 0;
    for (let i = 0; i < n; ++i) {
        sum += x.last(i);
    }
    return sum / n;
}

function linerDev(x, n) {
    if (!rangeCheck(x, n)) {
        return NaN
    }

    let average = avg(x, n);

    let sumDiff = 0.0;
    for (let i = 0; i < n; ++i) {
        sumDiff += Math.abs(x.last(i) - average);
    }
    return sumDiff / n;
}`,

  Momentum: `input.n = 12
output.momentum = close.last() - close.last(input.n)`,

  'Money Flow (MFI)': `input.n = 14
input.OverBought = 80
input.OverSold = 20
const n = input.n
const overBought = input.OverBought
const overSold = input.OverSold

let tp = ResultSeries.apply("tp", () => { return (high.last() + low.last() + close.last()) / 3 })
let positiveMoneyFlow = ResultSeries.apply("pf", () => {
    if (tp.last() > tp.last(1)) {
        return tp.last() * volume.last();
    } else {
        return isNaN(tp.last(1)) ? NaN : 0;
    }
})
let negativeMoneyFlow = ResultSeries.apply("nf", () => {
    if (tp.last() < tp.last(1)) {
        return tp.last() * volume.last()
    } else {
        return isNaN(tp.last(1)) ? NaN : 0
    }
})
let sumPositiveMoneyFlow = sum(positiveMoneyFlow, n)
let sumNegativeMoneyFlow = sum(negativeMoneyFlow, n)
output.MFidx = 100 - (100 / (1 + sumPositiveMoneyFlow / sumNegativeMoneyFlow))
output.OverBought = overBought
output.OverSold = overSold`,

  'On Balance Volume (OBV)': `let diff = close.last() - close.last(1)
let v = (diff > 0) ? volume.last() : ((diff < 0) ? -volume.last() : 0)
let computationStep = (prev) => { return prev + v }
output.obv =  cumulativeSum(v, computationStep)`,

  'Price Volume Trend (PVT)': `let prevClose = close.last(1)
let currentClose = close.last()
let v = isNaN(prevClose) ? 0 : (currentClose - prevClose) / prevClose * volume.last()
let computationStep = (prev) => { return prev + v }
output.pvt = cumulativeSum(v, computationStep)`,

  'Rate of Change (ROC)': `input.n = 12
let prevClose = close.last(input.n)
let currentClose = close.last()
output.roc = ((currentClose - prevClose) / prevClose) * 100
output.zero = 0`,

  'Relative Vigor Index (RVI)': `let nominator = close.last() - open.last()
let denominator = high.last() - low.last()
output.rvi = nominator / denominator`,

  'Simple Moving Average': `input.n = 1
output.sma = sma(open, input.n)`,

  'Smoothed Moving Average': `input.n = 9
const n = input.n

let initValue = sma(close, n)
let computeStep = (prev) => { return (prev * (n - 1) + close.last()) / n }
output.SMMA = cumulativeSum(initValue, computeStep)`,

  'Weighted Moving Average': `input.n = 1
output.wma = wma(open, input.n)`,
}

export const INDICHART_INDICATROS: Record<Lang, Record<string, string>> = {
  dxScript: INDICHART_DXSCRIPT_INDICATORS,
  js: INDICHART_JS_INDICATORS,
}

export const INDICHART_INDICATOR_EXAMPLES: IndichartIndicatorExample[] = [
  {
    id: 'Accumulation Distribution (ADL)',
    docUrl: 'https://devexperts.com/dxcharts/kb/docs/accumulationdistribution',
  },
  { id: 'Aroon', docUrl: 'https://devexperts.com/dxcharts/kb/docs/aroon-indicator' },
  {
    id: 'Awesome Oscillator (AO)',
    docUrl: 'https://devexperts.com/dxcharts/kb/docs/awesome-oscillator-ao',
  },
  {
    id: 'Chande Momentum Oscillator (CMO)',
    docUrl: 'https://devexperts.com/dxcharts/kb/docs/chandle-momentum-oscillator',
  },
  {
    id: 'Commodity Channel Index (CCI)',
    docUrl: 'https://devexperts.com/dxcharts/kb/docs/commodity-channel-index',
  },
  { id: 'Momentum', docUrl: 'https://devexperts.com/dxcharts/kb/docs/momentum' },
  {
    id: 'Money Flow (MFI)',
    docUrl: 'https://devexperts.com/dxcharts/kb/docs/money-flow-index-mfi',
  },
  {
    id: 'On Balance Volume (OBV)',
    docUrl: 'https://devexperts.com/dxcharts/kb/docs/on-balance-volume',
  },
  {
    id: 'Price Volume Trend (PVT)',
    docUrl: 'https://devexperts.com/dxcharts/kb/docs/price-and-volume-trend',
  },
  {
    id: 'Rate of Change (ROC)',
    docUrl: 'https://devexperts.com/dxcharts/kb/docs/rate-of-change',
  },
  {
    id: 'Relative Vigor Index (RVI)',
    docUrl: 'https://devexperts.com/dxcharts/kb/docs/relative-vigor-index',
  },
  {
    id: 'Simple Moving Average',
    docUrl: 'https://devexperts.com/dxcharts/kb/docs/simple-moving-average-sma',
  },
  {
    id: 'Smoothed Moving Average',
    docUrl: 'https://devexperts.com/dxcharts/kb/docs/smoothed-simple-moving-average',
  },
  {
    id: 'Weighted Moving Average',
    docUrl: 'https://devexperts.com/dxcharts/kb/docs/weighted-moving-average-wma',
  },
]
