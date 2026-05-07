<template>
  <!-- ── Hero ──────────────────────────────────────────────────────────────── -->
  <section class="ev-hero">
    <div class="ev-hero__arc ev-hero__arc--1" aria-hidden="true" />
    <div class="ev-hero__arc ev-hero__arc--2" aria-hidden="true" />
    <div class="page-container ev-hero__content">
      <p class="ev-eyebrow">NEOSLEEP BREAKFAST &amp; new Business opportunities</p>
      <h1 class="ev-hero__title">
        The Future of Sleep Medicine &amp; Dentistry
        <span class="ev-hero__title-sub">— Powered by AI</span>
      </h1>
      <div class="ev-hero__meta">
        <span class="ev-badge">Soho House Mexico City</span>
        <span class="ev-badge">10:00 – 13:00 h</span>
        <span class="ev-badge">17 de junio · 2026</span>
      </div>
    </div>
  </section>

  <!-- ── Manifesto ─────────────────────────────────────────────────────────── -->
  <section ref="manifestoRef" class="home-section ev-manifesto home-reveal">
    <div class="page-container">
      <p class="home-eyebrow">Manifiesto</p>
      <h2 class="home-heading">Por qué existe NeoSleep</h2>
      <div class="ev-manifesto__grid">
        <div v-for="p in pillars" :key="p.title" class="ev-pillar">
          <div class="ev-pillar__img-wrap">
            <img :src="p.img" :alt="p.title" class="ev-pillar__img ev-img-lazy" loading="lazy" decoding="async" @load="onImgLoad" />
          </div>
          <div class="ev-pillar__body">
            <h3 class="ev-pillar__title">{{ p.title }}</h3>
            <p class="ev-pillar__text">{{ p.text }}</p>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- ── Problema + Oportunidad ────────────────────────────────────────────── -->
  <section ref="splitRef" class="ev-split home-reveal">
    <div class="page-container ev-split__inner">
      <div class="ev-split__col">
        <p class="ev-split__label">El Problema</p>
        <h3 class="ev-split__heading">Millones sin diagnóstico.</h3>
        <p class="ev-split__body">
          Millones de personas en México sufren trastornos del sueño sin saberlo. La apnea no
          diagnosticada afecta la calidad de vida, la salud cardiovascular y la productividad.
          <strong>Los dentistas tienen la posición perfecta para cambiar esto.</strong>
        </p>
      </div>
      <div class="ev-split__divider" aria-hidden="true" />
      <div class="ev-split__col ev-split__col--accent">
        <p class="ev-split__label">La Oportunidad</p>
        <h3 class="ev-split__heading">Nueva línea de negocio.</h3>
        <p class="ev-split__body">
          Una línea basada en diagnóstico + tratamiento + seguimiento validado. NeoSleep no solo
          mejora la calidad de vida de los pacientes,
          <strong>abre ingresos recurrentes y escalables para tu clínica.</strong>
        </p>
      </div>
    </div>
  </section>

  <!-- ── Sistema NeoSleep 360 ───────────────────────────────────────────────── -->
  <section ref="sistemaRef" class="home-section ev-sistema home-reveal">
    <div class="page-container">
      <p class="home-eyebrow">Método</p>
      <h2 class="home-heading">Sistema NeoSleep 360™</h2>
      <p class="home-sub home-sub--center">
        Diagnóstico <strong>inteligente</strong>. Tratamiento <strong>efectivo</strong>.
        Resultados <strong>medibles</strong>.
      </p>
      <div class="ev-steps">
        <template v-for="(step, i) in steps" :key="step.label">
          <div class="ev-step">
            <div class="ev-step__num">{{ i + 1 }}</div>
            <div class="ev-step__text">
              <p class="ev-step__label">{{ step.label }}</p>
              <p class="ev-step__sub">{{ step.sub }}</p>
            </div>
          </div>
          <div v-if="i < steps.length - 1" class="ev-step__arrow" aria-hidden="true">→</div>
        </template>
      </div>
    </div>
  </section>

  <!-- ── Ponentes ───────────────────────────────────────────────────────────── -->
  <section id="ponentes" ref="ponentesRef" class="home-section ev-ponentes home-reveal">
    <div class="page-container">
      <p class="home-eyebrow">Programa</p>
      <h2 class="home-heading">8 perspectivas del sueño</h2>
      <p class="home-sub home-sub--center">
        Un panel multidisciplinario de expertos que cubren cada dimensión del protocolo NeoSleep.
      </p>
      <div class="ev-speakers">
        <button
          v-for="s in speakers"
          :key="s.num"
          class="ev-speaker ev-speaker--btn"
          type="button"
          :aria-label="`Ver detalles: ${s.specialty}`"
          @click="openModal(s)"
        >
          <div class="ev-speaker__avatar" :style="s.photo ? {} : { background: s.color }">
            <img v-if="s.photo" :src="s.photo" :alt="s.name ?? s.specialty" class="ev-speaker__photo ev-img-lazy" loading="lazy" decoding="async" @load="onImgLoad" />
            <svg v-else class="ev-speaker__person" viewBox="0 0 80 90" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <circle cx="40" cy="28" r="16" fill="rgba(255,255,255,0.92)"/>
              <path d="M8 82 C8 62 72 62 72 82" fill="rgba(255,255,255,0.92)"/>
            </svg>
          </div>
          <div class="ev-speaker__info">
            <div class="ev-speaker__name-row">
              <h4 class="ev-speaker__specialty">{{ s.name ?? s.specialty }}</h4>
              <span v-if="s.flags?.length" class="ev-speaker__flags" aria-hidden="true">
                <Flag v-for="code in s.flags" :key="code" :code="code" :size="14" />
              </span>
            </div>
            <p v-if="s.name" class="ev-speaker__role ev-speaker__role--teal">{{ s.specialty }}</p>
            <p v-if="s.subtitle" class="ev-speaker__subtitle">{{ s.subtitle }}</p>
            <p v-if="!s.subtitle" class="ev-speaker__topic">{{ s.topic }}</p>
          </div>
          <span class="ev-speaker__hint" aria-hidden="true">Ver más →</span>
        </button>
      </div>

  <!-- ── Modal ────────────────────────────────────────────────────────────── -->
  <Teleport to="body">
    <Transition name="ev-modal">
      <div
        v-if="active"
        class="ev-modal-backdrop"
        role="dialog"
        aria-modal="true"
        :aria-label="active.specialty"
        @click.self="closeModal"
      >
        <div class="ev-modal">
          <button
            type="button"
            class="ev-modal__close"
            aria-label="Cerrar"
            @click="closeModal"
          >✕</button>

          <div class="ev-modal__header">
            <div class="ev-modal__avatar" :style="active.photo ? {} : { background: active.color }">
              <img v-if="active.photo" :src="active.photo" :alt="active.name ?? active.specialty" class="ev-modal__photo ev-img-lazy" loading="lazy" decoding="async" @load="onImgLoad" />
              <svg v-else class="ev-modal__person" viewBox="0 0 80 90" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <circle cx="40" cy="28" r="16" fill="rgba(255,255,255,0.92)"/>
                <path d="M8 82 C8 62 72 62 72 82" fill="rgba(255,255,255,0.92)"/>
              </svg>
            </div>
            <div>
              <div class="ev-modal__name-row">
                <h3 class="ev-modal__specialty">{{ active.name ?? active.specialty }}</h3>
                <span v-if="active.flags?.length" class="ev-modal__flags" aria-hidden="true">
                  <Flag v-for="code in active.flags" :key="code" :code="code" :size="18" />
                </span>
              </div>
              <p v-if="active.name" class="ev-modal__role ev-modal__role--teal">{{ active.specialty }}</p>
            </div>
          </div>

          <p class="ev-modal__topic">{{ active.topic }}</p>

          <p v-if="active.bio" class="ev-modal__bio">{{ active.bio }}</p>

          <ul class="ev-modal__bullets">
            <li v-for="b in active.bullets" :key="b">
              <span class="ev-modal__bullet-dot" aria-hidden="true" />
              {{ b }}
            </li>
          </ul>

          <div v-if="!active.name" class="ev-modal__speaker-placeholder">
            <div class="ev-modal__photo-wrap" aria-hidden="true" />
            <p class="ev-modal__speaker-name">Ponente por confirmar</p>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
    </div>
  </section>

  <!-- ── Cierre exclusivo ───────────────────────────────────────────────────── -->
  <section ref="cierreRef" class="ev-cierre home-reveal">
    <div class="ev-cierre__arc" aria-hidden="true" />
    <div class="page-container ev-cierre__inner">
      <p class="ev-cierre__kicker">Invitación exclusiva — CDMX</p>
      <h2 class="ev-cierre__heading">Hoy no estamos invitando a todos.</h2>
      <p class="ev-cierre__body">
        Estamos buscando un grupo selecto de clínicas en CDMX para construir esta red desde el inicio.
      </p>
      <p class="ev-cierre__emphasis">
        Si entiendes el potencial de esto… queremos hablar contigo.
      </p>
      <a href="#contacto" class="home-btn home-btn--white-outline">
        Quiero saber más <span class="home-btn__arrow">↓</span>
      </a>
    </div>
  </section>

  <!-- ── Patrocinadores ───────────────────────────────────────────────────── -->
  <section ref="patrocinRef" class="home-section ev-patrocin home-reveal">
    <div class="page-container ev-patrocin__inner">
      <p class="ev-eyebrow ev-patrocin__label">Patrocinadores</p>
      <div class="ev-patrocin__logos">
        <button class="ev-patrocin__logo-btn" @click="sponsorModal = 'orthoapnea'" aria-label="Ver información de OrthoApnea">
          <img src="/images/patrocinadores/orthoapnea.svg" alt="OrthoApnea" class="ev-patrocin__logo ev-patrocin__logo--lg" />
        </button>
        <button class="ev-patrocin__logo-btn" @click="sponsorModal = 'biologix'" aria-label="Ver información de Biologix">
          <img src="/images/patrocinadores/biologix.png" alt="Biologix" class="ev-patrocin__logo" />
        </button>
      </div>
    </div>
  </section>

  <!-- Sponsor modals -->
  <Teleport to="body">
    <Transition name="ev-modal">
      <div v-if="sponsorModal" class="ev-modal-backdrop" role="dialog" aria-modal="true" @click.self="sponsorModal = null">
        <div class="ev-modal ev-sponsor-modal" style="font-family: var(--website-font-sans);">
          <button class="ev-modal__close" @click="sponsorModal = null" aria-label="Cerrar">✕</button>

          <!-- OrthoApnea -->
          <template v-if="sponsorModal === 'orthoapnea'">
            <div class="ev-sponsor-modal__header">
              <img src="/images/noa.png" alt="NOA by OrthoApnea" class="ev-sponsor-modal__logo ev-sponsor-modal__logo--product ev-img-lazy" loading="lazy" decoding="async" @load="onImgLoad" />
            </div>
            <h3 class="ev-sponsor-modal__name">OrthoApnea NOA</h3>
            <p class="ev-sponsor-modal__desc">El dispositivo de avance mandibular OrthoApnea NOA es una solución clínicamente validada para el tratamiento de la apnea obstructiva del sueño (AOS) y el ronquido. Fabricado en poliamida 12 con certificación de biocompatibilidad clase IIa, está diseñado de forma personalizada mediante tecnología digital adaptada a la biomecánica mandibular de cada paciente.</p>
            <p class="ev-sponsor-modal__desc">Su mecanismo de avance progresivo por milímetros permite una titulación precisa, indicado tanto en AOS leve-moderada como en casos severos con intolerancia a otros tratamientos.</p>
            <a href="https://www.orthoapnea.com/orthoapnea-noa/" target="_blank" rel="noopener" class="ev-sponsor-modal__link">Más información →</a>
          </template>

          <!-- Biologix -->
          <template v-else-if="sponsorModal === 'biologix'">
            <div class="ev-sponsor-modal__header">
              <img src="/images/biologix.png" alt="Biologix" class="ev-sponsor-modal__logo ev-sponsor-modal__logo--product ev-img-lazy" loading="lazy" decoding="async" @load="onImgLoad" />
            </div>
            <h3 class="ev-sponsor-modal__name">Biologix — Diagnóstico del sueño en casa</h3>
            <p class="ev-sponsor-modal__desc">Biologix es una plataforma de diagnóstico domiciliario del sueño basada en el sensor inalámbrico Oxistar®, que replica la polisomnografía convencional con una precisión superior al 90% validada en estudios clínicos. El dispositivo monitoriza niveles de oxigenación, frecuencia cardíaca, episodios apneicos y patrones de ronquido a lo largo de la noche, de forma no invasiva y desde la comodidad del hogar.</p>
            <p class="ev-sponsor-modal__desc">Sus resultados se integran directamente en el flujo clínico de NeoSleep, permitiendo el diagnóstico inicial, el seguimiento de la adherencia al tratamiento y la re-evaluación objetiva de la eficacia del DAM.</p>
            <a href="https://www.biologix.com.br/en/" target="_blank" rel="noopener" class="ev-sponsor-modal__link">Más información →</a>
          </template>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- ── El Lugar / Sede ───────────────────────────────────────────────────── -->
  <section ref="sedeRef" class="ev-sede home-reveal">
    <div class="page-container ev-sede__inner">
      <div class="ev-sede__text">
        <p class="ev-eyebrow">El Lugar</p>
        <h2 class="ev-sede__heading">Soho House<br>Mexico City</h2>
        <p class="ev-sede__body">
          Ubicado en el corazón de la Colonia Juárez, Soho House Mexico City es un espacio
          diseñado para la conexión entre profesionales de vanguardia. Su ambiente íntimo y
          contemporáneo crea el marco ideal para conversaciones clínicas de alto nivel.
        </p>
        <p class="ev-sede__body">
          Un desayuno de trabajo. Un grupo selecto. Ideas que transforman la medicina del sueño en México.
        </p>
        <button class="home-btn home-btn--secondary ev-sede__cta" @click="sedeModalOpen = true">
          Ver el espacio <span class="home-btn__arrow">→</span>
        </button>
      </div>
      <button class="ev-sede__preview" @click="sedeModalOpen = true" aria-label="Ver Soho House Mexico City">
        <img src="/images/soho-house-cdmx.jpeg" alt="Soho House Mexico City" class="ev-sede__preview-img ev-img-lazy" loading="lazy" decoding="async" @load="onImgLoad" />
        <div class="ev-sede__preview-overlay" aria-hidden="true">
          <span class="ev-sede__preview-label">Ver espacio →</span>
        </div>
      </button>
    </div>
  </section>

  <!-- Venue modal -->
  <Teleport to="body">
    <Transition name="ev-modal">
      <div
        v-if="sedeModalOpen"
        class="ev-modal-backdrop"
        role="dialog"
        aria-modal="true"
        aria-label="Soho House Mexico City"
        @click.self="sedeModalOpen = false"
      >
        <div class="ev-sede-modal">
          <button class="ev-modal__close" @click="sedeModalOpen = false" aria-label="Cerrar">✕</button>
          <div class="ev-sede-modal__img-wrap">
            <img src="/images/soho-house-cdmx-2.jpeg" alt="Soho House Mexico City" class="ev-sede-modal__img ev-img-lazy" loading="lazy" decoding="async" @load="onImgLoad" />
          </div>
          <div class="ev-sede-modal__body">
            <h3 class="ev-sede-modal__name">Soho House Mexico City</h3>
            <p class="ev-sede-modal__address">
              <span class="ev-sede-modal__pin" aria-hidden="true">📍</span>
              Colonia Juárez, Ciudad de México
            </p>
            <p class="ev-sede-modal__desc">
              Un espacio exclusivo concebido para profesionales que buscan más que un evento tradicional.
              Arquitectura de autor, gastronomía de calidad y un entorno diseñado para hacer circular ideas.
              El escenario perfecto para redefinir el futuro de la medicina del sueño en México.
            </p>
            <div class="ev-sede-modal__meta">
              <span>17 de junio · 2026</span>
              <span>10:00 – 13:00 h</span>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- ── Contacto ─────────────────────────────────────────────────────────── -->
  <section id="contacto" ref="contactoRef" class="ev-contacto home-reveal">
    <div class="page-container ev-contacto__wrap">

      <!-- Left: info panel -->
      <div class="ev-contacto__info">
        <p class="ev-eyebrow">Contacto</p>
        <h2 class="ev-contacto__heading">¿Tu clínica está lista para dar el siguiente paso?</h2>
        <ul class="ev-contacto__perks">
          <li v-for="p in contactPerks" :key="p">
            <span class="ev-contacto__perk-dot" aria-hidden="true" />
            {{ p }}
          </li>
        </ul>
        <div class="ev-contacto__event-meta">
          <span>17 jun 2026</span>
          <span>10:00 – 13:00 h</span>
          <span>Soho House Mexico City</span>
        </div>
      </div>

      <!-- Right: form card -->
      <div class="ev-contacto__card">
        <Transition name="ev-form-success" mode="out-in">
          <div v-if="evStatus === 'success'" key="success" class="ev-contacto__success">
            <div class="ev-contacto__success-icon" aria-hidden="true">✓</div>
            <h3>¡Registro recibido con éxito!</h3>
            <p>Tu solicitud ha sido procesada. Nuestro equipo clínico revisará tu perfil y se pondrá en contacto contigo en las próximas <strong>24–48 horas</strong> para confirmar tu participación.</p>
            <p class="ev-contacto__success-note">Nos vemos el <strong>17 de junio</strong> en Soho House Mexico City.</p>
          </div>

          <form v-else key="form" class="ev-form" @submit.prevent="onSubmitEvento">
            <div class="ev-form__row ev-form__row--full">
              <div class="ev-field">
                <input id="ev-nombre" v-model="evForm.firstName" type="text" required placeholder=" " class="ev-field__input" />
                <label for="ev-nombre" class="ev-field__label">Nombres</label>
              </div>
            </div>
            <div class="ev-form__row ev-form__row--full">
              <div class="ev-field">
                <input id="ev-apellido" v-model="evForm.lastName" type="text" required placeholder=" " class="ev-field__input" />
                <label for="ev-apellido" class="ev-field__label">Apellidos</label>
              </div>
            </div>
            <div class="ev-form__row">
              <div class="ev-field">
                <input id="ev-especialidad" v-model="evForm.especialidad" type="text" required placeholder=" " class="ev-field__input" />
                <label for="ev-especialidad" class="ev-field__label">Especialidad</label>
              </div>
              <div class="ev-field">
                <input id="ev-clinica" v-model="evForm.clinica" type="text" required placeholder=" " class="ev-field__input" />
                <label for="ev-clinica" class="ev-field__label">Clínica</label>
              </div>
            </div>
            <div class="ev-form__row">
              <div class="ev-field">
                <input id="ev-telefono" v-model="evForm.phone" type="tel" required placeholder=" " class="ev-field__input" :class="{ 'ev-field__input--error': phoneError }" @input="phoneError = ''" />
                <label for="ev-telefono" class="ev-field__label">Teléfono (MX)</label>
                <p v-if="phoneError" class="ev-field__error">{{ phoneError }}</p>
              </div>
              <div class="ev-field">
                <input id="ev-email" v-model="evForm.email" type="email" required placeholder=" " class="ev-field__input" />
                <label for="ev-email" class="ev-field__label">Correo electrónico</label>
              </div>
            </div>

            <button type="submit" class="ev-form__btn" :disabled="evStatus === 'loading'">
              <span>{{ evStatus === 'loading' ? 'Enviando…' : 'Quiero asistir' }}</span>
              <span v-if="evStatus !== 'loading'" aria-hidden="true">→</span>
            </button>

            <p v-if="evStatus === 'error'" class="ev-form__error">
              Algo salió mal. Intenta de nuevo.
            </p>
          </form>
        </Transition>
      </div>

    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from "vue";
