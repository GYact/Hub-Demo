/** Exponential Moving Average */
export const calcEMA = (data: number[], period: number): number[] => {
  const result: number[] = [];
  const k = 2 / (period + 1);
  let ema = data[0];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      ema = data.slice(0, i + 1).reduce((a, b) => a + b, 0) / (i + 1);
      result.push(ema);
    } else if (i === period - 1) {
      ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
      result.push(ema);
    } else {
      ema = data[i] * k + ema * (1 - k);
      result.push(ema);
    }
  }
  return result;
};

/** Simple Moving Average */
export const calcSMA = (data: number[], period: number): (number | null)[] => {
  return data.map((_, i) => {
    if (i < period - 1) return null;
    const slice = data.slice(i - period + 1, i + 1);
    return slice.reduce((sum, v) => sum + v, 0) / period;
  });
};

/** Relative Strength Index (Wilder's smoothing) */
export const calcRSI = (data: number[], period = 14): (number | null)[] => {
  const result: (number | null)[] = [];
  if (data.length < period + 1) {
    return data.map(() => null);
  }

  let avgGain = 0;
  let avgLoss = 0;

  // Initial average gain/loss
  for (let i = 1; i <= period; i++) {
    const diff = data[i] - data[i - 1];
    if (diff > 0) avgGain += diff;
    else avgLoss += Math.abs(diff);
  }
  avgGain /= period;
  avgLoss /= period;

  // Fill first period entries with null
  for (let i = 0; i <= period; i++) {
    if (i < period) {
      result.push(null);
    } else {
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      result.push(100 - 100 / (1 + rs));
    }
  }

  // Subsequent values using Wilder's smoothing
  for (let i = period + 1; i < data.length; i++) {
    const diff = data[i] - data[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push(100 - 100 / (1 + rs));
  }

  return result;
};

/** MACD (Moving Average Convergence Divergence) */
export const calcMACD = (
  data: number[],
  fast = 12,
  slow = 26,
  signal = 9,
): {
  macd: (number | null)[];
  signal: (number | null)[];
  histogram: (number | null)[];
} => {
  if (data.length < slow) {
    return {
      macd: data.map(() => null),
      signal: data.map(() => null),
      histogram: data.map(() => null),
    };
  }

  const fastEMA = calcEMA(data, fast);
  const slowEMA = calcEMA(data, slow);

  const macdLine: (number | null)[] = data.map((_, i) => {
    if (i < slow - 1) return null;
    return fastEMA[i] - slowEMA[i];
  });

  // Signal line: EMA of non-null MACD values
  const macdValues = macdLine.filter((v): v is number => v !== null);
  const signalEMA = calcEMA(macdValues, signal);

  const signalLine: (number | null)[] = [];
  const histogramLine: (number | null)[] = [];
  let macdIdx = 0;

  for (let i = 0; i < data.length; i++) {
    const m = macdLine[i];
    if (m === null) {
      signalLine.push(null);
      histogramLine.push(null);
    } else {
      const s = signalEMA[macdIdx] ?? null;
      signalLine.push(s);
      histogramLine.push(s !== null ? m - s : null);
      macdIdx++;
    }
  }

  return { macd: macdLine, signal: signalLine, histogram: histogramLine };
};

/** Bollinger Bands (SMA ± k×σ) */
export const calcBollingerBands = (
  data: number[],
  period = 20,
  k = 2,
): {
  upper: (number | null)[];
  middle: (number | null)[];
  lower: (number | null)[];
} => {
  const middle = calcSMA(data, period);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];

  for (let i = 0; i < data.length; i++) {
    const m = middle[i];
    if (m === null || i < period - 1) {
      upper.push(null);
      lower.push(null);
    } else {
      const slice = data.slice(i - period + 1, i + 1);
      const variance = slice.reduce((sum, v) => sum + (v - m) ** 2, 0) / period;
      const std = Math.sqrt(variance);
      upper.push(m + k * std);
      lower.push(m - k * std);
    }
  }

  return { upper, middle, lower };
};

/** Average True Range */
export const calcATR = (
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14,
): (number | null)[] => {
  if (highs.length < 2) return highs.map(() => null);

  const trueRanges: number[] = [highs[0] - lows[0]];
  for (let i = 1; i < highs.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1]),
    );
    trueRanges.push(tr);
  }

  const result: (number | null)[] = [];
  for (let i = 0; i < trueRanges.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else if (i === period - 1) {
      result.push(
        trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period,
      );
    } else {
      const prev = result[i - 1] as number;
      result.push((prev * (period - 1) + trueRanges[i]) / period);
    }
  }
  return result;
};
