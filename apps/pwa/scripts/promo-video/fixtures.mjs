// NEO-204 — fictional demo data for the promo video. Every person here is
// invented; the video must never show a real patient or doctor.

const DOCTOR = { id: "u-doc", name: "Dr. Elena Vargas", first: "Elena", last: "Vargas" };

export const user = {
  id: DOCTOR.id,
  email: "elena.vargas@demo.neosleepcare.com",
  name: DOCTOR.name,
  role: "doctor",
  tenant: "demo",
  country_code: "MX",
  region: "cdmx",
  language: "en",
  hasPassword: true,
};

const PATIENTS = [
  ["p1", "Sofía", "Ramírez", "female", "1984-03-12", "active", 31.4, 2],
  ["p2", "Daniel", "Ortega", "male", "1977-08-02", "follow_up", 24.8, 6],
  ["p3", "Lucía", "Méndez", "female", "1990-11-23", "active", 18.2, 4],
  ["p4", "Mateo", "Herrera", "male", "1969-01-30", "active", 42.1, 6],
  ["p5", "Valeria", "Castillo", "female", "1982-06-17", "follow_up", 15.6, 5],
  ["p6", "Andrés", "Navarro", "male", "1975-09-09", "active", 27.3, 3],
  ["p7", "Camila", "Rojas", "female", "1993-04-04", "active", 11.9, 1],
  ["p8", "Javier", "Morales", "male", "1980-12-21", "discharged", 8.4, 6],
  ["p9", "Isabel", "Fuentes", "female", "1972-02-14", "active", 35.0, 4],
  ["p10", "Tomás", "Aguilar", "male", "1987-07-28", "follow_up", 21.7, 5],
];

const FORM_KEYS = ["informedConsent", "medicalHistory", "stopBang", "oralExam", "historiaEndo", "polysomnography"];

function daysAgo(n, hour = 10) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 15, 0, 0);
  return d.toISOString();
}

const ascii = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const patientRow = ([id, first, last, gender, dob, status, ahi, done], i) => ({
  id,
  name: `${first} ${last}`,
  first_name: first,
  last_name: last,
  email: `${ascii(first)}.${ascii(last)}@example.com`,
  phone: `+52 55 ${String(1000 + i * 137).slice(0, 4)} ${String(2000 + i * 311).slice(0, 4)}`,
  practitioner_id: DOCTOR.id,
  practitioner_name: DOCTOR.name,
  practitioner_first_name: DOCTOR.first,
  practitioner_last_name: DOCTOR.last,
  practitioner_specialty: "sleep_medicine",
  practitioner_specialties: ["sleep_medicine"],
  gender,
  date_of_birth: dob,
  updated_at: daysAgo(i, 9 + (i % 7)),
  status,
  region: "cdmx",
  territory_name: "Mexico City",
  territory_id: "t1",
  territory_path: [
    { id: "t0", name: "Mexico", code: "MX", kind: "country" },
    { id: "t1", name: "Mexico City", code: "CDMX", kind: "city" },
    { id: "t2", name: "Polanco", code: "Polanco", kind: "district" },
  ],
  intake_forms: FORM_KEYS.map((key, k) => ({ key, done: k < done })),
  ahi_baseline: ahi,
  cpap_device: null,
  medical_record: `NS-${2400 + i * 17}`,
});

export const patients = PATIENTS.map(patientRow);

export const lookups = {
  regions: [{ key: "cdmx", value: "Mexico City", locale: "en", sort_order: 1, locked: false, custom: false }],
  specialties: [
    { key: "sleep_medicine", value: "Sleep medicine", locale: "en", sort_order: 1, locked: false, custom: false },
    { key: "dentist", value: "Dentist", locale: "en", sort_order: 2, locked: false, custom: false },
  ],
  organization_types: [],
};

function historyEntry(key, label, source, by, ago) {
  return { id: `h-${key}`, type: "record", created_at: daysAgo(ago), source, by, is_new: false, title: label };
}