import Flag from "../components/Flag.vue";

function onImgLoad(e: Event) {
  (e.target as HTMLImageElement).classList.add("ev-img-lazy--loaded");
}
import speakersData from "../config/eventoSpeakers.json";

/* ── Speaker modal ──────────────────────────────────────────────────────── */
interface Speaker {
  num: number;
  specialty: string;
  color: string;
  name: string | null;
  photo: string | null;
  link: string | null;
  flags: string[];
  subtitle?: string | null;
  topic: string;
  bio?: string | null;
  bullets: string[];
}
const active = ref<Speaker | null>(null);

function openModal(s: Speaker) {
  active.value = s;
  document.body.style.overflow = "hidden";
}

function closeModal() {
  active.value = null;
  document.body.style.overflow = "";
}

/* ── Venue modal ────────────────────────────────────────────────────────── */
const sedeModalOpen = ref(false);

/* ── Sponsor modals ─────────────────────────────────────────────────────── */
const sponsorModal = ref<"orthoapnea" | "biologix" | null>(null);

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    closeModal();
    sedeModalOpen.value = false;
    sponsorModal.value = null;
  }
}

onMounted(() => window.addEventListener("keydown", onKeydown));
onUnmounted(() => {
  window.removeEventListener("keydown", onKeydown);
  document.body.style.overflow = "";
});

