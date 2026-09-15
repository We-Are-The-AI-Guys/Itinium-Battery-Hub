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

export function calculateNetProfit(wasteInvoiceValue: string, customerInvoiceValue: string): string {
  return ((parseFloat(wasteInvoiceValue) || 0) - (parseFloat(customerInvoiceValue) || 0)).toFixed(2);
}