export function checklist(id) {
  const p = patients.find((x) => x.id === id) ?? patients[0];
  const doneCount = p.intake_forms.filter((f) => f.done).length;
  const defs = [
    ["informedConsent", "Informed consent", "consent", "consent", "document"],
    ["medicalHistory", "Medical history", "patient", "patient", "document"],
    ["stopBang", "STOP-Bang questionnaire", "patient", "patient", "document"],
    ["oralExam", "Oral exam", "doctor", "doctor", "document"],
    ["historiaEndo", "Clinical History", "doctor", "doctor", "document"],
    ["polysomnography", "Polysomnography", "external", "results", "study"],
  ];
  const items = defs.map(([key, label, fillMode, group, category], k) => {
    const done = k < doneCount;
    const isStudy = key === "polysomnography";
    return {
      key,
      templateKey: key,
      label,
      fillMode,
      group,
      category,
      status: done ? "done" : k === doneCount ? "pending_patient" : "missing",
      completed_at: done ? daysAgo(20 - k * 3) : null,
      history: done
        ? [
            isStudy
              ? {
                  id: `h-${key}`,
                  type: "sleep_study",
                  created_at: daysAgo(4),
                  source: "staff",
                  by: DOCTOR.name,
                  sleep_study_id: "s1",
                  sleep_study: { id: "s1", status: "completed", study_date: daysAgo(5).slice(0, 10), ahi_score: p.ahi_baseline, spo2_nadir: 84, odi: 22.5, interpretation: "Moderate obstructive sleep apnea" },
                }
              : historyEntry(key, label, fillMode === "patient" ? "patient" : "staff", fillMode === "patient" ? null : DOCTOR.name, 20 - k * 3),
          ]
        : [],
      pending_request_id: null,
      actions: { qr: fillMode === "patient" || fillMode === "consent", fill: isStudy ? "sleep_study" : fillMode === "patient" ? "questionnaire" : null, form: key === "medicalHistory" ? "medical_history" : key === "oralExam" ? "oral_exam" : key === "stopBang" ? "stop_bang" : null, print: !isStudy, upload: true },
    };
  });
  return { items, other_uploads: [], pending_requests: [], expired_request: null, summary: { done: doneCount, total: defs.length }, version: "v1" };
}

export function treatmentPlans(id) {
  return {
    items: [
      {
        id: `tp-${id}`,
        dentist_id: "d1",
        dentist_name: "Dr. Marco Salinas",
        dentist_specialty: "dentist",
        dentist_specialties: ["dentist"],
        appointment_at: daysAgo(12),
        scan_ordered_at: daysAgo(10),
        scan_received_at: daysAgo(8),
        scan_file_url: null,
        appliance_ordered_at: daysAgo(6),
        appliance_delivered_at: null,
        notes: "Mandibular advancement device, titration after 4 weeks.",
        status: "in_progress",
        metadata: null,
      },
    ],
  };
}

export function history(id) {
  const p = patients.find((x) => x.id === id) ?? patients[0];
  const e = (n, ago, action, entity_type, after) => ({ id: `e${n}`, created_at: daysAgo(ago, 9 + n), user_id: DOCTOR.id, user_name: DOCTOR.name, action, entity_type, entity_id: id, entity_before: null, entity_after: after });
  return {
    entries: [
      e(1, 1, "update", "treatment_plan", { status: "in_progress" }),
      e(2, 4, "create", "sleep_study", { ahi_score: p.ahi_baseline }),
      e(3, 9, "update", "patient", { status: p.status }),
      e(4, 21, "create", "patient", { name: p.name }),
    ],
    lead_source: { source: "website", converted_at: daysAgo(24) },
  };
}

export const notes = (id) => ({
  items: [
    { id: "n1", entity_type: "patient", entity_id: id, author_id: DOCTOR.id, author_name: DOCTOR.name, body: "Feels more rested after two weeks with the appliance. Daytime sleepiness down.", created_at: daysAgo(2) },
    { id: "n2", entity_type: "patient", entity_id: id, author_id: DOCTOR.id, author_name: DOCTOR.name, body: "Follow-up sleep study scheduled.", created_at: daysAgo(9) },
  ],
});