/* ── Contact perks ───────────────────────────────────────────────────────── */
const contactPerks = [
  "Networking exclusivo con clínicas seleccionadas de CDMX",
  "8 ponentes expertos en medicina del sueño",
  "Metodología NeoSleep 360™ en vivo",
  "Acceso prioritario a la red de clínicas NeoSleep",
] as const;

/* ── Evento contact form ─────────────────────────────────────────────────── */
type EvStatus = "idle" | "loading" | "success" | "error";
const evStatus = ref<EvStatus>("idle");
const phoneError = ref("");
const evForm = reactive({
  firstName: "",
  lastName: "",
  especialidad: "",
  clinica: "",
  phone: "",
  email: "",
});

const MX_PHONE_RE = /^(\+?52\s?)?[1-9]\d{9}$/;

async function onSubmitEvento() {
  phoneError.value = "";
  const digits = evForm.phone.replace(/[\s\-().]/g, "");
  if (!MX_PHONE_RE.test(digits)) {
    phoneError.value = "Ingresa un número válido de México (10 dígitos, ej. 5512345678)";
    return;
  }
  evStatus.value = "loading";
  try {
    const res = await fetch("https://api.web3forms.com/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_key: "669fb922-3b25-4b2c-8d6d-a6bd86b9d5a4",
        subject: `🎤 Evento CDMX 17.06.26 — ${evForm.firstName} ${evForm.lastName} (${evForm.especialidad})`,
        from_name: "NeoSleep Evento CDMX",
        type: "evento-cdmx-17-06-26",
        nombre: evForm.firstName,
        apellido: evForm.lastName,
        especialidad: evForm.especialidad,
        clinica: evForm.clinica,
        telefono: evForm.phone,
        email: evForm.email,
      }),
    });
    const data = (await res.json()) as { success: boolean; message?: string };
    if (!data.success) throw new Error(data.message);
    evStatus.value = "success";
    evForm.firstName = "";
    evForm.lastName = "";
    evForm.especialidad = "";
    evForm.clinica = "";
    evForm.phone = "";
    evForm.email = "";
  } catch {
    evStatus.value = "error";
  }
}

