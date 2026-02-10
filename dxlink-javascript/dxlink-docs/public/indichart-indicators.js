/* eslint-disable no-undef */;

const INDICHART_JS_INDICATORS = {
  'Accumulation Distribution (ADL)': `function onTick() {
	const moneyFlowMultiplier = (high !== low) ? ((close - low) - (high - close)) / (high - low) : 1.0;
	const moneyFlowVolume = ts(moneyFlowMultiplier * volume);
	spline(ta.cum(moneyFlowVolume), {title: "adl", offset: 0, type: spline.STYLE_LINE, color: color.GREEN});
	spline(0, {title: "zero", offset: 0, type: spline.STYLE_LINE, color: color.RED});
}`,

  'Aroon': `const n = input("n", 25);
const overBought = input("overBought", 70);
const overSold = input("overSold", 30);

function aroonUp(x, n) {
	// return (n - x.indexOfMaximum(n)) / n * 100;
	return (n - indexOfMaximum(x, n)) / n * 100;
}

function aroonDown(x, n) {
	// return (n - x.indexOfMinimum(n)) / n * 100;
	return (n - indexOfMinimum(x, n)) / n * 100;
}

function indexOfMaximum(x, n) {
	if (isNaN(x[n - 1])) {
		return n;
	}
	let indexMaxVal = 0;
	let maxVal = x[0];
	for (let i = 1; i < n; ++i) {
		let v = x[i];
		if (v > maxVal) {
			maxVal = v;
			indexMaxVal = i;
		}
	}
	return indexMaxVal;
}

function indexOfMinimum(x, n) {
	if (isNaN(x[n - 1])) {
		return n;
	}
	let indexMinVal = 0;
	let minVal = x[0];
	for (let i = 1; i < n; ++i) {
		let v = x[i];
		if (v < minVal) {
			minVal = v;
			indexMinVal = i;
		}
	}
	return indexMinVal;
}

function onTick() {
	const h = high;
	const l = low;
	spline(aroonUp(h, n), {title: "aroonUp", offset: 0, type: spline.STYLE_LINE, color: color.GREEN});
	spline(aroonDown(l, n), {title: "aroonDown", offset: 0, type: spline.STYLE_LINE, color: color.RED});
	spline(overBought, {title: "overBought", offset: 0, type: spline.STYLE_LINE, color: color.CYAN});
	spline(overSold, {title: "overSold", offset: 0, type: spline.STYLE_LINE, color: color.BLUE});
}`,

  'Average True Range (ATR)': `const n = input("n", 14);

function onTick() {
	const pc = close[1];
	const h = high;
	const l = low;
	const d1 = Math.abs(h - l);
	const d2 = Math.abs(h - pc);
	const d3 = Math.abs(l - pc);
	const tr = ts(Math.max(d1, d2, d3));
	spline(ta.wima(tr, n), {title: "atr", offset: 0, type: spline.STYLE_LINE, color: color.GREEN});
}`,

  'Awesome Oscillator (AO)': `function onTick() {
	const mid = ts((high + low) / 2);
	spline(ta.sma(mid, 5) - ta.sma(mid, 34), {title: "awesome", offset: 0, type: spline.STYLE_LINE, color: color.GREEN});
	spline(0, {title: "zero", offset: 0, type: spline.STYLE_LINE, color: color.RED});
}`,

  'Bollinger Bands (BB)': `const n = input("n", 20);
const displace = input("displace", 0);
const numDevUp = input("numDevUp", 2);
const numDevDown = input("numDevDown", -2);

function standardDeviation(x, n) {
	const s = ta.sum(x, n);
	const ss = sumOfSquares(x, n);
	return Math.sqrt((ss - s * s / n) / (n));
}

function sumOfSquares(x, n) {
	if (isNaN(x[n - 1])) {
		return NaN;
	}
	let s = 0;
	for (let i = 0; i < n; ++i) {
		const last = x[i];
		s += last * last;
	}
	return s;
}

function onTick() {
	const c = close;
	const midLineValue = ta.ema(c, n);
	const sd = standardDeviation(c, n);
	spline(midLineValue, {title: "midLine", offset: 0, type: spline.STYLE_LINE, color: color.GREEN});
	spline(midLineValue + numDevUp * sd, {title: "upBand", offset: 0, type: spline.STYLE_LINE, color: color.RED});
	spline(midLineValue + numDevDown * sd, {title: "lowBand", offset: 0, type: spline.STYLE_LINE, color: color.CYAN});
}`,

  'Chande Momentum Oscillator (CMO)': `const n = input("n", 20);

function onTick() {
	const diff = close - close[1];
	const inc = ts(Math.max(diff, 0));
	const dec = ts(Math.max(diff * -1, 0));
	const sumInc = ta.sum(inc, n);
	const sumDec = ta.sum(dec, n);
	// Wrong prefetch;
	spline((sumInc - sumDec) / (sumInc + sumDec) * 100, {title: "CMO", offset: 0, type: spline.STYLE_LINE, color: color.GREEN});
	spline(50, {title: "UpperLevel", offset: 0, type: spline.STYLE_LINE, color: color.RED});
	spline(-50, {title: "LowerLevel", offset: 0, type: spline.STYLE_LINE, color: color.CYAN});
	spline(0, {title: "Zero", offset: 0, type: spline.STYLE_LINE, color: color.BLUE});
}`,

  'Commodity Channel Index (CCI)': `const n = input("n", 14);
const overBought = input("overBought", 100);
const overSold = input("overSold", -100);

function avg(x, n) {
	let sum = 0;
	for (let i = 0; i < n; ++i) {
		sum += x[i];
	}
	return sum / n;
}

function linerDev(x, n) {
	if (isNaN(x[n - 1])) {
		return NaN;
	}

	const average = avg(x, n);

	let sumDiff = 0.0;
	for (let i = 0; i < n; ++i) {
		sumDiff += Math.abs(x[i] - average);
	}
	return sumDiff / n;
}

function onTick() {
	const x = ts(high + low + close);
	const ld = linerDev(x, n);
	spline((x - ta.sma(x, n)) / ld / 0.015, {title: "cci", offset: 0, type: spline.STYLE_LINE, color: color.GREEN});
	spline(overBought, {title: "OverBought", offset: 0, type: spline.STYLE_LINE, color: color.RED});
	spline(overSold, {title: "OverSold", offset: 0, type: spline.STYLE_LINE, color: color.CYAN});
	spline(0, {title: "Zero", offset: 0, type: spline.STYLE_LINE, color: color.BLUE});
}`,

  'Double Exponential Moving Average': `const n = input("n", 9);
function onTick() {
	const c = close;
	const ema1 = ta.ema(c, n);
	const ema2 = ta.ema(ema1, n);
	spline(2 * ema1 - ema2, {title: "dema", offset: 0, type: spline.STYLE_LINE, color: color.GREEN});
}`,

  'Exponential Moving Average (EMA)': `const n = input("n", 9);

function onTick() {
	spline(ta.ema(close, n), {title: "ema", offset: 0, type: spline.STYLE_LINE, color: color.GREEN});
}`,

  'Mass Index': `const n = input("n", 9);
const sumLength = input("sumLength", 25);
const triggerLevel = input("triggerLevel", 26.5);
const setupLevel = input("setupLevel", 27);

function onTick() {
	const diff = ts(high - low);
	const emaDiff1 = ta.ema(diff, n);
	const emaEmaDiff = ta.ema(emaDiff1, n);
	const emaEmaCoef = ts(emaDiff1 / emaEmaDiff);

	spline(ta.sum(emaEmaCoef, sumLength), {title: "mi", offset: 0, type: spline.STYLE_LINE, color: color.GREEN});
	spline(triggerLevel, {title: "trigger", offset: 0, type: spline.STYLE_LINE, color: color.RED});
	spline(setupLevel, {title: "setup", offset: 0, type: spline.STYLE_LINE, color: color.CYAN});
}`,

  'Momentum': `const n = input("n", 12);
function onTick() {
	spline(close - close[n], {title: "momentum", offset: 0, type: spline.STYLE_LINE, color: color.GREEN});
}`,

  'Money Flow (MFI)': `const n = input("n", 14);
const overBought = input("overBought", 80);
const overSold = input("overSold", 20);

function onTick() {
	const tp = ts((high + low + close) / 3);
	const tpPrev = ts((high[1]+ low[1] + close[1]) / 3);
	const positiveMoneyFlow = ts((tp > tpPrev) ? tp * volume : 0);
	const negativeMoneyFlow = ts((tp < tpPrev) ? tp * volume : 0);
	const sumPositiveMoneyFlow = ta.sum(positiveMoneyFlow, n);
	const sumNegativeMoneyFlow = ta.sum(negativeMoneyFlow, n);
	spline(100 - (100 / (1 + sumPositiveMoneyFlow / sumNegativeMoneyFlow)), {title: "MFidx", offset: 0, type: spline.STYLE_LINE, color: color.GREEN});
	spline(overBought, {title: "OverBought", offset: 0, type: spline.STYLE_LINE, color: color.RED});
	spline(overSold, {title: "OverSold", offset: 0, type: spline.STYLE_LINE, color: color.CYAN});
}`,

  'Moving Average Convergence Divergence (MACD)': `const fastLen = input("fastLen", 12);
const slowLen = input("slowLen", 26);
const macdLen = input("macdLen", 9);

function onTick() {
	const series = close;
	const MACD = ts(ta.ema(series, fastLen) - ta.ema(series, slowLen));
	const avg = ta.ema(MACD, macdLen);
	spline(MACD, {title: "MACD", offset: 0, type: spline.STYLE_LINE, color: color.GREEN});
	spline(avg, {title: "avg", offset: 0, type: spline.STYLE_LINE, color: color.RED});
	spline(MACD - avg, {title: "diff", offset: 0, type: spline.STYLE_LINE, color: color.CYAN});
}`,

  'On Balance Volume (OBV)': `function onTick() {
	const diff = close - close[1];
	const v = ts((diff > 0) ? volume : ((diff < 0) ? -volume : 0));
	spline(ta.cum(v), {title: "obv", offset: 0, type: spline.STYLE_LINE, color: color.GREEN});
}`,

  'Price Oscillator': `const fastLen = input("fastLen", 9);
const slowLen = input("slowLen", 18);

function onTick() {
	const emaFast = ta.ema(close, fastLen);
	const emaSlow = ta.ema(close, slowLen);

	spline(emaFast - emaSlow, {title: "PercentagePriceOscillator", offset: 0, type: spline.STYLE_LINE, color: color.GREEN});
	spline(0, {title: "Zero", offset: 0, type: spline.STYLE_LINE, color: color.RED});
}`,

  'Price Volume Trend (PVT)': `function onTick() {
	const prevClose = close[1];
	const currentClose = close;
	const v = ts((currentClose - prevClose) / prevClose * volume);
	spline(ta.cum(v), {title: "pvt", offset: 0, type: spline.STYLE_LINE, color: color.GREEN});
}`,

  'Rate of Change (ROC)': `const n = input("n", 12);
function onTick() {
	const prevClose = close[n];
	const currentClose = close;
	spline(((currentClose - prevClose) / prevClose) * 100, {title: "roc", offset: 0, type: spline.STYLE_LINE, color: color.GREEN});
	spline(0, {title: "zero", offset: 0, type: spline.STYLE_LINE, color: color.RED});
}`,

  'Relative Strength Index (RSI)': `const n = input("n", 14);
const overBought = input("overBought", 70);
const overSold = input("overSold", 30);

function onTick() {
	const curr = close;
	const prev = close[1];
	const net = ts(curr - prev);
	const total = ts(Math.abs(prev - curr));
	const averageNet = ta.wima(net, n);
	const averageTotal = ta.wima(total, n);
	spline(50 * (1 + averageNet / averageTotal), {title: "RSI", offset: 0, type: spline.STYLE_LINE, color: color.GREEN});
	spline(overBought, {title: "overBought", offset: 0, type: spline.STYLE_LINE, color: color.RED});
	spline(overSold, {title: "overSold", offset: 0, type: spline.STYLE_LINE, color: color.CYAN});
}`,

  'Relative Vigor Index (RVI)': `function onTick() {
	const nominator = close - open;
	const denominator = high - low;
	spline(nominator / denominator, {title: "rvi", offset: 0, type: spline.STYLE_LINE, color: color.GREEN});
}`,

  'Simple Moving Average': `const n = input("n", 9);

function onTick() {
	spline(ta.sma(open, n), {title: "sma", offset: 0, type: spline.STYLE_LINE, color: color.GREEN});
}`,

  'Smoothed Moving Average': `const n = input("n", 9);

function onTick() {
	spline(ta.wima(close, n), {title: "SMMA", offset: 0, type: spline.STYLE_LINE, color: color.GREEN});
}`,

  'Triple Exponential Average (TRIX)': `const n = input("n", 9);

function trix(x, n) {
	const ema1 = ta.ema(x, n);
	const ema2 = ta.ema(ema1, n);
	return ta.ema(ema2, n);
}

function onTick() {
	const logPrice = ts(Math.log(close));
	const logPrevPrice = ts(Math.log(close[1]));

	const triple = trix(logPrice, n);
	const triplePrev = trix(logPrevPrice, n);

	spline((triple - triplePrev) * 10000, {title: "TRIX", offset: 0, type: spline.STYLE_LINE, color: color.GREEN});
}`,

  'Triple Exponential Moving Average (TEMA)': `const n = input("n", 9);

function onTick() {
	const series = close;
	const ema1 = ta.ema(series, n);
	const ema2 = ta.ema(ema1, n);
	const ema3 = ta.ema(ema2, n);

	spline(3 * ema1 - 3 * ema2 + ema3, {title: "tema", offset: 0, type: spline.STYLE_LINE, color: color.GREEN});
}`,

  'True Strength Index (TSI)': `const longLength = input("longLength", 25);
const shortLength = input("shortLength", 13);
const signalLength = input("signalLength", 8);

function doubleEma(x, longLength, shortLength) {
	const ema1 = ta.ema(x, longLength);
	return ta.ema(ema1, shortLength);
}

function onTick() {
	const momentum = ts(close - close[1]);
	const averageOfAverage = doubleEma(momentum, longLength, shortLength);

	const absMomentum = ts(Math.abs(momentum));
	const absEmaEma = doubleEma(absMomentum, longLength, shortLength);

	const tsi = ts(averageOfAverage / absEmaEma * 100);
	spline(tsi, {title: "tsi", offset: 0, type: spline.STYLE_LINE, color: color.GREEN});
	spline(ta.ema(tsi, signalLength), {title: "signal", offset: 0, type: spline.STYLE_LINE, color: color.RED});
	spline(0, {title: "zero", offset: 0, type: spline.STYLE_LINE, color: color.CYAN});
}`,

  'Williams Alligator': `const jawLen = input("jawLen", 13);
const jawDisplace = input("jawDisplace", 8);
const teethLen = input("teethLen", 8);
const teethDisplace = input("teethDisplace", 5);
const lipsLen = input("lipsLen", 5);
const lipsDisplace = input("lipsDisplace", 3);

function onTick() {
	const median = ts((high + low) / 2);
	const lips = ta.wima(median, lipsLen);
	const teeth = ta.wima(median, teethLen);
	const jaw = ta.wima(median, jawLen);
	spline(lips[lipsDisplace], {title: "Lips", offset: 0, type: spline.STYLE_LINE, color: color.GREEN});
	spline(teeth[teethDisplace], {title: "Teeth", offset: 0, type: spline.STYLE_LINE, color: color.RED});
	spline(jaw[jawDisplace], {title: "Jaw", offset: 0, type: spline.STYLE_LINE, color: color.CYAN});
}`,

  'Weighted Moving Average': `const n = input("n", 9);

function onTick() {
	spline(ta.wma(open, n), {title: "wma", offset: 0, type: spline.STYLE_LINE, color: color.GREEN});
}`,

  'Pivot Low': `const left = input("left", 3);
const right = input("right", 2);

function onTick() {
	let pivotL = ta.pivotLow(close, left, right);
	spline(pivotL, {title: "pivotLow", offset: 0, type: spline.STYLE_LINE, color: color.GREEN});
}`,

  'Pivot High': `const left = input("left", 3);
const right = input("right", 2);

function onTick() {
	let pivotH = ta.pivotHigh(close, left, right);
	spline(pivotH, {title: "pivotHigh", offset: 0, type: spline.STYLE_LINE, color: color.GREEN});
}`
}

