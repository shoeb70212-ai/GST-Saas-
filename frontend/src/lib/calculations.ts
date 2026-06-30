/**
 * Sunk GST = GST component of the unpaid portion of the invoice.
 * The supplier already paid this full GST to the govt on filing.
 * It's a permanent cash loss unless the buyer pays.
 */
export function calculateSunkGST(invoiceValueExGst: number, gstRate: number, amountPaid: number, totalInvoice: number): number {
  if (totalInvoice <= 0) return 0;
  const gstAmount = invoiceValueExGst * (gstRate / 100);
  const outstanding = totalInvoice - amountPaid;
  const proportionOutstanding = outstanding / totalInvoice;
  return Math.round((gstAmount * proportionOutstanding) * 100) / 100;
}

/**
 * MSMED Act Section 16: Compound interest, monthly rests, at 3× RBI Bank Rate.
 * Formula: A = P × (1 + r/12)^n
 * Where r = 3 × (rbiBankRate/100) and n = months overdue
 */
export function calculateMsmedInterest(principal: number, rbiBankRate: number, daysOverdueFromMsmedDue: number): number {
  if (daysOverdueFromMsmedDue <= 0 || principal <= 0) {
    return 0;
  }
  
  const annualRate = 3 * (rbiBankRate / 100); // e.g., 3 × 0.065 = 0.195
  const monthsOverdue = daysOverdueFromMsmedDue / 30.44; // average month length
  
  // Compound interest with monthly rests
  const amountWithInterest = principal * Math.pow(1 + (annualRate / 12), monthsOverdue);
  const interest = amountWithInterest - principal;
  return Math.round(interest * 100) / 100;
}

/**
 * The ITC the buyer has availed on this invoice.
 * If they haven't paid within 180 days, this exact amount must be reversed
 * PLUS 18% interest on it. This is the number we threaten them with.
 */
export function calculateRule37ItcAtRisk(gstAmount: number, amountPaid: number, totalInvoice: number, daysOverdue: number = 0): { principal: number, interest: number } {
  if (totalInvoice <= 0) return { principal: 0, interest: 0 };
  const outstanding = totalInvoice - amountPaid;
  const proportionOutstanding = outstanding / totalInvoice;
  const principal = Math.round((gstAmount * proportionOutstanding) * 100) / 100;
  
  // Section 50 CGST Act: 18% p.a. interest on reversed ITC
  const interest = Math.round((principal * 0.18 * (Math.max(0, daysOverdue) / 365)) * 100) / 100;
  
  return { principal, interest };
}
