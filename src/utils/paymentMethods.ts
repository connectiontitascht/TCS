export type PaymentMethodKey =
  | 'cash'
  | 'bkash'
  | 'nagad'
  | 'bkash_p'
  | 'nagad_p'
  | 'bank'
  | 'sslcommerz';

export interface PaymentMethodMeta {
  key: PaymentMethodKey;
  value: string;
  label: string;
  emoji: string;
}

export const PAYMENT_METHODS: PaymentMethodMeta[] = [
  { key: 'cash', value: 'Cash', label: 'Cash', emoji: '💵' },
  { key: 'bkash', value: 'bKash Merchant', label: 'bKash Merchant', emoji: '📱' },
  { key: 'nagad', value: 'Nagad Merchant', label: 'Nagad Merchant', emoji: '📱' },
  { key: 'bkash_p', value: 'bKash (P)', label: 'bKash (P)', emoji: '📱' },
  { key: 'nagad_p', value: 'Nagad (P)', label: 'Nagad (P)', emoji: '📱' },
  { key: 'bank', value: 'Bank', label: 'Bank', emoji: '🏦' },
  { key: 'sslcommerz', value: 'SSL Commerz', label: 'SSL Commerz', emoji: '💳' },
];

const PAYMENT_METHOD_META_MAP: Record<PaymentMethodKey, PaymentMethodMeta> = PAYMENT_METHODS.reduce(
  (acc, item) => {
    acc[item.key] = item;
    return acc;
  },
  {} as Record<PaymentMethodKey, PaymentMethodMeta>
);

export function normalizePaymentMethodKey(method?: string | null): PaymentMethodKey {
  const pm = (method || '').trim().toLowerCase();
  if (!pm || pm === 'cash') return 'cash';
  if (
    pm === 'bkash (p)' ||
    pm === 'bkash(p)' ||
    pm === 'bkash_p' ||
    pm === 'bkash p' ||
    pm === 'rocket'
  ) {
    return 'bkash_p';
  }
  if (
    pm === 'nagad (p)' ||
    pm === 'nagad(p)' ||
    pm === 'nagad_p' ||
    pm === 'nagad p'
  ) {
    return 'nagad_p';
  }
  if (pm === 'bkash' || pm === 'bkash merchant' || pm === 'bkash_merchant') {
    return 'bkash';
  }
  if (pm === 'nagad' || pm === 'nagad merchant' || pm === 'nagad_merchant') {
    return 'nagad';
  }
  if (pm === 'bank' || pm === 'bank transfer' || pm === 'bank_transfer') {
    return 'bank';
  }
  if (pm === 'sslcommerz' || pm === 'ssl commerz' || pm === 'ssl') {
    return 'sslcommerz';
  }
  return 'cash';
}

export function isKnownPaymentMethod(method?: string | null): boolean {
  const pm = (method || '').trim().toLowerCase();
  if (!pm) return false;
  return [
    'cash',
    'bkash',
    'bkash merchant',
    'bkash_merchant',
    'nagad',
    'nagad merchant',
    'nagad_merchant',
    'bkash (p)',
    'bkash(p)',
    'bkash_p',
    'bkash p',
    'rocket',
    'nagad (p)',
    'nagad(p)',
    'nagad_p',
    'nagad p',
    'bank',
    'bank transfer',
    'bank_transfer',
    'sslcommerz',
    'ssl commerz',
    'ssl',
  ].includes(pm);
}

export function getPaymentMethodLabel(method?: string | null, preserveUnknown = false): string {
  if (!method || !method.trim()) return 'Cash';
  if (preserveUnknown && !isKnownPaymentMethod(method)) {
    return method.trim();
  }
  const key = normalizePaymentMethodKey(method);
  return PAYMENT_METHOD_META_MAP[key].label;
}

export function getPaymentMethodValue(method?: string | null): string {
  if (!method || !method.trim()) return 'Cash';
  const key = normalizePaymentMethodKey(method);
  return PAYMENT_METHOD_META_MAP[key].value;
}
