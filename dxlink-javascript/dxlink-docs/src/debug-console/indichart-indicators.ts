export interface IndichartIndicatorExample {
  id: string
  docUrl?: string
}

export type Lang = 'js'

const INDICHART_DXSCRIPT_INDICATORS = {
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

  'Commodity Channel Index (CCI)': `in n = 14;
in overBought: const number = 100
in overSold: const number = -100

def x = (high + low + close)
def ld = linerDev(x, n); // JavaImpl
out cci = (x - sma(x, n)) / ld / 0.015;
out OverBought = overBought
out Zero = 0
out OverSold = overSold`,

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

const INDICHART_JS_INDICATORS = {
  'Accumulation Distribution (ADL)': `const h = high.get()
const l = low.get()
const c = close.get()
const vol = volume.get()

const moneyFlowMultiplier = (h !== l) ? ((c - l) - (h - c)) / (h - l) : 1.0;
const moneyFlowVolume = moneyFlowMultiplier * vol;

const adl = useSeries(moneyFlowVolume)
useOutput("adl", adl.cumulativeSum())
useOutput("zero", 0)`,

  Aroon: `const n = useInput("n",25)
const overBought = useInput("overBought", 70)
const overSold = useInput("overSold", 30)

let h = useSeries(high.get())
let l = useSeries(low.get())
useOutput("aroonUp", aroonUp(h, n))
useOutput("aroonDown", aroonDown(l, n))
useOutput("overBought", overBought)
useOutput("overSold", overSold)

function aroonUp(x, n) {
    // return (n - x.indexOfMaximum(n)) / n * 100
    return (n - indexOfMaximum(x, n)) / n * 100
}

function aroonDown(x, n) {
    // return (n - x.indexOfMinimum(n)) / n * 100
    return (n - indexOfMinimum(x, n)) / n * 100
}

function indexOfMaximum(x, n) {
    if (isNaN(x.get(n - 1))) {
        return n;
    }
    let indexMaxVal = 0
    let maxVal = x.get(0)
    for (let i = 1; i < n; ++i) {
        let v = x.get(i)
        if (v > maxVal) {
            maxVal = v
            indexMaxVal = i
        }
    }
    return indexMaxVal
}

function indexOfMinimum(x, n) {
    if (isNaN(x.get(n - 1))) {
        return n;
    }
    let indexMinVal = 0
    let minVal = x.get(0)
    for (let i = 1; i < n; ++i) {
        let v = x.get(i)
        if (v < minVal) {
            minVal = v
            indexMinVal = i
        }
    }
    return indexMinVal
}
`,

  'Awesome Oscillator (AO)': `const mid = useSeries((high.get() + low.get()) / 2)

useOutput("awesome", mid.sma(5) - mid.sma(34))
useOutput("zero", 0)
`,

  'Chande Momentum Oscillator (CMO)': `const n = useInput("n", 20)

let diff = close.get() - close.get(1)
let inc = useSeries(Math.max(diff, 0))
let dec = useSeries(Math.max(diff * -1, 0))
let sumInc = inc.sum(n)
let sumDec = dec.sum(n)

useOutput("CMO", (sumInc - sumDec) / (sumInc + sumDec) * 100)
useOutput("UpperLevel", 50)
useOutput("LowerLevel", -50)
useOutput("Zero", 0)`,

  'Commodity Channel Index (CCI)': `const n = useInput("n", 14);
const overBought = useInput("overBought", 100)
const overSold = useInput("overSold", -100)

let x = useSeries(high.get() + low.get() + close.get())
let ld = linerDev(x, n);
useOutput("cci", (x.get() - x.sma(n)) / ld / 0.015)
useOutput("OverBought", overBought)
useOutput("OverSold", overSold)
useOutput("Zero", 0)

function avg(x, n) {
    let sum = 0;
    for (let i = 0; i < n; ++i) {
        sum += x.get(i);
    }
    return sum / n;
}

function linerDev(x, n) {
    if (isNaN(x.get(n - 1))) {
        return NaN
    }

    let average = avg(x, n);

    let sumDiff = 0.0;
    for (let i = 0; i < n; ++i) {
        sumDiff += Math.abs(x.get(i) - average);
    }
    return sumDiff / n;
}`,

  Momentum: `const n = useInput("n", 12)
useOutput("momentum", close.get() - close.get(n))`,

  'Money Flow (MFI)': `const n = useInput("n", 14)
const overBought = useInput("OverBought", 80)
const overSold = useInput("OverSold", 20)

let tp = useSeries((high.get() + low.get() + close.get()) / 3)
let positiveMoneyFlow = useSeries((tp.get() > tp.get(1)) ? tp.get() * volume.get() : 0)
let negativeMoneyFlow = useSeries((tp.get() < tp.get(1)) ? tp.get() * volume.get() : 0)
let sumPositiveMoneyFlow = positiveMoneyFlow.sum(n)
let sumNegativeMoneyFlow = negativeMoneyFlow.sum(n)
useOutput("MFidx", 100 - (100 / (1 + sumPositiveMoneyFlow / sumNegativeMoneyFlow)))
useOutput("OverBought", overBought)
useOutput("OverSold",  overSold)`,

  'On Balance Volume (OBV)': `let diff = close.get() - close.get(1)
let v = useSeries((diff > 0) ? volume.get() : ((diff < 0) ? -volume.get() : 0))
useOutput("obv", v.cumulativeSum())`,

  'Price Volume Trend (PVT)': `let prevClose = close.get(1)
let currentClose = close.get()
let v = useSeries((currentClose - prevClose) / prevClose * volume.get())
useOutput("pvt", v.cumulativeSum())`,

  'Rate of Change (ROC)': `const n = useInput("n", 12)
let prevClose = close.get(n)
let currentClose = close.get()
useOutput("roc", ((currentClose - prevClose) / prevClose) * 100)
useOutput("zero", 0)`,

  'Relative Vigor Index (RVI)': `let nominator = close.get() - open.get()
let denominator = high.get() - low.get()
useOutput("rvi", nominator / denominator)`,

  'Simple Moving Average': `const n = useInput("n", 5)

useOutput("sma", open.sma(n))`,

  'Smoothed Moving Average': `const n = useInput("n", 9)

let series = useSeries(close.get())
useOutput("SMMA", series.wima(n))`,

  'Weighted Moving Average': `const n = useInput("n", 1)
useOutput("wma", useSeries(open.get()).wma(n))`,
}

export const INDICHART_INDICATROS = window.INDICHART_INDICATROS || {
  js: {},
}

export const INDICHART_INDICATOR_EXAMPLES = window.INDICHART_INDICATOR_EXAMPLES || []

declare global {
  interface Window {
    INDICHART_INDICATOR_EXAMPLES?: IndichartIndicatorExample[]
    INDICHART_INDICATROS?: Record<string, Record<string, string>>
  }
}
