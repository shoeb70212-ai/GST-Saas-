/**
 * Frontend pricing / credit-cost source of truth.
 *
 * Keep pack amounts aligned with `backend/credits.py` → `CREDIT_PACKS`.
 * Keep per-task display costs aligned with the constants in that same module
 * (INVOICE_SCAN, BANK_BASE, DEEP_MATCH_BASE, etc.).
 */

export type PlanType = 'starter' | 'pro';

export interface CreditPack {
  id: number;
  type: PlanType;
  name: string;
  /** Short marketing label (Landing / Pricing cards) */
  shortName: string;
  credits: number;
  /** INR rupees (not paise) */
  priceInr: number;
  popular: boolean;
  /** Optional bullet highlights for Pricing page */
  highlights: string[];
}

/** Display costs for AI tasks — mirrors backend/credits.py base costs. */
export const CREDIT_COSTS = {
  invoiceScan: 1,
  publicUpload: 1,
  whatsappReceipt: 1,
  bankStatementBase: 2,
  deepMatchBase: 5,
  tallyConverterBase: 2,
} as const;

/**
 * Wallet recharge packs. Server enforces the same catalog on create-order;
 * never trust client-supplied amount/credits for fulfillment.
 */
export const CREDIT_PACKS: CreditPack[] = [
  {
    id: 1,
    type: 'starter',
    name: 'Starter Pass',
    shortName: 'Starter',
    credits: 1000,
    priceInr: 2499,
    popular: false,
    highlights: ['Valid indefinitely'],
  },
  {
    id: 2,
    type: 'pro',
    name: 'Pro Pass',
    shortName: 'Pro',
    credits: 5000,
    priceInr: 7999,
    popular: true,
    highlights: ['Priority Support', 'Access to AI Deep Match'],
  },
];

/** Brand accent for third-party SDKs (Razorpay theme) — match `--accent` light. */
export const BRAND_ACCENT_HEX = '#B56A3A';

export function formatInr(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

/** Approximate rupees per credit for marketing copy (e.g. "~₹2.50 per task"). */
export function perCreditInr(pack: Pick<CreditPack, 'priceInr' | 'credits'>): string {
  const value = pack.priceInr / pack.credits;
  return `~₹${value.toFixed(2)} per task`;
}

export function creditLabel(n: number): string {
  return n === 1 ? '1 Credit' : `${n} Credits`;
}

export function getPackByType(type: PlanType): CreditPack | undefined {
  return CREDIT_PACKS.find((p) => p.type === type);
}