const manifestoRef  = ref<HTMLElement | null>(null);
const splitRef      = ref<HTMLElement | null>(null);
const sistemaRef    = ref<HTMLElement | null>(null);
const ponentesRef   = ref<HTMLElement | null>(null);
const patrocinRef   = ref<HTMLElement | null>(null);
const cierreRef     = ref<HTMLElement | null>(null);
const sedeRef       = ref<HTMLElement | null>(null);
const contactoRef   = ref<HTMLElement | null>(null);

let observer: IntersectionObserver | null = null;

onMounted(() => {
  observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add("home-reveal--visible");
          observer?.unobserve(e.target);
        }
      }
    },
    { threshold: 0.08 }
  );
  for (const el of [manifestoRef, splitRef, sistemaRef, ponentesRef, patrocinRef, cierreRef, sedeRef, contactoRef]) {
    if (el.value) observer.observe(el.value);
  }
});

onUnmounted(() => observer?.disconnect());

const pillars = [
  {
    img: "/images/manifesto/medir.jpg",
    title: "No tratamos sin medir.",
    text: "Cada paciente que llega a una clínica NeoSleep pasa primero por un diagnóstico objetivo. No recomendamos ningún tratamiento si los datos no lo respaldan. Esta disciplina protege al paciente, genera confianza y eleva el estándar clínico de la odontología del sueño.",
  },
  {
    img: "/images/manifesto/ia.jpg",
    title: "Medimos con inteligencia.",
    text: "Nuestra infraestructura integra inteligencia artificial en cada etapa: desde el estudio del sueño en casa hasta la interpretación automatizada de resultados y su entrega al paciente. Reducimos el tiempo entre diagnóstico y tratamiento, eliminando fricciones en el flujo clínico.",
  },
  {
    img: "/images/manifesto/datos.jpg",
    title: "De intuición clínica a medicina basada en datos.",
    text: "La odontología del sueño es aún un territorio inexplorado para muchos dentistas, que desconocen que pueden diagnosticar y tratar la apnea. En NeoSleep, los resultados de cada estudio son la base de todas las decisiones: a quién tratar, cómo hacerlo y cuándo re-evaluar.",
  },
];

