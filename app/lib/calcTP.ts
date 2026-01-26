type TPResult = {
  tpPercent: number
  tpPrice: number
  horizon: string
}

export function calcBullTP(
  price: number,
  score: number
): TPResult {

  // Swing / position TP’s (week → maand)
  let baseTp = 0.08   // 8% default

  if (score >= 85) baseTp = 0.40     // 40%
  else if (score >= 80) baseTp = 0.25 // 25%
  else if (score >= 75) baseTp = 0.18 // 18%
  else if (score >= 70) baseTp = 0.12 // 12%
  else baseTp = 0.06                  // 6%

  // Veilig: iets vóór target
  const tpPrice = price * (1 + baseTp * 0.97)

  let horizon = "1–4 weken"
  if (score >= 85) horizon = "2–6 weken"
  if (score >= 80 && score < 85) horizon = "1–3 weken"

  return {
    tpPercent: +(baseTp * 100).toFixed(1),
    tpPrice: +tpPrice.toFixed(6),
    horizon,
  }
}

export function calcBearTP(
  price: number,
  score: number
): TPResult {

  let baseTp = 0.08

  if (score >= 85) baseTp = 0.35
  else if (score >= 80) baseTp = 0.22
  else if (score >= 75) baseTp = 0.15
  else if (score >= 70) baseTp = 0.10
  else baseTp = 0.05

  const tpPrice = price * (1 - baseTp * 0.97)

  let horizon = "1–4 weken"
  if (score >= 85) horizon = "2–6 weken"
  if (score >= 80 && score < 85) horizon = "1–3 weken"

  return {
    tpPercent: +(baseTp * 100).toFixed(1),
    tpPrice: +tpPrice.toFixed(6),
    horizon,
  }
}
