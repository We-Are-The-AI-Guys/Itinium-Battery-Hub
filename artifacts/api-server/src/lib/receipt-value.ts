export function calculateReceiptValueGbp(
  pbContentKg: string | number | null,
  lmeGbpRate: string | number | null,
  customerLmePercent: string | number | null
): string | null {
  if (pbContentKg === null || lmeGbpRate === null) return null;
  const pb = Number(pbContentKg);
  const rate = Number(lmeGbpRate);
  const percent = customerLmePercent === null ? 0 : Number(customerLmePercent);
  if (![pb, rate, percent].every(Number.isFinite)) return null;
  return ((pb * rate * percent) / 100_000).toFixed(2);
}

export function resolveCustomerLmePercent(
  customerTractionPercent: string | number | null,
  legacyCustomerLmePercent: string | number | null
): string | number | null {
  return customerTractionPercent ?? legacyCustomerLmePercent;
}

export function resolvePreviousReceiptLmeRate(
  explicitJobRate: string | number | null,
  historicalJobRate: string | number | null,
  latestRate: string | number | null
): string | number | null {
  return explicitJobRate ?? historicalJobRate ?? latestRate;
}

export function isAutomaticReceiptValue(
  savedValue: string | number | null,
  pbContentKg: string | number | null,
  previousLmeGbpRate: string | number | null,
  previousCustomerLmePercent: string | number | null
): boolean {
  if (savedValue === null || Number(savedValue) === 0) return true;
  const automaticValue = calculateReceiptValueGbp(
    pbContentKg,
    previousLmeGbpRate,
    previousCustomerLmePercent
  );
  const legacyGrossValue = calculateReceiptValueGbp(
    pbContentKg,
    previousLmeGbpRate,
    100
  );
  return [automaticValue, legacyGrossValue].some(
    (candidate) => candidate !== null && Number(candidate) === Number(savedValue)
  );
}