const steps = [
  { label: "Diagnóstico con IA", sub: "Biologix" },
  { label: "Revisión médica", sub: "Especializada" },
  { label: "Tratamiento DAM", sub: "NOA by OrthoApnea" },
  { label: "Re-evaluación IA", sub: "Biologix" },
  { label: "Resultado medible", sub: "Clínico y validable" },
] as const;

const speakers: Speaker[] = speakersData as Speaker[];
</script>

<style scoped lang="scss">
/* ── Lazy image loading ───────────────────────────────────────────────────── */
@keyframes ev-shimmer {
  from { background-position: -200% 0; }
  to   { background-position:  200% 0; }
}

.ev-img-lazy {
  opacity: 0;
  transition: opacity 0.45s ease;

  &--loaded { opacity: 1; }
}

.ev-pillar__img-wrap,
.ev-speaker__avatar,
.ev-modal__avatar,
.ev-sede__preview,
.ev-sede-modal__img-wrap,
.ev-sponsor-modal__header {
  background: linear-gradient(
    90deg,
    var(--website-border) 25%,
    color-mix(in srgb, var(--website-border) 60%, var(--website-bg)) 50%,
    var(--website-border) 75%
  );
  background-size: 200% 100%;
  animation: ev-shimmer 1.6s ease-in-out infinite;
}

/* ── Reveal keyframes ─────────────────────────────────────────────────────── */
@keyframes ev-hero-open {
  from {
    clip-path: circle(0% at 50% 30%);
    opacity: 0;
  }
  to {
    clip-path: circle(130% at 50% 30%);
    opacity: 1;
  }
}

@keyframes ev-fade-up {
  from {
    opacity: 0;
    transform: translateY(28px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ── Hero ─────────────────────────────────────────────────────────────────── */
.ev-hero {
  position: relative;
  min-height: calc(100svh - var(--website-header-height));
  display: flex;
  align-items: center;
  background: var(--neosleep-very-dark-teal);
  overflow: hidden;
  animation: ev-hero-open 1s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.ev-hero__arc {
  position: absolute;
  border-radius: 50%;
  border: 1px solid rgba(142, 214, 206, 0.15);
  pointer-events: none;
}
.ev-hero__arc--1 {
  width: 700px;
  height: 700px;
  top: -200px;
  right: -200px;
}
.ev-hero__arc--2 {
  width: 900px;
  height: 900px;
  bottom: -400px;
  left: -300px;
  border-color: rgba(18, 143, 131, 0.12);
}

.ev-hero__content {
  position: relative;
  z-index: 1;
  padding-top: 4rem;
  padding-bottom: 4rem;
}

.ev-eyebrow {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--neosleep-light-teal);
  margin: 0 0 1.25rem;
  animation: ev-fade-up 0.55s 0.55s ease both;
}

.ev-hero__title {
  font-size: clamp(2rem, 5vw, 3.5rem);
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.15;
  color: #ffffff;
  margin: 0 0 2rem;
  max-width: 720px;
  animation: ev-fade-up 0.65s 0.7s ease both;
}

.ev-hero__title-sub {
  display: block;
  font-size: 0.95rem;
  font-weight: 500;
  letter-spacing: 0.04em;
  color: var(--neosleep-light-teal);
  margin-top: 0.75rem;
  opacity: 0.85;
}

.ev-hero__meta {
  display: flex;
  flex-wrap: nowrap;
  gap: 0.5rem;
  margin-bottom: 2.5rem;
  animation: ev-fade-up 0.55s 0.9s ease both;
  overflow-x: auto;
}

.ev-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.875rem;
  border-radius: 9999px;
  border: 1px solid rgba(142, 214, 206, 0.35);
  background: rgba(142, 214, 206, 0.08);
  color: #e0f5f3;
  font-size: 0.875rem;
  font-weight: 500;
}

.ev-hero__cta {
  font-size: 1rem;
  animation: ev-fade-up 0.55s 1.05s ease both;
}

/* ── Manifesto ────────────────────────────────────────────────────────────── */
.ev-manifesto__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.25rem;
  margin-top: 2.5rem;

  @media (max-width: 860px) { grid-template-columns: 1fr; }
}

.ev-pillar {
  background: var(--website-bg);
  border: 1px solid var(--website-border);
  border-radius: var(--website-card-radius);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;

  &:hover {
    border-color: var(--website-primary);
    box-shadow: var(--website-shadow-md);
  }
}

.ev-pillar__img-wrap {
  width: 100%;
  height: 200px;
  overflow: hidden;
  flex-shrink: 0;
}

.ev-pillar__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  display: block;
  transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);

  .ev-pillar:hover & { transform: scale(1.04); }
}

.ev-pillar__body {
  padding: 1.5rem 1.75rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  flex: 1;
}

.ev-pillar__title {
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--website-text);
  line-height: 1.3;
  margin: 0;
}

.ev-pillar__text {
  font-size: 0.9375rem;
  color: var(--website-text-secondary);
  line-height: 1.7;
  margin: 0;
}

/* ── Problema + Oportunidad ──────────────────────────────────────────────── */
.ev-split {
  background: var(--neosleep-very-dark-teal);
  padding: 5rem 0;

  @media (max-width: 1100px) { padding: 3.5rem 0; }
}

.ev-split__inner {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 3rem;
  align-items: start;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
}

.ev-split__divider {
  width: 1px;
  background: rgba(142, 214, 206, 0.2);
  align-self: stretch;
  margin-top: 0.5rem;

  @media (max-width: 768px) {
    display: none;
  }
}

.ev-split__col {
  color: rgba(255, 255, 255, 0.85);
}

.ev-split__col--accent .ev-split__label {
  color: var(--neosleep-light-teal);
}

.ev-split__label {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(142, 214, 206, 0.6);
  margin: 0 0 0.75rem;
}

.ev-split__heading {
  font-size: clamp(1.25rem, 3vw, 1.75rem);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: #ffffff;
  margin: 0 0 1rem;
}

.ev-split__body {
  font-size: 1rem;
  line-height: 1.7;
  color: rgba(255, 255, 255, 0.7);
  margin: 0;

  strong { color: rgba(255, 255, 255, 0.95); }
}

