export function calculateCblLmeValue(
  tonnage: string,
  lmeRate: string,
  lmePercent: string
): string {
  const tonnageValue = parseFloat(tonnage) || 0;
  const rateValue = parseFloat(lmeRate) || 0;
  const percentValue = parseFloat(lmePercent) || 0;
  return (tonnageValue * rateValue * (percentValue / 100)).toFixed(2);
}

export function calculateGrossProfit(
  totalInvoiceValue: string,
  transportCost: string,
  cblLmeValue: string
): string {
  const invoiceValue = parseFloat(totalInvoiceValue) || 0;
  const transportValue = parseFloat(transportCost) || 0;
  const cblValue = parseFloat(cblLmeValue) || 0;
  return (invoiceValue - transportValue - cblValue).toFixed(2);
}

export function calculateCustomerLmeValue(
  netPbWeightKg: number,
  lmeRate: string,
  lmePercent: string
): string {
  const weightTonnes = (isFinite(netPbWeightKg) ? netPbWeightKg : 0) / 1000;
  const rateValue = parseFloat(lmeRate) || 0;
  const percentValue = parseFloat(lmePercent) || 0;
  return (weightTonnes * rateValue * (percentValue / 100)).toFixed(2);
}

export function calculateReceiptValueGbp(
  pbContentKg: number | null,
  lmeGbpRate: number | null,
  customerLmePercent: string | null
): number | null {
  if (pbContentKg === null || lmeGbpRate === null) return null;
  const percent = parseFloat(customerLmePercent || "0");
  if (![pbContentKg, lmeGbpRate, percent].every(Number.isFinite)) return null;
  return (pbContentKg * lmeGbpRate * percent) / 100_000;
}

export type ReceiptTotalRow = {
  receiptConfirmed: boolean | null;
  receiptReviewed: boolean;
  estimatedWeightKg?: string | null;
  pbContentKg: string | null;
  valueGbp: string | null;
};

export function calculateReceivedReceiptTotals(
  rows: readonly ReceiptTotalRow[]
): { weightKg: number; pbKg: number; valueGbp: number } {
  return rows.reduce(
    (totals, row) => {
      if (row.receiptReviewed !== true || row.receiptConfirmed !== true) return totals;
      totals.weightKg += parseFloat(row.estimatedWeightKg || "0") || 0;
      totals.pbKg += parseFloat(row.pbContentKg || "0") || 0;
      totals.valueGbp += parseFloat(row.valueGbp || "0") || 0;
      return totals;
    },
    { weightKg: 0, pbKg: 0, valueGbp: 0 }
  );
}

export function resolveCustomerLmePercent(
  customerTractionPercent: string,
  legacyCustomerLmePercent: string
): string {
  return customerTractionPercent || legacyCustomerLmePercent;
}

export function calculatePercentageRate(baseRate: string, percent: string): string {
  return ((parseFloat(baseRate) || 0) * ((parseFloat(percent) || 0) / 100)).toFixed(2);
}

export function calculateSectionInvoiceValue(
  tractionTonnage: string,
  tractionRate: string,
  blocsTonnage: string,
  blocsRate: string,
  transportCost: string,
  adHocCosts: string
): string {
  const gross =
    (parseFloat(tractionTonnage) || 0) * (parseFloat(tractionRate) || 0) +
    (parseFloat(blocsTonnage) || 0) * (parseFloat(blocsRate) || 0);
  return (gross - (parseFloat(transportCost) || 0) - (parseFloat(adHocCosts) || 0)).toFixed(2);
}

export function calculateCustomerFinanceMasterValues(
  confirmedPbKg: number,
  tractionRate: string,
  blocsTonnage: string,
  blocsRate: string,
  transportCost: string,
  adHocCosts: string
): { tractionTonnage: string; invoiceValue: string } {
  const exactTractionTonnage = (Number.isFinite(confirmedPbKg) ? confirmedPbKg : 0) / 1000;
  return {
    tractionTonnage: exactTractionTonnage.toFixed(3),
    invoiceValue: calculateSectionInvoiceValue(
      String(exactTractionTonnage),
      tractionRate,
      blocsTonnage,
      blocsRate,
      transportCost,
      adHocCosts
    ),
  };
}

export function isCollectionLmeUsable(
  status: "idle" | "loading" | "ready" | "unavailable",
  hasPrice: boolean,
  priceEffectiveDate: string | null,
  savedCollectionDate: string,
  editedCollectionDate: string
): boolean {
  return (
    status === "ready"
    && hasPrice
    && priceEffectiveDate === savedCollectionDate
    && editedCollectionDate === savedCollectionDate
  );
}

export function calculateNetProfit(wasteInvoiceValue: string, customerInvoiceValue: string): string {
  return ((parseFloat(wasteInvoiceValue) || 0) - (parseFloat(customerInvoiceValue) || 0)).toFixed(2);
}