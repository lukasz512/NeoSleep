# neoSLEEP_v2 - future — Architektura Techniczna

> **Template source**: adapted from marcin's architecture doc (docs/marcin/architecture.md).
> we will use this one as an inspiration
> Live doc: `docs/architecture.md` (keep up to date after every ADR).

---

## Stack technologiczny

### Wersje bibliotek i narzędzi

| Warstwa | Technologia | Wersja | Uzasadnienie |
|---------|------------|--------|--------------|
| **Backend runtime** | Node.js | 20 LTS | Stabilność, ESM, performance |
| **Backend framework** | Vuetify.js | todo check | TypeScript, modularność, DI, enterprise-ready |
| **Frontend dashboard** | Vuetify.js | todo check | App Router, RSC, SSR, SEO |
| **Frontend mobile (planowany)** | Swift/SwiftUI | 5.x | Natywna aplikacja iPad |
| **Język** | TypeScript | 5.4.x | Strict mode, no `any` |
| **ORM** | Prisma | 5.10.x | Type-safe queries, migracje |
| **Baza danych** | PostgreSQL | 16 | RLS, JSONB, FTS w j. polskim |
| **Cache / Queue** | Redis | 7.x | Sesje, kolejki BullMQ, pub/sub |
| **Job processing** | BullMQ | 5.x | Przetwarzanie asynchroniczne na Redis |
| **React** | React | 19.0.0 | Concurrent features, Server Components |
| **UI Components** | shadcn/ui + Radix UI | - | Headless, dostępność |
| **Styling** | SCSS | 3.4.x | Utility-first |
| **State management** | Zustand | 4.5.x | Lekki, prosty |
| **Data fetching** | TanStack Query | 5.x | Cache, revalidacja |
| **i18n** | next-intl | 4.x | PL/EN, App Router native |
| **Storage** | AWS S3 + CloudFront | - | Pliki, zdjęcia, backupy |
| **Monitoring** | Sentry | 10.x | Error tracking, performance |
| **Tracing** | OpenTelemetry | 1.x | Distributed tracing |
| **Metryki** | Prometheus + prom-client | - | Metryki aplikacji |
| **Logging** | Pino | 10.x | Strukturalne logi JSON |
| **E2E testing** | Playwright | 1.58.x | Testy end-to-end |
| **Load testing** | k6 | - | Testy obciążeniowe |
| **Monorepo** | Turborepo | 2.x | Build cache, pipelines |
| **Package manager** | pnpm | 9.x | Wydajność, disk space |
| **Konteneryzacja** | Docker + Docker Compose | 24.x | Dev + deployment |
| **Reverse proxy** | Traefik v3 | 3.x | SSL, routing, load balancing |
| **CI/CD** | GitHub Actions | - | Pipelines PR/deploy |

---

## Struktura monorepo

```
neoCRM/
├── apps/
│   ├── api/           # vue.js backend (port 3000)
│   ├── web/           # Vue.js dashboard (port 3001)
│   └── client-pwa/    # vue.js PWA dla klientów (port 3002)
├── packages/
│   ├── shared/        # Wspólne typy TypeScript
│   ├── ui/            # Komponenty UI (shadcn/ui)
│   └── config/        # Wspólne konfiguracje ESLint/TS
├── infrastructure/    # Docker Compose, nginx, skrypty
├── docs/              # Dokumentacja (arch, specs, wiki)
├── tasks/             # todo.md, lessons.md
├── tests/
│   └── load/          # Scenariusze k6
└── .github/
    └── workflows/     # CI/CD pipelines
```

Zarządzanie zależnościami między paczkami przez **Turborepo** z `workspace:*` w pnpm.

---

## Opis aplikacji

### `apps/api` — Backend NestJS

| Atrybut | Wartość |
|---------|---------|
| Port | 3000 |
| Base URL | `/api/v1/` |
| Dokumentacja | `/api/docs` (Swagger/OpenAPI) |
| Pakiet npm | `@neoCRM/api` |

**Cel:** REST API z logiką biznesową, obsługą multi-tenancy, autentykacją i integracją z zewnętrznymi serwisami.

**Kluczowe zależności:**
- `@nestjs/core`, `@nestjs/common`, `@nestjs/jwt`, `@nestjs/passport` — core framework
- `@prisma/client` (5.10) — ORM
- `bullmq` (5.x) + `ioredis` — kolejki asynchroniczne
- `@anthropic-ai/sdk` (0.71) + `openai` (6.16) — AI APIs
- `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` — storage
- `stripe` (20.x), `firebase-admin` — płatności i push
- `@simplewebauthn/server` — WebAuthn / biometria
- `helmet`, `compression`, `cookie-parser` — middleware bezpieczeństwa
- `pino` — logowanie
- `@opentelemetry/sdk-node` — tracing
- `pdf-lib`, `pdfkit` — generowanie PDF
- `sharp` — przetwarzanie obrazów
- `qrcode` — kody QR (sterylizacja, vouchery)