// Exporting the indicators for use in the application;
window['INDICHART_INDICATROS'] = {
  js: INDICHART_JS_INDICATORS,
}
window['INDICHART_INDICATOR_EXAMPLES'] = [
  {
	id: 'Accumulation Distribution (ADL)',
	docUrl: 'https://devexperts.com/dxcharts/kb/docs/accumulationdistribution',
  },
  {
	id: 'Aroon',
	docUrl: 'https://devexperts.com/dxcharts/kb/docs/aroon-indicator',
  },
  {
	id: 'Average True Range (ATR)',
	docUrl: 'https://devexperts.com/dxcharts/kb/docs/average-true-range-atr',
  },
  {
	id: 'Awesome Oscillator (AO)',
	docUrl: 'https://devexperts.com/dxcharts/kb/docs/awesome-oscillator-ao',
  },
  {
	id: 'Bollinger Bands (BB)',
	docUrl: 'https://devexperts.com/dxcharts/kb/docs/bollinger-bands',
  },
  {
	id: 'Chande Momentum Oscillator (CMO)',
	docUrl: 'https://devexperts.com/dxcharts/kb/docs/chandle-momentum-oscillator',
  },
  {
	id: 'Commodity Channel Index (CCI)',
	docUrl: 'https://devexperts.com/dxcharts/kb/docs/commodity-channel-index',
  },
  {
	id: 'Double Exponential Moving Average',
	docUrl: 'https://devexperts.com/dxcharts/kb/docs/double-exponential-moving-average',
  },
  {
	id: 'Exponential Moving Average (EMA)',
	docUrl: 'https://devexperts.com/dxcharts/kb/docs/exponential-moving-average-ema',
  },
  {
	id: 'Mass Index',
	docUrl: 'https://devexperts.com/dxcharts/kb/docs/mass-index',
  },
  {
	id: 'Momentum',
	docUrl: 'https://devexperts.com/dxcharts/kb/docs/momentum',
  },
  {
	id: 'Money Flow (MFI)',
	docUrl: 'https://devexperts.com/dxcharts/kb/docs/money-flow-index-mfi',
  },
  {
	id: 'Moving Average Convergence Divergence (MACD)',
	docUrl: 'https://devexperts.com/dxcharts/kb/docs/moving-average-convergence-divergence-macd',
  },
  {
	id: 'On Balance Volume (OBV)',
	docUrl: 'https://devexperts.com/dxcharts/kb/docs/on-balance-volume',
  },
  {
	id: 'Price Oscillator',
	docUrl: 'https://devexperts.com/dxcharts/kb/docs/price-oscillator',
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
	id: 'Relative Strength Index (RSI)',
	docUrl: 'https://devexperts.com/dxcharts/kb/docs/relative-strength-index-rsi',
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
	id: 'Triple Exponential Average (TRIX)',
	docUrl: 'https://devexperts.com/dxcharts/kb/docs/triple-exponential-average',
  },
  {
	id: 'Triple Exponential Moving Average (TEMA)',
	docUrl: 'https://devexperts.com/dxcharts/kb/docs/triple-exponential-moving-average',
  },
  {
	id: 'True Strength Index (TSI)',
	docUrl: 'https://devexperts.com/dxcharts/kb/docs/true-strength-index',
  },
  {
	id: 'Williams Alligator',
	docUrl: 'https://devexperts.com/dxcharts/kb/docs/williams-alligator',
  },
  {
	id: 'Weighted Moving Average',
	docUrl: 'https://devexperts.com/dxcharts/kb/docs/weighted-moving-average-wma',
  },
  {
	id: 'Pivot Low',
	docUrl: 'https://devexperts.com/dxcharts/kb/docs/pivot-points',
  },
  {
	id: 'Pivot High',
	docUrl: 'https://devexperts.com/dxcharts/kb/docs/pivot-points',
  },
];
