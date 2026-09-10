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