/**
 * Contact details given by Łukasz on 2026-09-28. WhatsApp is a Mexico City mobile (+52 55); the Spanish
 * mobile (+34) was added on 2026-09-29.
 */
export const CONTACT = {
  email: "aj@alfredjan.com",
  whatsapp: "525517458958",
  whatsappDisplay: "+52 55 1745 8958",
  phoneEs: "34674039138",
  phoneEsDisplay: "+34 674 03 91 38",
  instagram: "alfredjan",
  linkedin: "https://www.linkedin.com/in/alfredjan/",
} as const;

export function whatsappLink(message: string): string {
  return `https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(message)}`;
}

/** A tel: link in international form, so it dials from any country. */
export function telLink(digits: string): string {
  return `tel:+${digits}`;
}

/** Order of the contact rows (two columns): email, Instagram · phone Spain, phone Mexico · LinkedIn. */
export const CHANNEL_ORDER = ["email", "instagram", "phoneEs", "whatsapp", "linkedin"] as const;
export type Channel = (typeof CHANNEL_ORDER)[number];