/* ── Sistema 360 ─────────────────────────────────────────────────────────── */
.ev-steps {
  display: flex;
  align-items: flex-start;
  gap: 0;
  margin-top: 3rem;
  overflow-x: auto;
  padding-bottom: 0.5rem;

  @media (max-width: 860px) {
    flex-direction: column;
    overflow-x: visible;
    padding-bottom: 0;
    gap: 0;
    align-items: center;
  }
}

.ev-step {
  flex: 1;
  min-width: 140px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 0.625rem;
  padding: 0 0.5rem;

  @media (max-width: 860px) {
    flex-direction: row;
    align-items: center;
    min-width: 0;
    flex: none;
    width: 100%;
    max-width: 320px;
    padding: 0.625rem 0;
    gap: 1rem;
    text-align: left;
  }
}

.ev-step__num {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--website-primary);
  color: #fff;
  font-size: 1.125rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  @media (max-width: 860px) {
    width: 44px;
    height: 44px;
    font-size: 1.0625rem;
  }
}

.ev-step__text {
  display: contents;

  @media (max-width: 860px) {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }
}

.ev-step__label {
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--website-text);
  margin: 0;
  line-height: 1.3;

  @media (max-width: 860px) {
    font-size: 1rem;
    font-weight: 700;
  }
}

.ev-step__sub {
  font-size: 1rem;
  color: var(--website-primary);
  font-weight: 600;
  margin: 0;

  @media (max-width: 860px) {
    font-size: 0.875rem;
  }
}

.ev-step__arrow {
  display: flex;
  align-items: center;
  padding-bottom: 1.75rem;
  color: var(--website-primary);
  font-size: 1.25rem;
  flex-shrink: 0;
  margin-top: 0.125rem;

  @media (max-width: 900px) { display: none; }
}

/* ── Ponentes ────────────────────────────────────────────────────────────── */
.ev-ponentes {
  background: var(--website-page-frame-bg);
}

.ev-speakers {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1.25rem;
  margin-top: 2.5rem;

  @media (max-width: 960px) { grid-template-columns: repeat(2, 1fr); }
  @media (max-width: 480px) { grid-template-columns: 1fr; }
}

.ev-speaker {
  background: var(--website-bg);
  border: 1px solid var(--website-border);
  border-radius: var(--website-card-radius);
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  transition: box-shadow 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
  text-align: left;

  &:hover {
    box-shadow: var(--website-shadow-md);
    border-color: var(--website-primary);
    transform: translateY(-2px);
  }
}

.ev-speaker--btn {
  cursor: pointer;
  font-family: inherit;
  background: var(--website-bg);
}

.ev-speaker__avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.ev-speaker__person {
  width: 100%;
  height: 100%;
}

.ev-speaker__photo {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center top;
  border-radius: 50%;
  display: block;
}

.ev-speaker__info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.ev-speaker__role {
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--website-primary);
  margin: 0;
}

.ev-speaker__role--teal { margin-top: 0.1rem; }

.ev-speaker__specialty {
  font-size: 1rem;
  font-weight: 700;
  color: var(--website-text);
  margin: 0;
  line-height: 1.3;
}

.ev-speaker__topic {
  font-size: 0.8125rem;
  color: var(--website-text-secondary);
  line-height: 1.55;
  margin: 0.25rem 0 0;
}

.ev-speaker__name-row {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}

.ev-speaker__flags {
  display: flex;
  gap: 5px;
  flex-shrink: 0;
  margin-top: 0.25rem;
}


.ev-speaker__subtitle {
  font-size: 0.75rem;
  color: var(--website-text-secondary);
  margin: 0;
  line-height: 1.4;
}

.ev-speaker__hint {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--website-primary);
  opacity: 0;
  transition: opacity 0.15s ease;

  .ev-speaker:hover & { opacity: 1; }
}

/* ── Modal ───────────────────────────────────────────────────────────────── */
.ev-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 1.5rem;
  overflow-y: auto;
  overflow-x: hidden;
}

.ev-modal {
  position: relative;
  background: var(--website-bg);
  border: 1px solid var(--website-border);
  border-radius: var(--website-card-radius);
  padding: 2.5rem;
  font-family: var(--website-font-sans);
  max-width: 520px;
  width: 100%;
  box-sizing: border-box;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.22);

  @media (max-width: 600px) { padding: 1.75rem 1.5rem; }
}

.ev-modal__close {
  position: absolute;
  top: 1.25rem;
  right: 1.25rem;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid var(--website-border);
  background: var(--website-bg);
  color: var(--website-text-secondary);
  font-size: 0.875rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.15s, color 0.15s;

  &:hover { border-color: var(--website-primary); color: var(--website-primary); }
}

.ev-modal__header {
  display: flex;
  align-items: center;
  gap: 1.25rem;
  margin-bottom: 1.5rem;
}

.ev-modal__avatar {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.ev-modal__person {
  width: 100%;
  height: 100%;
}

.ev-modal__photo {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center top;
  border-radius: 50%;
  display: block;
}

.ev-modal__role {
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--website-primary);
  margin: 0 0 0.25rem;
}

.ev-modal__role--teal { margin-top: 0.2rem; }

.ev-modal__specialty {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--website-text);
  margin: 0;
  line-height: 1.25;
}

.ev-modal__name-row {
  display: flex;
  align-items: flex-start;
  gap: 0.625rem;
  flex-wrap: wrap;
}

.ev-modal__flags {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
  margin-top: 0.3rem;
}

.ev-modal__topic {
  font-size: 1rem;
  line-height: 1.6;
  color: var(--website-text-secondary);
  margin: 0 0 1.5rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid var(--website-border);
}

.ev-modal__bio {
  font-size: 0.9375rem;
  line-height: 1.75;
  color: var(--website-text-secondary);
  margin: 0 0 1.5rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid var(--website-border);
}

.ev-modal__bullets {
  list-style: none;
  margin: 0 0 2rem;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;

  li {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    font-size: 0.9375rem;
    color: var(--website-text);
    line-height: 1.5;
  }
}

.ev-modal__bullet-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--website-primary);
  flex-shrink: 0;
  margin-top: 0.45rem;
}

.ev-modal__speaker-placeholder {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--website-border);
}

.ev-modal__photo-wrap {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--website-page-frame-bg);
  border: 1px dashed var(--website-border);
  flex-shrink: 0;
}

