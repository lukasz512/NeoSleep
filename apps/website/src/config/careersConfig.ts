/**
 * Careers module — job listings data.
 *
 * White-label note: views and data are separate.
 * Swap this file (or fetch from API/CMS) without touching any component.
 *
 * Future: replace static array with GET /api/jobs endpoint.
 */

export type JobType       = 'b2b' | 'full-time' | 'part-time' | 'contract'
export type JobDepartment = 'clinical' | 'tech' | 'operations' | 'marketing'

export interface JobListing {
  id:              string
  titleKey:        string
  departmentKey:   string
  department:      JobDepartment
  descKey:         string
  locationCity:    string
  locationCountry: string
  type:            JobType
  remote:          boolean
  linkedInUrl?:    string
  postedAt:        string   // ISO date
  tags:            string[]
  featured?:       boolean
}

export const jobListings: JobListing[] = [
  {
    id:              'dentist-warsaw-01',
    titleKey:        'careers.jobs.dentistWarsaw.title',
    departmentKey:   'careers.dept.clinical',
    department:      'clinical',
    descKey:         'careers.jobs.dentistWarsaw.desc',
    locationCity:    'Warsaw',
    locationCountry: 'Poland',
    type:            'b2b',
    remote:          false,
    postedAt:        '2026-03-01',
    tags:            ['sleep-medicine', 'oral-appliance', 'orthodontics'],
    featured:        true,
  },
  {
    id:              'odontologist-krakow-01',
    titleKey:        'careers.jobs.odontologistKrakow.title',
    departmentKey:   'careers.dept.clinical',
    department:      'clinical',
    descKey:         'careers.jobs.odontologistKrakow.desc',
    locationCity:    'Kraków',
    locationCountry: 'Poland',
    type:            'b2b',
    remote:          false,
    postedAt:        '2026-03-05',
    tags:            ['sleep-medicine', 'dental', 'patient-care'],
    featured:        false,
  },
  {
    id:              'dentist-madrid-01',
    titleKey:        'careers.jobs.dentistMadrid.title',
    departmentKey:   'careers.dept.clinical',
    department:      'clinical',
    descKey:         'careers.jobs.dentistMadrid.desc',
    locationCity:    'Mexico City',
    locationCountry: 'Mexico',
    type:            'b2b',
    remote:          false,
    postedAt:        '2026-03-10',
    tags:            ['sleep-medicine', 'ortodóncia', 'odontología'],
    featured:        false,
  },
]

/** All unique countries present in listings — for filter pills. */
export const jobCountries = [...new Set(jobListings.map((j) => j.locationCountry))]

/** All unique cities present in listings — for filter pills. */
export const jobCities = [...new Set(jobListings.map((j) => j.locationCity))]

/** All unique departments — for filter pills. */
export const jobDepartments = [...new Set(jobListings.map((j) => j.department))] as JobDepartment[]
