// api/_lib/indicators.js

export function ema(values, length) {
  const out = new Array(values.length).fill(null);
  if (!values.length || length <= 1) return out;

  const k = 2 / (length + 1);
  let prev = null;

  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null || !Number.isFinite(v)) {
      out[i] = null;
      continue;
    }
    if (prev == null) {
      prev = v;
    } else {
      prev = v * k + prev * (1 - k);
    }
    out[i] = prev;
  }

  return out;
}

export function median(arr) {
  const a = arr.filter((x) => Number.isFinite(x)).slice().sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = Math.floor(a.length / 2);
  if (a.length % 2 === 1) return a[mid];
  return (a[mid - 1] + a[mid]) / 2;
}

export function mad(arr, med) {
  if (med == null) return null;
  const dev = arr
    .filter((x) => Number.isFinite(x))
    .map((x) => Math.abs(x - med));
  return median(dev);
}

/**
 * Robust z-score using rolling Median + MAD
 * z = (x - median) / (1.4826 * MAD)
 */
export function rollingRobustZ(values, window) {
  const out = new Array(values.length).fill(null);
  const scaleConst = 1.4826;

  for (let i = 0; i < values.length; i++) {
    if (i < window - 1) continue;

    const slice = values.slice(i - window + 1, i + 1);
    const med = median(slice);
    const m = mad(slice, med);

    if (med == null || m == null || m === 0) {
      out[i] = null;
      continue;
    }

    const x = values[i];
    if (!Number.isFinite(x)) {
      out[i] = null;
      continue;
    }

    out[i] = (x - med) / (scaleConst * m);
  }

  return out;
}