.ev-modal__speaker-name {
  font-size: 0.875rem;
  color: var(--website-text-secondary);
  margin: 0;
  font-style: italic;
}

/* ── Modal transition ────────────────────────────────────────────────────── */
.ev-modal-enter-active { transition: opacity 0.25s ease; }
.ev-modal-leave-active { transition: opacity 0.18s ease; }
.ev-modal-enter-from,
.ev-modal-leave-to  { opacity: 0; }

.ev-modal-enter-active .ev-modal {
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease;
}
.ev-modal-leave-active .ev-modal {
  transition: transform 0.18s ease, opacity 0.18s ease;
}
.ev-modal-enter-from .ev-modal { transform: translateY(1.5rem) scale(0.97); opacity: 0; }
.ev-modal-leave-to  .ev-modal  { transform: translateY(0.5rem); opacity: 0; }

/* ── Cierre ──────────────────────────────────────────────────────────────── */
.ev-cierre {
  position: relative;
  background: var(--neosleep-very-dark-teal);
  padding: 6rem 0;
  overflow: hidden;
  text-align: center;

  @media (max-width: 1100px) { padding: 4rem 0; }
}

.ev-cierre__arc {
  position: absolute;
  width: 600px;
  height: 600px;
  border-radius: 50%;
  border: 1px solid rgba(142, 214, 206, 0.1);
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.ev-cierre__inner {
  position: relative;
  z-index: 1;
  max-width: 660px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.25rem;
}

.ev-cierre__kicker {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--neosleep-light-teal);
  margin: 0;
}

.ev-cierre__heading {
  font-size: clamp(1.75rem, 4vw, 2.75rem);
  font-weight: 800;
  letter-spacing: -0.03em;
  color: #ffffff;
  line-height: 1.15;
  margin: 0;
}

.ev-cierre__body {
  font-size: 1.0625rem;
  color: rgba(255, 255, 255, 0.7);
  line-height: 1.65;
  margin: 0;
}

.ev-cierre__emphasis {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--neosleep-light-teal);
  margin: 0;
}

/* ── Contacto section ────────────────────────────────────────────────────── */
.ev-contacto {
  background: var(--website-bg);
  padding: 5rem 0;

  @media (max-width: 1100px) { padding: 3.5rem 0; }
}

.ev-contacto__wrap {
  display: grid;
  grid-template-columns: 1fr 2.5fr;
  gap: 4rem;
  align-items: start;

  @media (max-width: 860px) {
    grid-template-columns: 1fr;
    gap: 2.5rem;
  }
}

/* ── Left info panel ─────────────────────────────────────────────────────── */
.ev-contacto__info {
  padding-top: 0.5rem;

  @media (max-width: 540px) {
    padding-left: 1.25rem;
    padding-right: 1.25rem;
  }
}

.ev-contacto__heading {
  font-size: clamp(1.375rem, 3vw, 1.875rem);
  font-weight: 700;
  letter-spacing: -0.025em;
  line-height: 1.25;
  color: var(--website-text);
  margin: 0.75rem 0 2rem;
}

.ev-contacto__perks {
  list-style: none;
  margin: 0 0 2.5rem;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.875rem;

  li {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.9375rem;
    color: var(--website-text-secondary);
    line-height: 1.45;
  }
}

.ev-contacto__perk-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--website-primary);
  flex-shrink: 0;
}

.ev-contacto__event-meta {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 0.5rem;

  span {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--website-primary);
    border: 1px solid rgba(18,143,131,0.25);
    border-radius: 9999px;
    padding: 0.25rem 0.75rem;
    background: rgba(18,143,131,0.06);
  }
}

/* ── Right form card ─────────────────────────────────────────────────────── */
.ev-contacto__card {
  background: var(--website-bg);
  border: 1px solid var(--website-border);
  border-radius: var(--website-card-radius);
  padding: 2.75rem 3rem;
  box-shadow: var(--website-shadow-md);

  @media (max-width: 540px) { padding: 1.75rem 1.25rem; }
}

/* ── Form ────────────────────────────────────────────────────────────────── */
.ev-form {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}

.ev-form__row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.875rem;

  @media (max-width: 540px) { grid-template-columns: 1fr; }

  &--full { grid-template-columns: 1fr; }
}

/* ── Floating label field ────────────────────────────────────────────────── */
.ev-field {
  position: relative;
}

.ev-field__input {
  width: 100%;
  height: 3.25rem;
  padding: 1.25rem 0.875rem 0.375rem;
  border-radius: 10px;
  border: 1px solid var(--website-border);
  background: var(--website-bg);
  color: var(--website-text);
  font-size: 0.9375rem;
  font-family: inherit;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  box-sizing: border-box;

  &::placeholder { color: transparent; }

  &:focus {
    outline: none;
    border-color: var(--website-primary);
    box-shadow: 0 0 0 3px rgba(18,143,131,0.1);
  }
}

.ev-field__label {
  position: absolute;
  top: 50%;
  left: 0.875rem;
  transform: translateY(-50%);
  font-size: 0.9375rem;
  color: var(--website-text-secondary);
  pointer-events: none;
  transition: top 0.18s ease, font-size 0.18s ease, color 0.18s ease, transform 0.18s ease;
}

.ev-field__input:focus ~ .ev-field__label,
.ev-field__input:not(:placeholder-shown) ~ .ev-field__label {
  top: 0.6rem;
  transform: none;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--website-primary);
}

/* ── Submit button ───────────────────────────────────────────────────────── */
.ev-form__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.625rem;
  width: 100%;
  height: 3.25rem;
  margin-top: 0.5rem;
  border-radius: 10px;
  border: none;
  background: linear-gradient(135deg, var(--neosleep-primary) 0%, var(--neosleep-darker-teal) 100%);
  color: #fff;
  font-size: 1rem;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  transition: opacity 0.2s ease, transform 0.15s ease;
  letter-spacing: 0.01em;

  &:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
  &:active:not(:disabled) { transform: translateY(0); }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
}

.ev-form__error {
  font-size: 0.875rem;
  color: #f87171;
  margin: 0.25rem 0 0;
  text-align: center;
}

/* ── Success state ───────────────────────────────────────────────────────── */
.ev-contacto__success {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 0.75rem;
  padding: 1rem 0;
}

.ev-contacto__success-icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: rgba(18,143,131,0.08);
  border: 1px solid rgba(18,143,131,0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  color: var(--website-primary);
}

