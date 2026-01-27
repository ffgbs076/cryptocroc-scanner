// app/lib/orderbookWeights.ts
// VEILIG: geen gereserveerde woorden

export const WEIGHTS = {
  confirmation: 0.25,
  conflict: -0.25,
  neutral: 0
};

export function scoreOrderbook(
  bidsStrength: number,
  asksStrength: number
) {
  if (bidsStrength > asksStrength) {
    return WEIGHTS.confirmation;
  }

  if (asksStrength > bidsStrength) {
    return WEIGHTS.conflict;
  }

  return WEIGHTS.neutral;
}