### `apps/web` — Dashboard Next.js

| Atrybut | Wartość |
|---------|---------|
| Port | 3001 |
| Pakiet npm | `@neoCRM/web` |
| Routing | Next.js App Router |

**Cel:** Panel zarządzania studiem dla personelu (właściciel, manager, artysta, recepcja).

**Kluczowe zależności:**
- vue (3.x), vue-router (4), vite
- vue-i18n — internacjonalizacja PL/EN
- @vueuse/core — dark/light mode
- @sentry/vue — monitoring frontend
- pinia — zarządzanie stanem
- @tanstack/vue-query (5) — data fetching z cache
- vue-chartjs + chart.js
- date-fns (4.x) — operacje na datach
- lucide-vue-next — ikony
- radix-vue — headless UI (dialog, tabs, select, toast, etc.)
- tailwindcss (3.4) + tailwind-merge — styling
- jspdf, xlsx — eksport do PDF/Excel

**Fonty:** DM Sans (body), Space Grotesk (headings) z Google Fonts.

**Build output:** `standalone` (optymalizowany Docker image).

### `apps/client-pwa` — PWA dla klientów

| Atrybut | Wartość |
|---------|---------|
| Port | 3002 |
| Pakiet npm | `@neoCRM/client-pwa` |

**Cel:** Aplikacja klienta  z dostepem rownym co na desktop. Mobile first widoki.

Zależności: Minimalne — vue (3.x), vue-router (4), vite, date-fns, lucide-vue-next. 

---

## Pakiety shared

| Pakiet | Opis | Użytkownicy |
|--------|------|-------------|
| `@neoCRM/shared` | Typy TypeScript, DTO, enums współdzielone między API i frontend | api, web, client-pwa |
| `@neoCRM/ui` | Biblioteka komponentów UI (shadcn/ui), transpilowana przez Next.js | web |
| `@neoCRM/config` | Wspólne konfiguracje ESLint, TypeScript, Prettier | wszystkie aplikacje |

---

## Architektura API

### Wzorzec modułów

Każda domena biznesowa to oddzielny moduł NestJS z pełnym zestawem:

```
src/modules/<nazwa>/
├── <nazwa>.module.ts      # Rejestracja modułu, DI
├── <nazwa>.controller.ts  # Endpointy HTTP, dekoratory
├── <nazwa>.service.ts     # Logika biznesowa
├── dto/                   # Data Transfer Objects (class-validator)
└── entities/              # (opcjonalnie) typy encji
```

Wszystkie serwisy używają `PrismaService` z `DatabaseModule` (nie `DatabaseService`).

### Moduły zarejestrowane w `AppModule`

Poniższa tabela grupuje ~60 modułów widocznych w `app.module.ts`:

| Kategoria | Moduły |
|-----------|--------|
| **Infrastruktura** | CommonModule, ConfigModule, LoggerModule, ThrottleModule, CacheModule, DatabaseModule, MigrationsModule, HealthModule |
| **Auth i tożsamość** | AuthModule, SessionModule, OidcModule (Google), MagicLinkModule (HCP, planned), TenantModule |
| **Użytkownicy i role** | UsersModule, RolesModule, PermissionsModule, PlatformUsersModule |
| **Rdzeń CRM — rep app** | LeadModule, EncounterModule (PCF), PresentationModule, PlannerModule, DashboardModule |
| **Podmioty medyczne** | PractitionerModule (HCP), OrganizationModule (HCO), PatientModule, ReferralModule |
| **Konfiguracja tenanta** | AppConfigModule, FeatureFlagsModule, WhiteLabelModule |
| **Powiadomienia** | PushNotificationModule, EmailModule, WebsiteContactModule |
| **Analityka i raportowanie** | AuditLogModule, DiagnosticsModule, ReportsModule (planned) |
| **i18n i treści** | I18nModule, LookupModule |
| **Compliance i prawne** | ConsentModule, GdprModule, LfpdpppModule (MX) |
| **API publiczne i portale** | PublicApiModule, HcpPortalModule (planned), AdminModule (planned) |

> **Uwaga:** moduły oznaczone `(planned)` czekają na decyzję architektoniczną (np. strategia auth dla HCP). Nie implementować przed ukończeniem Stage 1–3 rep app.

### Przepływ żądania HTTP

```
Request HTTP
    ↓
[CORS, Kompresja, CookieParser]
    ↓
SecuritySanitizationPipe       ← sanityzacja wejścia
    ↓
ValidationPipe                 ← walidacja DTO (class-validator)
    ↓
RequestIdMiddleware            ← X-Request-ID tracking
TenantContextMiddleware        ← wstępne ustawienie kontekstu tenanta
    ↓
SecurityHeadersInterceptor     ← HSTS, CSP, X-Frame-Options
TenantContextInterceptor       ← wyciąga X-Tenant-ID, weryfikuje UUID
LoggingInterceptor             ← loguje request/response (Pino)
    ↓
JwtAuthGuard / ApiKeyGuard     ← autentykacja
RolesGuard / PermissionsGuard  ← autoryzacja RBAC
    ↓
Controller → Service → PrismaService (wszystkie zapytania z tenantId)
    ↓
HttpExceptionFilter            ← sanityzacja błędów (no info leakage)
SentryExceptionFilter          ← monitoring 5xx
    ↓
Response HTTP
```

