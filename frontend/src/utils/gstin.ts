export function isValidGSTIN(gstin: string | null | undefined): boolean {
  if (!gstin) return false;
  // Format: 2 digits (State Code) + 5 letters (PAN part 1) + 4 digits (PAN part 2) + 1 letter (PAN part 3) + 1 alphanumeric (Entity Number) + 'Z' (Default) + 1 alphanumeric (Checksum)
  const regex = /^[0-3][0-9][A-Z]{5}[0-9]{4}[A-Z][1-9A-Z][Z][0-9A-Z]$/;
  return regex.test(gstin.trim().toUpperCase());
}
