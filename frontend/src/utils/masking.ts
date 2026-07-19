export function maskPAN(pan: string | null | undefined): string {
  if (!pan || pan.length < 6) return pan || '';
  // PAN format is typically 10 characters. Mask all but last 4: XXXXXX1234
  return 'X'.repeat(pan.length - 4) + pan.slice(-4);
}

export function maskBankAccount(account: string | null | undefined): string {
  if (!account || account.length < 4) return account || '';
  // Mask all but last 4 digits
  const masked = '*'.repeat(account.length - 4);
  const visible = account.slice(-4);
  return masked + visible;
}

export function maskPhone(phone: string | null | undefined): string {
  if (!phone || phone.length < 4) return phone || '';
  const masked = '*'.repeat(phone.length - 4);
  const visible = phone.slice(-4);
  return masked + visible;
}

export function maskEmail(email: string | null | undefined): string {
  if (!email || !email.includes('@')) return email || '';
  const [local, domain] = email.split('@');
  if (local.length <= 2) return email;
  return local.slice(0, 2) + '*'.repeat(local.length - 2) + '@' + domain;
}
