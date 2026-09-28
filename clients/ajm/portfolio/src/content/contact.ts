/** Contact details given by Łukasz on 2026-09-28. WhatsApp is a Mexico City mobile (+52 55). */
export const CONTACT = {
  email: "aj@alfredjan.com",
  whatsapp: "525517458958",
  whatsappDisplay: "+52 55 1745 8958",
  instagram: "alfredjan",
} as const;

export function whatsappLink(message: string): string {
  return `https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(message)}`;
}