### Prefiksy API

```
GET    /api/v1/patient
POST   /api/v1/patient
PATCH  /api/v1/patient/:id
DELETE /api/v1/patient/:id

POST   /api/v1/inquiries/wizard/start
POST   /api/v1/inquiries/wizard/step/:step

GET    /api/v1/health          ← health check
GET    /api/docs               ← Swagger UI
```

-
## Cache — Redis 7

### Prefiksy sesji i TTL

NeoSleep nie używa Redisa — stan trzymany jest w `express-session` (in-memory / PostgreSQL store) i ciasteczkach httpOnly.

| Mechanizm | TTL | Zastosowanie |
|-----------|-----|--------------|
| `express-session` (cookie) | Do zamknięcia przeglądarki | Sesja repa po zalogowaniu (email/Google) |
| `remember_me` cookie (HMAC) | 30 dni | "Zapamiętaj mnie" — odtwarza sesję bez ponownego logowania |
| `password_reset_tokens` (DB) | 1 godzina | Token do resetu hasła (hash w tabeli, jednorazowy) |
| `session.state` | Czas trwania OAuth flow | CSRF state dla Google OIDC callback |
| `/api/v1/config/app` response | Brak (brak cache) | Config tenanta — pobierany przy starcie apki |
| `push_subscription` (DB) | Do wypisania | Web Push subskrypcja urządzenia repa |

### Kolejki BullMQ

Główna kolejka: `notifications`

```
Attempts: 3 | Backoff: exponential (60s) | removeOnComplete: 100 | removeOnFail: 1000
```

Przepływ:
```
TriggerService.trigger()
    → Queue.add('notification', jobData)
    → NotificationProcessor.process(job)
        ├── SMS → SmsapiService (SMSAPI.pl)
        ├── Email → EmailService (SMTP/SendGrid)
        └── Push → PushService (Firebase FCM)
    → NotificationLogRepository.create()
```

---

## Storage — AWS S3 + CloudFront

| Parametr | Wartość |
|---------|---------|
| Region | `eu-central-1` |
| Bucket | `neoCRM-uploads` |
| CDN | CloudFront `cdn.neosleepcare.app` |
| Cache-Control | `max-age=31536000, immutable` |

Optymalizacja obrazów przez `sharp`:

| Wariant | Jakość | Szerokość |
|---------|--------|-----------|
| original | 85% JPEG | oryginalna |
| medium | 80% JPEG | 800 px |
| thumbnail | 75% JPEG | 300 px |

Upload plików przez **presigned URLs S3** — klient uploaduje bezpośrednio, bez przez API.

---
monitoring todo

---

## Integracje zewnętrzne

### Płatności w polsce

| Serwis | Przeznaczenie | Region |
|--------|--------------|--------|
| Przelewy24 | BLIK, przelewy bankowe, wszystkie polskie banki | Polska |
| Stripe | Karty międzynarodowe | Globalne |

### Faktury i księgowość

| Serwis | Moduł |
|--------|-------|
| Fakturownia | `FakturownieModule` |
| FakturaXL | `FakturaXLModule` |
| Infakt | `InfaktModule` |
| iFirma | `IFirmaModule` |
| wFirma | `WFirmaModule` |
| KSeF (planowany) | `integrations/ksef` |

### Komunikacja

| Serwis | Kanał | Moduł |
|--------|-------|-------|
| SMSAPI.pl | SMS (PL) | `NotificationModule` |
| Nodemailer / SMTP | Email transakcyjny | `NotificationModule` |
| Firebase FCM | Push notifications | `NotificationModule` |
| Twilio | SMS (fallback, globalne) | `@neo/packages` |

### AI

| Serwis | Model | Zastosowanie |
|--------|-------|-------------|
| Anthropic Claude | claude-3+ | Odpowiedzi na zapytania, wsparcie operatora, MCP |
| OpenAI | GPT-4o | Klasyfikacja, generowanie treści, Vision (materiały) |
| Stability AI | Stable Diffusion | Generowanie projektów tatuażu |
| OpenAI Whisper | Whisper | Transkrypcja głosu (iPad app) |

### Social media i inne

| Serwis | Cel |
|--------|-----|
| Meta Graph API | Facebook Messenger, Instagram DM |
| Google Business | Synchronizacja profilu firmy, recenzje |
| Printful / Printify | Merchandise (studio store) |
| InPost / DPD | Wysyłka (studio store) |

---

*Dokument oparty na analizie repozytorium neoCRM-ai (stan: marzec 2026)*