.ev-contacto__success h3 {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--website-text);
  margin: 0;
}

.ev-contacto__success p {
  font-size: 0.9375rem;
  color: var(--website-text-secondary);
  margin: 0;
}

/* ── Success transition ──────────────────────────────────────────────────── */
.ev-form-success-enter-active { transition: opacity 0.35s ease, transform 0.35s ease; }
.ev-form-success-leave-active { transition: opacity 0.2s ease; }
.ev-form-success-enter-from   { opacity: 0; transform: translateY(12px); }
.ev-form-success-leave-to     { opacity: 0; }

.ev-contacto__success-note {
  font-size: 0.875rem;
  color: var(--website-primary);
  margin: 0;
  font-weight: 500;
}

/* ── Phone error ─────────────────────────────────────────────────────────── */
.ev-field__error {
  font-size: 0.75rem;
  color: #e05050;
  margin: 0.25rem 0 0;
  line-height: 1.4;
}

.ev-field__input--error {
  border-color: #e05050 !important;
}

/* ── Patrocinadores ──────────────────────────────────────────────────────── */
.ev-patrocin__label { text-align: center; }

.ev-patrocin__logos {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 3rem;
  margin-top: 2rem;
}

.ev-patrocin__logo-btn {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
}

.ev-patrocin__logo {
  height: 48px;
  width: auto;
  object-fit: contain;
  opacity: 0.75;
  filter: grayscale(0.2);
  transition: opacity 0.2s ease, filter 0.2s ease;

  .ev-patrocin__logo-btn:hover & { opacity: 1; filter: none; }

  &--lg { height: 36px; }
}

/* ── Sponsor modal content ───────────────────────────────────────────────── */
.ev-sponsor-modal__header {
  width: calc(100% + 5rem);
  margin: -2.5rem -2.5rem 0;
  height: 220px;
  overflow: hidden;
  border-radius: var(--website-card-radius) var(--website-card-radius) 0 0;
  flex-shrink: 0;
}

.ev-sponsor-modal__logo {
  height: 52px;
  width: auto;
  object-fit: contain;

  &--product {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
    display: block;
  }
}

.ev-sponsor-modal__name {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--website-text);
  margin: 1.5rem 0 1rem;
  text-align: center;
}

.ev-sponsor-modal__desc {
  font-size: 0.9375rem;
  line-height: 1.75;
  color: var(--website-text-secondary);
  margin: 0 0 0.875rem;
}

.ev-sponsor-modal__link {
  display: inline-block;
  margin-top: 0.5rem;
  color: var(--website-primary);
  font-weight: 600;
  font-size: 0.9375rem;
  text-decoration: none;

  &:hover { text-decoration: underline; }
}

/* ── Sede section ────────────────────────────────────────────────────────── */
.ev-sede {
  width: calc(100% - 2 * var(--website-page-gutter));
  max-width: var(--website-page-max-width);
  margin: 0 auto 2rem;

  @media (max-width: 600px) {
    width: calc(100% - 2 * var(--website-page-gutter-mobile));
  }
}

.ev-sede__inner {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3rem;
  align-items: center;
  padding: 5rem 2.5rem;

  @media (max-width: 860px) {
    grid-template-columns: 1fr;
    padding: 3.5rem 2rem;
    gap: 1.75rem;
  }

  @media (max-width: 600px) {
    padding: 2.5rem 0;
    gap: 1.5rem;
  }
}

.ev-sede__heading {
  font-size: clamp(1.75rem, 3.5vw, 2.5rem);
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.02em;
  color: var(--website-text);
  margin: 0.5rem 0 1.25rem;
}

.ev-sede__body {
  font-size: 1rem;
  line-height: 1.7;
  color: var(--website-text-secondary);
  margin: 0 0 0.875rem;
}

.ev-sede__cta { margin-top: 0.5rem; }

.ev-sede__preview {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  border-radius: 12px;
  overflow: hidden;
  border: none;

  @media (max-width: 600px) {
    border-radius: 0;
    width: calc(100% + 2 * var(--website-page-gutter-mobile));
    margin-left: calc(-1 * var(--website-page-gutter-mobile));
    aspect-ratio: 16 / 9;
  }
  padding: 0;
  cursor: pointer;
  background: var(--website-border);
  flex-shrink: 0;

  @media (max-width: 860px) { aspect-ratio: 16 / 9; }
}

.ev-sede__preview-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  display: block;
  transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);

  .ev-sede__preview:hover & { transform: scale(1.04); }
}

.ev-sede__preview-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0);
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  padding: 1rem 1.25rem;
  transition: background 0.3s ease;

  .ev-sede__preview:hover & { background: rgba(0,0,0,0.3); }
}

.ev-sede__preview-label {
  color: #fff;
  font-size: 0.875rem;
  font-weight: 600;
  opacity: 0;
  transform: translateY(4px);
  transition: opacity 0.3s ease, transform 0.3s ease;

  .ev-sede__preview:hover & { opacity: 1; transform: translateY(0); }
}

/* ── Venue modal ─────────────────────────────────────────────────────────── */
.ev-sede-modal {
  background: var(--website-bg);
  border-radius: 18px;
  width: min(640px, 92vw);
  max-width: 100%;
  box-sizing: border-box;
  font-family: var(--website-font-sans);
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
  box-shadow: 0 24px 80px rgba(0,0,0,0.35);
}

.ev-sede-modal__img-wrap {
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  flex-shrink: 0;
}

.ev-sede-modal__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  display: block;
}

.ev-sede-modal__body {
  padding: 1.5rem 1.75rem 2rem;
}

.ev-sede-modal__name {
  font-size: 1.375rem;
  font-weight: 700;
  color: var(--website-text);
  margin: 0 0 0.375rem;
}

.ev-sede-modal__address {
  font-size: 0.9375rem;
  color: var(--website-text-secondary);
  margin: 0 0 1rem;
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.ev-sede-modal__desc {
  font-size: 0.9375rem;
  line-height: 1.7;
  color: var(--website-text-secondary);
  margin: 0 0 1.25rem;
}

.ev-sede-modal__meta {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;

  span {
    background: rgba(18,143,131,0.07);
    color: var(--website-primary);
    border: 1px solid rgba(18,143,131,0.2);
    border-radius: 6px;
    padding: 0.3rem 0.75rem;
    font-size: 0.8125rem;
    font-weight: 600;
  }
}
</style>
