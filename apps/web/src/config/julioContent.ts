/**
 * Content for the /julio proposal page (campaign page, same precedent as
 * eventoSpeakers.json). Two languages from one source; the view toggles.
 */
export type JulioLang = "es" | "en";

export interface JulioItem {
  name: string;
  text: string;
  evidence?: string;
}
export interface JulioModule extends JulioItem {
  status: "live" | "build" | "plan";
}
export interface JulioShowcase {
  image: string | null;
  name: string;
  text: string;
  bullets: string[];
}
export interface JulioPhase {
  when: string;
  title: string;
  items: string[];
  later: boolean;
}
export interface JulioStep {
  label: string;
  status: string;
}

export interface JulioContent {
  doc: string;
  h1: string;
  lead: string;
  meta: string[];
  order: { title: string; subtitle: string; steps: JulioStep[]; caption: string };
  roadmap: { title: string; lead: string; phases: JulioPhase[] };
  modules: {
    title: string;
    lead: string;
    status: Record<"live" | "build" | "plan", string>;
    list: JulioModule[];
    showcase: JulioShowcase[];
  };
  security: { title: string; lead: string; items: JulioItem[] };
  tenancy: { title: string; lead: string; items: JulioItem[] };
  compliance: {
    title: string;
    lead: string;
    nowLabel: string;
    nextLabel: string;
    now: string[];
    next: string[];
    dpa: string;
  };
  billing: { title: string; lead: string; items: JulioItem[] };
  next: { title: string; items: string[] };
  foot: string;
}