// Appointments across the current Mon–Sun week, positioned in the browser's zone.
export function appointments(startIso) {
  const monday = new Date(startIso);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const slots = [
    [0, 9, 0, 45, 0, "scheduled", "Clínica del Sueño Polanco"],
    [0, 11, 30, 30, 2, "completed", "Clínica del Sueño Polanco"],
    [0, 16, 0, 60, 3, "scheduled", "Hospital Ángeles"],
    [1, 8, 30, 30, 4, "scheduled", "Clínica del Sueño Polanco"],
    [1, 10, 0, 60, 5, "scheduled", "Clínica del Sueño Polanco"],
    [1, 14, 0, 45, 6, "scheduled", "Hospital Ángeles"],
    [2, 9, 30, 45, 7, "scheduled", "Clínica del Sueño Polanco"],
    [2, 12, 0, 30, 8, "scheduled", "Clínica del Sueño Polanco"],
    [2, 17, 0, 45, 9, "scheduled", "Hospital Ángeles"],
    [3, 8, 0, 60, 0, "scheduled", "Hospital Ángeles"],
    [3, 11, 0, 30, 1, "scheduled", "Clínica del Sueño Polanco"],
    [3, 15, 30, 45, 2, "scheduled", "Clínica del Sueño Polanco"],
    [4, 9, 0, 45, 3, "scheduled", "Clínica del Sueño Polanco"],
    [4, 13, 0, 60, 4, "scheduled", "Hospital Ángeles"],
    [4, 16, 30, 30, 5, "scheduled", "Clínica del Sueño Polanco"],
    [5, 10, 0, 45, 6, "scheduled", "Clínica del Sueño Polanco"],
  ];
  return {
    items: slots.map(([day, h, m, len, pi, status, org], i) => {
      const s = new Date(monday);
      s.setDate(s.getDate() + day);
      s.setHours(h, m, 0, 0);
      const e = new Date(s.getTime() + len * 60000);
      const p = patients[pi];
      return {
        id: `a${i}`,
        patient_id: p.id,
        patient_name: p.name,
        patient_first_name: p.first_name,
        patient_last_name: p.last_name,
        practitioner_id: DOCTOR.id,
        practitioner_name: DOCTOR.name,
        practitioner_first_name: DOCTOR.first,
        practitioner_last_name: DOCTOR.last,
        organization_id: "o1",
        organization_name: org,
        sleep_study_id: null,
        treatment_plan_id: null,
        created_by_user_id: DOCTOR.id,
        type: "consultation",
        status,
        start_at: s.toISOString(),
        end_at: e.toISOString(),
        timezone: tz,
        location_type: "in_person",
        notes: null,
      };
    }),
  };
}

const RESOURCES = [
  ["r1", "Recognizing sleep apnea in the dental chair", "Dr. Marco Salinas", "detect", 412, "#128F83"],
  ["r2", "STOP-Bang: screening in five minutes", "NeoSleep Academy", "detect", 298, "#10544E"],
  ["r3", "Reading a polysomnography report", "Dr. Elena Vargas", "diagnose", 655, "#082A27"],
  ["r4", "Home sleep tests vs. lab studies", "NeoSleep Academy", "diagnose", 537, "#17b5a5"],
  ["r5", "Ordering a mandibular advancement device", "NeoSleep Academy", "order", 344, "#128F83"],
  ["r6", "Titration and follow-up visits", "Dr. Marco Salinas", "followup", 479, "#10544E"],
];

export const resources = {
  resources: RESOURCES.map(([id, title, author, topic, durationSec], i) => ({
    id,
    partner: "orthoapnea",
    kind: "video",
    title,
    description: author,
    mediaUrl: `/api/v1/partners/orthoapnea/resources/${id}/media`,
    fileType: "video",
    languages: [{ code: "en", mediaUrl: `/api/v1/partners/orthoapnea/resources/${id}/media` }],
    category: "webinars",
    subcategory: null,
    weight: i,
    posterUrl: `/api/v1/partners/orthoapnea/resources/${id}/poster?locale=en`,
    durationSec,
    topic,
  })),
  mediaToken: "demo",
};

export function poster(id) {
  const r = RESOURCES.find((x) => x[0] === id) ?? RESOURCES[0];
  const [, title, , , , color] = r;
  const words = title.split(" ");
  const lines = [];
  for (const w of words) {
    const last = lines[lines.length - 1];
    if (last && (last + " " + w).length <= 22) lines[lines.length - 1] = last + " " + w;
    else lines.push(w);
  }
  const text = lines
    .map((l, i) => `<text x="64" y="${250 + i * 58}" font-family="-apple-system, Helvetica, Arial" font-size="48" font-weight="700" fill="#fff">${l.replace(/&/g, "&amp;")}</text>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="#082A27"/></linearGradient></defs>
  <rect width="1280" height="720" fill="url(#g)"/>
  <circle cx="1060" cy="170" r="260" fill="#8ED6CE" opacity="0.14"/>
  <circle cx="1140" cy="620" r="180" fill="#8ED6CE" opacity="0.1"/>
  <text x="64" y="140" font-family="-apple-system, Helvetica, Arial" font-size="28" font-weight="600" fill="#8ED6CE" letter-spacing="4">NEOSLEEP ACADEMY</text>
  ${text}
</svg>`;
}
