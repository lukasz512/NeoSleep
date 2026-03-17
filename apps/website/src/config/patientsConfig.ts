/**
 * Patients module — testimonials data.
 *
 * White-label note: text lives in i18n files (quoteKey / authorKey / roleKey).
 * Swap this array or fetch from CMS without touching any component.
 */

export interface Testimonial {
  id:       string
  quoteKey: string
  authorKey: string
  roleKey:  string
  rating:   number   // 1–5
  initials: string   // shown in avatar circle
}

export const patientTestimonials: Testimonial[] = [
  {
    id:        't1',
    quoteKey:  'website.patientsPage.testimonials.1.quote',
    authorKey: 'website.patientsPage.testimonials.1.author',
    roleKey:   'website.patientsPage.testimonials.1.role',
    rating:    5,
    initials:  'MK',
  },
  {
    id:        't2',
    quoteKey:  'website.patientsPage.testimonials.2.quote',
    authorKey: 'website.patientsPage.testimonials.2.author',
    roleKey:   'website.patientsPage.testimonials.2.role',
    rating:    5,
    initials:  'PT',
  },
  {
    id:        't3',
    quoteKey:  'website.patientsPage.testimonials.3.quote',
    authorKey: 'website.patientsPage.testimonials.3.author',
    roleKey:   'website.patientsPage.testimonials.3.role',
    rating:    5,
    initials:  'AW',
  },
]