export const julioContent: Record<JulioLang, JulioContent> = {
  "es": {
    "doc": "Propuesta de servicios · Borrador para conversación",
    "h1": "Del pedido al paciente, en una sola plataforma",
    "lead": "neoSLEEP ya gestiona pacientes, citas, estudios, planes de tratamiento y pedidos de dispositivos con OrthoApnea. Proponemos empezar por una app para el paciente y crecer, módulo a módulo, y después sumar el lado del médico, para que OrthoApnea gestione sus propios recursos aquí.",
    "meta": [
      "Preparado para Julio, CEO de OrthoApnea",
      "Noviembre 2026",
      "Documento privado"
    ],
    "order": {
      "title": "Mi pedido",
      "subtitle": "Pedido de dispositivo",
      "steps": [
        {
          "label": "Pedido recibido",
          "status": "Hecho"
        },
        {
          "label": "En preparación",
          "status": "Hecho"
        },
        {
          "label": "Enviado",
          "status": "En curso"
        },
        {
          "label": "Entregado",
          "status": "Pendiente"
        }
      ],
      "caption": "Ejemplo ilustrativo de la Fase 1"
    },
    "roadmap": {
      "title": "Hoja de ruta",
      "lead": "Una primera entrega acotada y fases posteriores que se fijan juntos, con OrthoApnea.",
      "phases": [
        {
          "when": "Fase 1 · T1 2027 (orientativo)",
          "title": "App del paciente",
          "items": [
            "El paciente ve el estado de su pedido",
            "Versión básica, sobre la integración con OrthoApnea que ya funciona",
            "Acceso seguro con enlace personal"
          ],
          "later": false
        },
        {
          "when": "Fase 2 · sin fecha",
          "title": "El lado del médico",
          "items": [
            "Panel del médico con el estado de sus pacientes y pedidos",
            "Seguimiento de estudios y planes de tratamiento",
            "Se define con vuestro equipo, paso a paso"
          ],
          "later": true
        },
        {
          "when": "Fase 3 · sin fecha",
          "title": "Recursos de OrthoApnea en el CRM",
          "items": [
            "Stock, solicitudes y recursos propios",
            "Informes y KPI de operación",
            "Usuarios y roles de vuestro equipo"
          ],
          "later": true
        }
      ]
    },
    "modules": {
      "title": "Módulos que ya funcionan, y los que vienen",
      "lead": "Cada módulo lleva su estado. Nada planificado se presenta como terminado.",
      "status": {
        "live": "Operativo",
        "build": "En construcción",
        "plan": "Planificado"
      },
      "list": [
        {
          "status": "live",
          "name": "Pacientes y ficha clínica",
          "text": "Alta, historial, cuestionarios y documentos del paciente.",
          "evidence": "apps/pwa/src/views/PatientDetailView.vue"
        },
        {
          "status": "live",
          "name": "Citas y calendario",
          "text": "Agenda, recordatorios y consentimiento por cita.",
          "evidence": "apps/api/src/routes/appointment.ts"
        },
        {
          "status": "live",
          "name": "Estudios de sueño y planes de tratamiento",
          "text": "Seguimiento del recorrido terapéutico.",
          "evidence": "apps/api/src/routes/treatmentPlan.ts"
        },
        {
          "status": "live",
          "name": "Pedidos de dispositivo con OrthoApnea",
          "text": "Un pedido por plan, conciliación diaria y sincronización de estado cuatro veces al día.",
          "evidence": "docs/ADR-028-device-order-provider-adapter.md"
        },
        {
          "status": "live",
          "name": "Documentos y firma",
          "text": "Plantillas, contenido editable y firma en el teléfono.",
          "evidence": "apps/api/src/routes/signatureHandoff.ts"
        },
        {
          "status": "live",
          "name": "Panel del médico y directorio",
          "text": "Médicos, centros, territorios y vinculación con pacientes.",
          "evidence": "apps/api/src/routes/doctorPanel.ts"
        },
        {
          "status": "live",
          "name": "Notificaciones y avisos push",
          "text": "Preferencias por usuario y entrega en la app.",
          "evidence": "apps/api/src/routes/notification.ts"
        },
        {
          "status": "live",
          "name": "Tablero de trabajo e incidencias",
          "text": "Registro de incidencias y seguimiento del desarrollo.",
          "evidence": "apps/api/src/routes/workBoard.ts"
        },
        {
          "status": "live",
          "name": "Formación y recursos",
          "text": "Biblioteca de documentos y guías para el equipo.",
          "evidence": "apps/api/src/routes/resourceDocuments.ts"
        },
        {
          "status": "build",
          "name": "App del paciente",
          "text": "Estado del pedido para el paciente. Fase 1.",
          "evidence": "NEO-267"
        },
        {
          "status": "plan",
          "name": "Cola de escritura sin conexión",
          "text": "Trabajo offline para datos no clínicos. Hoy solo hay caché de lectura; requiere ADR propio.",
          "evidence": "docs/ADR-013-offline-read-cache.md"
        },
        {
          "status": "plan",
          "name": "Recursos y stock de OrthoApnea",
          "text": "Inventario y solicitudes propias.",
          "evidence": "Fase 3"
        },
        {
          "status": "plan",
          "name": "Portal del médico",
          "text": "Vista del médico sobre sus pacientes, estudios y pedidos. Alcance por definir con OrthoApnea.",
          "evidence": "Fase 2"
        }
      ],
      "showcase": [
        {
          "image": "m-patients",
          "name": "Pacientes y ficha clínica",
          "text": "Todo el recorrido del paciente en un solo lugar: listado con búsqueda, ficha clínica con pestañas y acceso rápido a citas, estudios, tratamientos y documentos.",
          "bullets": [
            "Alta y ficha del paciente",
            "Historial y cuestionarios",
            "Acceso según rol y región"
          ]
        },
        {
          "image": null,
          "name": "Citas y calendario",
          "text": "Agenda por día, semana o mes, con citas vinculadas al médico y al paciente.",
          "bullets": [
            "Vistas de día, semana y mes",
            "Recordatorios",
            "Consentimiento por cita"
          ]
        },
        {
          "image": "m-treatments",
          "name": "Estudios de sueño y planes de tratamiento",
          "text": "Cada estudio de sueño desemboca en un plan de tratamiento, con su estado visible para todo el equipo.",
          "bullets": [
            "Estudios de sueño",
            "Planes de tratamiento",
            "Estado del recorrido"
          ]
        },
        {
          "image": "shot-order",
          "name": "Pedidos de dispositivo con OrthoApnea",
          "text": "El plan de tratamiento genera el pedido del dispositivo, y el estado vuelve al CRM sin trabajo manual.",
          "bullets": [
            "Un pedido por plan",
            "Conciliación diaria",
            "Estado sincronizado cuatro veces al día"
          ]
        },
        {
          "image": "m-documents",
          "name": "Documentos y firma",
          "text": "Plantillas de documentos con contenido editable y firma del paciente desde el teléfono.",
          "bullets": [
            "Plantillas editables",
            "Firma en el teléfono",
            "Documento guardado en la ficha"
          ]
        },
        {
          "image": "m-doctors",
          "name": "Panel del médico y directorio",
          "text": "Directorio de médicos y centros, con sus territorios y los pacientes vinculados.",
          "bullets": [
            "Médicos y centros",
            "Territorios",
            "Vinculación con pacientes"
          ]
        },
        {
          "image": null,
          "name": "Notificaciones y avisos push",
          "text": "Avisos dentro de la app y notificaciones push, con preferencias por usuario.",
          "bullets": [
            "Preferencias por usuario",
            "Avisos en la app",
            "Notificaciones push"
          ]
        },
        {
          "image": null,
          "name": "Tablero de trabajo e incidencias",
          "text": "Registro de incidencias y seguimiento del desarrollo en un tablero propio de la plataforma.",
          "bullets": [
            "Registro de incidencias",
            "Tablero de desarrollo",
            "Trazabilidad por ticket"
          ]
        },
        {
          "image": "m-resources",
          "name": "Formación y recursos",
          "text": "Biblioteca de documentos, guías y material formativo accesible para el equipo desde la propia app.",
          "bullets": [
            "Documentos en PDF",
            "Guías para el equipo",
            "Siempre a mano en la app"
          ]
        }
      ]
    },
    "security": {
      "title": "Seguridad: controles que existen hoy",
      "lead": "Cada control cita el fichero del repositorio donde se puede comprobar.",
      "items": [
        {
          "name": "Sesiones de vida corta",
          "text": "Token de acceso de 15 minutos, token de renovación rotatorio con detección de reutilización, sin cookies.",
          "evidence": "docs/ADR-020-auth-token-rotation-no-cookies.md"
        },
        {
          "name": "Acceso con Google o contraseña",
          "text": "Roles por región: administrador, responsable, KAM, MSL, representante y médico.",
          "evidence": "apps/api/src/auth.ts"
        },
        {
          "name": "Registro de auditoría inmutable",
          "text": "Quién hizo qué y cuándo, incluidas las acciones sobre pedidos del socio.",
          "evidence": "docs/ADR-010"
        },
        {
          "name": "Copia de seguridad nocturna cifrada",
          "text": "Con comprobación de restauración.",
          "evidence": ".github/workflows/nightly-backup.yml"
        },
        {
          "name": "Análisis de seguridad automático",
          "text": "Detección de secretos (gitleaks) y análisis de código (CodeQL) en cada cambio.",
          "evidence": ".github/workflows/security.yml"
        },
        {
          "name": "Vigilancia continua",
          "text": "Prueba tras cada despliegue, conciliación diaria de pedidos y sincronización de estado.",
          "evidence": ".github/workflows/post-deploy-smoke.yml"
        }
      ]
    },
    "tenancy": {
      "title": "Multi-tenant y protección de datos",
      "lead": "Cada empresa vive en su propio esquema de base de datos. Es una propiedad del diseño, no una opción de configuración.",
      "items": [
        {
          "name": "Un esquema por cliente",
          "text": "Los datos de OrthoApnea no comparten tablas con los de ningún otro cliente. El país es un atributo del usuario, no un cliente aparte.",
          "evidence": "apps/api/migrations/001_tenant_schema.sql"
        },
        {
          "name": "Datos clínicos solo con conexión",
          "text": "Los datos del paciente no se guardan en el dispositivo (RGPD, art. 9). Se borra la caché al cerrar sesión.",
          "evidence": "docs/ADR-013-offline-read-cache.md"
        },
        {
          "name": "Diseño alineado con RGPD, LFPDPPP y EFPIA",
          "text": "Modelo de datos con forma FHIR, consentimientos y divulgaciones propias.",
          "evidence": "docs/CERTIFICATIONS.md"
        },
        {
          "name": "Cadena de proveedores bajo control",
          "text": "Un adaptador por socio, con un único pedido por plan y reconciliación.",
          "evidence": "docs/ADR-017 · ADR-028"
        }
      ]
    },
    "compliance": {
      "title": "Cumplimiento: lo que hay, lo que viene",
      "lead": "Hoy no tenemos certificaciones. Lo decimos claro y mostramos el camino.",
      "nowLabel": "Hoy",
      "nextLabel": "Camino",
      "now": [
        "Sin certificaciones vigentes",
        "Controles de seguridad documentados (arriba)",
        "Región de alojamiento de datos: a confirmar por escrito antes de firmar"
      ],
      "next": [
        "Objetivo: ISO 27001 e ISO 27701 en 2027",
        "Contrato de encargado del tratamiento (DPA)",
        "Registro de subencargados",
        "Plan de auditoría anual y pruebas de intrusión"
      ],
      "dpa": "El contrato de encargado del tratamiento y el registro de subencargados se redactan con vuestro equipo legal. Este documento es el esquema, no el texto contractual."
    },
    "billing": {
      "title": "Modelo de contratación",
      "lead": "Presentamos la estructura. Las cifras se tratan en la reunión.",
      "items": [
        {
          "name": "Alta (setup)",
          "text": "Configuración del entorno de OrthoApnea, usuarios, roles y datos iniciales."
        },
        {
          "name": "Suscripción",
          "text": "Uso de la plataforma, alojamiento, mantenimiento y soporte."
        },
        {
          "name": "Módulos",
          "text": "Módulos adicionales según las fases que se activen."
        }
      ]
    },
    "next": {
      "title": "Siguientes pasos",
      "items": [
        "Revisar este borrador con vosotros",
        "Acordar el alcance exacto de la Fase 1",
        "Confirmar región de datos y esquema del DPA",
        "Fijar fechas de Fase 2 y 3 en conjunto"
      ]
    },
    "foot": "neoSLEEP. Documento orientativo, sin valor contractual. Fechas y alcance sujetos a acuerdo."
  },
  "en": {
    "doc": "Services proposal · Draft for discussion",
    "h1": "From the order to the patient, on one platform",
    "lead": "neoSLEEP already handles patients, appointments, studies, treatment plans and device orders with OrthoApnea. We propose starting with a patient app and growing module by module, then add the doctor side, so OrthoApnea manages its own resources here.",
    "meta": [
      "Prepared for Julio, CEO of OrthoApnea",
      "November 2026",
      "Private document"
    ],
    "order": {
      "title": "My order",
      "subtitle": "Device order",
      "steps": [
        {
          "label": "Order received",
          "status": "Done"
        },
        {
          "label": "Being prepared",
          "status": "Done"
        },
        {
          "label": "Shipped",
          "status": "In progress"
        },
        {
          "label": "Delivered",
          "status": "Pending"
        }
      ],
      "caption": "Illustrative example of Phase 1"
    },
    "roadmap": {
      "title": "Roadmap",
      "lead": "A narrow first delivery, then later phases set together with OrthoApnea.",
      "phases": [
        {
          "when": "Phase 1 · Q1 2027 (indicative)",
          "title": "Patient app",
          "items": [
            "Patients see the status of their order",
            "Basic version, built on the OrthoApnea integration that already works",
            "Secure access with a personal link"
          ],
          "later": false
        },
        {
          "when": "Phase 2 · no date",
          "title": "The doctor side",
          "items": [
            "Doctor panel with the status of their patients and orders",
            "Follow-up of studies and treatment plans",
            "Defined with your team, step by step"
          ],
          "later": true
        },
        {
          "when": "Phase 3 · no date",
          "title": "OrthoApnea resources in the CRM",
          "items": [
            "Stock, requests and own resources",
            "Operations reports and KPIs",
            "Users and roles for your team"
          ],
          "later": true
        }
      ]
    },
    "modules": {
      "title": "Modules that work today, and those coming",
      "lead": "Every module carries its status. Nothing planned is shown as finished.",
      "status": {
        "live": "Live",
        "build": "In development",
        "plan": "Planned"
      },
      "list": [
        {
          "status": "live",
          "name": "Patients and clinical record",
          "text": "Registration, history, questionnaires and patient documents.",
          "evidence": "apps/pwa/src/views/PatientDetailView.vue"
        },
        {
          "status": "live",
          "name": "Appointments and calendar",
          "text": "Scheduling, reminders and consent per appointment.",
          "evidence": "apps/api/src/routes/appointment.ts"
        },
        {
          "status": "live",
          "name": "Sleep studies and treatment plans",
          "text": "Follow-up of the therapy journey.",
          "evidence": "apps/api/src/routes/treatmentPlan.ts"
        },
        {
          "status": "live",
          "name": "Device orders with OrthoApnea",
          "text": "One order per plan, daily reconciliation and status sync four times a day.",
          "evidence": "docs/ADR-028-device-order-provider-adapter.md"
        },
        {
          "status": "live",
          "name": "Documents and signature",
          "text": "Templates, editable content and signing on the phone.",
          "evidence": "apps/api/src/routes/signatureHandoff.ts"
        },
        {
          "status": "live",
          "name": "Doctor panel and directory",
          "text": "Doctors, centres, territories and patient links.",
          "evidence": "apps/api/src/routes/doctorPanel.ts"
        },
        {
          "status": "live",
          "name": "Notifications and push alerts",
          "text": "Per-user preferences and in-app delivery.",
          "evidence": "apps/api/src/routes/notification.ts"
        },
        {
          "status": "live",
          "name": "Work board and issues",
          "text": "Issue reporting and development tracking.",
          "evidence": "apps/api/src/routes/workBoard.ts"
        },
        {
          "status": "live",
          "name": "Training and resources",
          "text": "A library of documents and guides for the team.",
          "evidence": "apps/api/src/routes/resourceDocuments.ts"
        },
        {
          "status": "build",
          "name": "Patient app",
          "text": "Order status for the patient. Phase 1.",
          "evidence": "NEO-267"
        },
        {
          "status": "plan",
          "name": "Offline write queue",
          "text": "Offline work for non-clinical data. Only a read cache exists today; needs its own ADR.",
          "evidence": "docs/ADR-013-offline-read-cache.md"
        },
        {
          "status": "plan",
          "name": "OrthoApnea resources and stock",
          "text": "Own inventory and requests.",
          "evidence": "Phase 3"
        },
        {
          "status": "plan",
          "name": "Doctor portal",
          "text": "The doctor view of their patients, studies and orders. Scope to define with OrthoApnea.",
          "evidence": "Phase 2"
        }
      ],
      "showcase": [
        {
          "image": "m-patients",
          "name": "Patients and clinical record",
          "text": "The whole patient journey in one place: a searchable list, a tabbed clinical record and quick access to appointments, studies, treatments and documents.",
          "bullets": [
            "Patient registration and record",
            "History and questionnaires",
            "Access by role and region"
          ]
        },
        {
          "image": null,
          "name": "Appointments and calendar",
          "text": "Day, week or month schedule, with appointments linked to the doctor and the patient.",
          "bullets": [
            "Day, week and month views",
            "Reminders",
            "Consent per appointment"
          ]
        },
        {
          "image": "m-treatments",
          "name": "Sleep studies and treatment plans",
          "text": "Each sleep study leads to a treatment plan, with its status visible to the whole team.",
          "bullets": [
            "Sleep studies",
            "Treatment plans",
            "Journey status"
          ]
        },
        {
          "image": "shot-order",
          "name": "Device orders with OrthoApnea",
          "text": "The treatment plan creates the device order, and the status comes back to the CRM without manual work.",
          "bullets": [
            "One order per plan",
            "Daily reconciliation",
            "Status synced four times a day"
          ]
        },
        {
          "image": "m-documents",
          "name": "Documents and signature",
          "text": "Document templates with editable content and patient signature from the phone.",
          "bullets": [
            "Editable templates",
            "Signing on the phone",
            "Document saved in the record"
          ]
        },
        {
          "image": "m-doctors",
          "name": "Doctor panel and directory",
          "text": "Directory of doctors and centres, with their territories and linked patients.",
          "bullets": [
            "Doctors and centres",
            "Territories",
            "Patient links"
          ]
        },
        {
          "image": null,
          "name": "Notifications and push alerts",
          "text": "In-app alerts and push notifications, with per-user preferences.",
          "bullets": [
            "Per-user preferences",
            "In-app alerts",
            "Push notifications"
          ]
        },
        {
          "image": null,
          "name": "Work board and issues",
          "text": "Issue reporting and development tracking on the platform's own board.",
          "bullets": [
            "Issue reporting",
            "Development board",
            "Traceability per ticket"
          ]
        },
        {
          "image": "m-resources",
          "name": "Training and resources",
          "text": "A library of documents, guides and training material available to the team inside the app.",
          "bullets": [
            "PDF documents",
            "Team guides",
            "Always at hand in the app"
          ]
        }
      ]
    },
    "security": {
      "title": "Security: controls that exist today",
      "lead": "Each control names the repository file where it can be checked.",
      "items": [
        {
          "name": "Short-lived sessions",
          "text": "15-minute access token, rotating refresh token with reuse detection, no cookies.",
          "evidence": "docs/ADR-020-auth-token-rotation-no-cookies.md"
        },
        {
          "name": "Google or password sign-in",
          "text": "Region-scoped roles: admin, manager, KAM, MSL, rep and doctor.",
          "evidence": "apps/api/src/auth.ts"
        },
        {
          "name": "Immutable audit log",
          "text": "Who did what and when, including actions on partner orders.",
          "evidence": "docs/ADR-010"
        },
        {
          "name": "Encrypted nightly backup",
          "text": "With a restore check.",
          "evidence": ".github/workflows/nightly-backup.yml"
        },
        {
          "name": "Automated security scanning",
          "text": "Secret detection (gitleaks) and code analysis (CodeQL) on every change.",
          "evidence": ".github/workflows/security.yml"
        },
        {
          "name": "Continuous monitoring",
          "text": "Smoke test after every deploy, daily order reconciliation and status sync.",
          "evidence": ".github/workflows/post-deploy-smoke.yml"
        }
      ]
    },
    "tenancy": {
      "title": "Multi-tenant and data protection",
      "lead": "Each company lives in its own database schema. This is a design property, not a configuration option.",
      "items": [
        {
          "name": "One schema per client",
          "text": "OrthoApnea data shares no tables with any other client. Country is a user attribute, not a separate client.",
          "evidence": "apps/api/migrations/001_tenant_schema.sql"
        },
        {
          "name": "Clinical data only online",
          "text": "Patient data is not stored on the device (GDPR Art. 9). The cache is cleared on sign-out.",
          "evidence": "docs/ADR-013-offline-read-cache.md"
        },
        {
          "name": "Design aligned with GDPR, LFPDPPP and EFPIA",
          "text": "FHIR-shaped data model, consents and own disclosure records.",
          "evidence": "docs/CERTIFICATIONS.md"
        },
        {
          "name": "Supplier chain under control",
          "text": "One adapter per partner, a single order per plan, and reconciliation.",
          "evidence": "docs/ADR-017 · ADR-028"
        }
      ]
    },
    "compliance": {
      "title": "Compliance: what exists, what comes",
      "lead": "Today we hold no certifications. We say so plainly and show the path.",
      "nowLabel": "Today",
      "nextLabel": "The path",
      "now": [
        "No current certifications",
        "Documented security controls (above)",
        "Data hosting region: to be confirmed in writing before signing"
      ],
      "next": [
        "Target: ISO 27001 and ISO 27701 in 2027",
        "Data processing agreement (DPA)",
        "Sub-processor register",
        "Annual audit plan and penetration tests"
      ],
      "dpa": "The processing agreement and sub-processor register are drafted with your legal team. This document is the outline, not contract text."
    },
    "billing": {
      "title": "Commercial model",
      "lead": "We present the structure. Figures are discussed in the meeting.",
      "items": [
        {
          "name": "Setup",
          "text": "Configuration of the OrthoApnea environment, users, roles and initial data."
        },
        {
          "name": "Subscription",
          "text": "Platform use, hosting, maintenance and support."
        },
        {
          "name": "Modules",
          "text": "Additional modules according to the phases switched on."
        }
      ]
    },
    "next": {
      "title": "Next steps",
      "items": [
        "Review this draft together",
        "Agree the exact scope of Phase 1",
        "Confirm data region and DPA outline",
        "Set Phase 2 and 3 dates jointly"
      ]
    },
    "foot": "neoSLEEP. Indicative document, not contractual. Dates and scope subject to agreement."
  }
};
