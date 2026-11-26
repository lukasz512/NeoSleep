/** "maria.lopez@example.mx" → "m***@example.mx" — enough for staff to recognise the address, nothing more in logs or toasts. */
export function maskEmail(email: string): string {
  const [local = "", domain] = email.split("@");
  return domain ? `${local.slice(0, 1)}***@${domain}` : "***";
}
