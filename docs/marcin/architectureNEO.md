# neoCRM — Architektura Techniczna

## Stack technologiczny

### Wersje bibliotek i narzędzi

| Warstwa | Technologia | Wersja | Uzasadnienie |
|---------|------------|--------|--------------|
| **Backend runtime** | Node.js | 20 LTS | Stabilność, ESM, performance |
| **Backend framework** | NestJS | 10.x | TypeScript, modularność, DI, enterprise-ready |
| **Frontend dashboard** | Next.js | 15.x | App Router, RSC, SSR, SEO |
| **Frontend mobile (planowany)** | Swift/SwiftUI | 5.x | Natywna aplikacja iPad |
| **Język** | TypeScript | 5.4.x | Strict mode, no `any` |
| **ORM** | Prisma | 5.10.x | Type-safe queries, migracje |
| **Baza danych** | PostgreSQL | 16 | RLS, JSONB, FTS w j. polskim |
| **Cache / Queue** | Redis | 7.x | Sesje, kolejki BullMQ, pub/sub |
| **Job processing** | BullMQ | 5.x | Przetwarzanie asynchroniczne na Redis |
| **React** | React | 19.0.0 | Concurrent features, Server Components |
| **UI Components** | shadcn/ui + Radix UI | - | Headless, dostępność |
| **Styling** | Tailwind CSS | 3.4.x | Utility-first |
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
│   ├── api/           # NestJS backend (port 3000)
│   ├── web/           # Next.js dashboard (port 3001)
│   └── client-pwa/    # Next.js PWA dla klientów (port 3002)
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
| Pakiet npm | `@neo/api` |

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
| Pakiet npm | `@neo/web` |
| Routing | Next.js App Router | - todo vue

**Cel:** Panel zarządzania dla firm medycznych i farmaceutycznech sprzedajacych swoje produkty. rowniez dla firm ktore ich produkty odsprzedaja. -todo sprawdzic czy to sie zgadza z naszym celem - potwierdzmy to 

**Kluczowe zależności:**
- `next` (15.5), `react` (19), `react-dom` (19) -todo  do zmiany na vue
- `@sentry/nextjs` — monitoring frontend - todo tez vue
- `zustand` — zarządzanie stanem
- `@tanstack/react-query` (5) — data fetching z cache
- `recharts` (3.x) — wykresy i raporty
- `date-fns` (4.x) — operacje na datach
- `lucide-react` — ikony
- `@radix-ui/*` — headless UI (dialog, tabs, select, toast, etc.)
- `tailwindcss` (3.4) + `tailwind-merge` — styling
- `jspdf`, `xlsx` — eksport do PDF/Excel

**Fonty:** DM Sans (body), Space Grotesk (headings) z Google Fonts.

**Build output:** `standalone` (optymalizowany Docker image).

### `apps/client-pwa` — PWA dla klientów

| Atrybut | Wartość |
|---------|---------|
| Port | 3002 |
| Pakiet npm | `@tattoo-spots/client-pwa` |

**Cel:** Uproszczona aplikacja klienta — wizard zapytania, status projektu, płatność zaliczki, akceptacja projektu, upload zdjęć aftercare.

**Zależności:** Minimalne — `next` (15.5), `react` (19), `tailwindcss`, `@radix-ui/react-dialog`, `@radix-ui/react-tabs`, `date-fns`, `lucide-react`. Brak Zustand ani TanStack Query — lżejsza aplikacja.

---

## Pakiety shared

| Pakiet | Opis | Użytkownicy |
|--------|------|-------------|
| `@neo/shared` | Typy TypeScript, DTO, enums współdzielone między API i frontend | api, web, client-pwa |
| `@neo/ui` | Biblioteka komponentów UI (shadcn/ui), transpilowana przez Next.js | web |
| `@neo/config` | Wspólne konfiguracje ESLint, TypeScript, Prettier | wszystkie aplikacje |

---

## Architektura API — NestJS

### Wzorzec modułów

Każda domena biznesowa to oddzielny moduł NestJS z pełnym zestawem: - todo co my mamy? my juz chyba mamy dobrze, wazne zeby uzywalo vue

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
| **Infrastruktura** | CommonModule, ConfigModule, LoggerModule, ThrottleModule, MetricsModule, TracingModule, CacheModule, DatabaseModule, HealthModule |
| **Auth i tożsamość** | AuthModule, WebAuthnModule, ClientAuthModule, TenantModule, UsersModule, StaffModule |
| **Rdzeń biznesowy** | ArtistsModule, ArtistScheduleModule, ClientModule, BookingModule, SessionModule, AvailabilityModule, InquiryModule, ProjectModule, ProjectChatModule, DashboardModule |
| **Płatności i finanse** | PaymentModule, TaxModule, SubscriptionModule, MembershipModule, PackagesModule, GiftCardsModule, ReportsModule |
| **Powiadomienia i komunikacja** | NotificationModule, EmailMarketingModule |
| **Marketing i lojalność** | LoyaltyModule, ReferralModule, PromotionModule, AffiliateModule, ExperimentsModule |
| **AI** | AiModule, AiGeneratorModule, StencilGeneratorModule, ArPreviewModule, ChatbotModule, AiContentModule, SentimentModule, VoiceModule, PredictionsModule |
| **Integracje fakturowania** | FakturownieModule, FakturaXLModule, IFirmaModule, WFirmaModule, InfaktModule |
| **Integracje zewnętrzne** | GoogleBusinessModule, SocialMediaModule |
| **Dostawcy** | SuppliersModule, InventoryModule |
| **Studio i operacje** | StudioModule, BusinessModelModule, ServiceTypesModule, HealthQuestionnairesModule, InsuranceModule, TrainingModule, DateProposalsModule |
| **Sklep i wysyłka** | StudioStoreModule, PrintfulModule, PrintifyModule, MerchStoreModule, ShippingModule, InPostModule, DpdModule |
| **Treści i strony** | BlogModule, LandingPagesModule, PageBuilderModule |
| **Compliance i prawne** | ConsentModule, CookieConsentModule, LegalModule, SignaturesModule |
| **API publiczne i white-label** | PublicApiModule, WhiteLabelModule, MarketplaceModule |
| **Admin i system** | AdminModule, SystemModule, SystemStatusModule |

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

---

## Architektura frontendu — Next.js 15

### App Router i routing

```
apps/web/app/
├── (auth)/
│   ├── login/
│   └── forgot-password/
├── (dashboard)/                ← chroniony layout z sidebarem
│   ├── layout.ts
│   ├── page.ts                ← Kokpit (overview)
│   ├── bookings/
│   │   ├── page.ts
│   │   ├── [id]/page.ts
│   │   └── calendar/page.ts
│   ├── inquiries/
│   │   └── [id]/page.tsx
│   ├── clients/
│   ├── projects/               ← Kanban + lista
│   ├── inventory/
│   ├── calendar/
│   ├── chat/
│   ├── reports/
│   └── settings/               ← 9-kafelkowe centrum ustawień
│       ├── profile/
│       ├── marketing/
│       ├── reports/
│       └── marketplace/
└── (client)/                   ← strony klienta (bez logowania)
    ├── i/[token]/              ← dostęp do inquiry przez magic link
    ├── book/[slug]/            ← wizard rezerwacji
    └── healed/[token]/         ← upload zdjęcia po gojeniu
```

### Konfiguracja Next.js

- `output: 'standalone'` — Docker-friendly build
- `transpilePackages: ['@neo/shared', '@neo/ui']`
- `next-intl` plugin — i18n server-side
- `@sentry/nextjs` — opakowanie całej konfiguracji - todo przerobic  to na vue
- Security headers na wszystkich routach: HSTS, X-Content-Type-Options, X-Frame-Options: DENY, Referrer-Policy
- Optymalizacja obrazów: AVIF + WebP, CDN 
- `optimizePackageImports`: lucide-react, recharts, date-fns / te tlyko dla vue todo

### Wzorce frontendowe

| Wzorzec | Implementacja |
|---------|--------------|
| Auth context | `useAuth()` z `@/lib/auth` |
| Studio context | `useActiveStudio()` z `@/lib/studio` |
| API clients | `apps/web/lib/api/` — `fetch()` z `credentials: 'include'`, nagłówek `x-tenant-id` |
| i18n | `useTranslations('namespace')` z `next-intl`; klucze w `messages/{en,pl}.json` |
| Next.js 15 async params | `params: Promise<{ id: string }>`, resolve przez `useEffect` |
| Feature flags | `apps/web/lib/feature-flags.ts` — kontrola widoczności nawigacji per model biznesowy |

---

## Infrastruktura i deployment

### Topologia wdrożenia (produkcja)

```
Internet
    ↓
CloudFront CDN (statyczne assety z S3)
    ↓
VPS / Cloud Server
    └── Docker Compose
        ├── Traefik v3 (80/443, SSL Let's Encrypt, routing)
        ├── web (:3001)  → app.tattoospots.app
        ├── api (:3000)  → api.tattoospots.app  (replicas: 2)
        ├── postgres (:5432)
        └── redis (:6379)
    ↕
AWS S3 (tattoo-spots-uploads, eu-central-1)
```

### Serwisy Docker Compose

| Serwis | Image | Uwagi |
|--------|-------|-------|
| `traefik` | traefik:v3.0 | Reverse proxy, SSL, load balancing |
| `api` | build: apps/api | 2 repliki, zależy od postgres + redis |
| `web` | build: apps/web | Zależy od api |
| `postgres` | postgres:16-alpine | Volume: postgres_data |
| `redis` | redis:7-alpine | Volume: redis_data |
| `mcp-server` | build: apps/mcp | Zależy od api (planowany) |

### Zmienne środowiskowe (wymagane)

| Kategoria | Zmienne |
|-----------|---------|
| **Baza danych** | `DATABASE_URL` |
| **Redis** | `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` |
| **JWT** | `JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_EXPIRATION` |
| **AWS** | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`, `AWS_REGION` |
| **CDN** | `CDN_DOMAIN`, `CDN_DISTRIBUTION_ID` |
| **Sentry** | `SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` |
| **Stripe** | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| **Przelewy24** | `P24_MERCHANT_ID`, `P24_CRC`, `P24_API_KEY` |
| **SMSAPI** | `SMSAPI_TOKEN`, `SMSAPI_SENDER` |
| **Email** | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` |
| **AI** | `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `STABILITY_API_KEY` |
| **Frontend** | `vue_PUBLIC_APP_URL`, `vue_PUBLIC_API_URL` |

---

## CI/CD — GitHub Actions

### Workflows

| Plik | Trigger | Zadania |
|------|---------|---------|
| `ci.yml` | Push/PR do `main`, `develop` | Lint (ESLint/Prettier) → Unit tests (PostgreSQL + Redis) → Build |
| `deploy-staging.yml` | Push do `develop` | Build → Deploy na staging (auto) → Notify |
| `deploy-production.yml` | Manual (`workflow_dispatch`) | Build → E2E tests (Playwright) → Manual approval → Deploy → Git tag + release → Notify |
| `e2e.yml` | PR, Manual | Playwright tests vs staging |
| `security.yml` | Push do `main`/`develop`, co tydzień | npm audit → SAST scan |
| `rollback.yml` | Manual | Rollback do wskazanej wersji (staging/production) |

### Przepływ do produkcji

```
PR → ci.yml (lint + test + build) → merge to develop
    → deploy-staging.yml (auto)
    → manual trigger deploy-production.yml
        → E2E tests → manual approval → deploy
        → health check → git tag → GitHub release
```

### Środowiska i sekrety

| Środowisko | Sekrety |
|-----------|---------|
| Produkcja | `PRODUCTION_HOST`, `PRODUCTION_USER`, `PRODUCTION_SSH_KEY`, `PRODUCTION_SSH_KNOWN_HOSTS` |
| Staging | `STAGING_HOST`, `STAGING_USER`, `STAGING_SSH_KEY`, `STAGING_SSH_KNOWN_HOSTS` |
| Powiadomienia | `DISCORD_WEBHOOK_URL`, `SLACK_WEBHOOK_URL` |

Migracje bazy danych uruchamiane automatycznie podczas deploymentu: `prisma migrate deploy`.

---

## Bezpieczeństwo

### Autentykacja

#### Staff (artyści, managerowie, właściciele)

| Mechanizm | Szczegóły |
|-----------|-----------|
| Logowanie | Email + hasło (bcrypt, 12 rund) |
| JWT access token | HS256, wygasa po **15 minutach** |
| JWT refresh token | Osobny secret (`JWT_REFRESH_SECRET`), wygasa po **7 dniach** |
| Token rotation | Obowiązkowa przy każdym refresh; wykrycie ponownego użycia unieważnia wszystkie sesje |
| Token blacklist | Redis (natychmiastowe unieważnienie) |
| 2FA | TOTP (opcjonalne), SMS 6-cyfrowy kod |
| WebAuthn | Biometria (Face ID / Touch ID) przez `@simplewebauthn/server` |
| Account lockout | 5 nieudanych prób → blokada 15 minut |
| Rate limiting | 20 prób/5 min per IP, 10 prób/5 min per email |
| Cookie security | `httpOnly: true`, `secure: true` (prod), `sameSite: strict` |

#### Klienci (bezhasłowi)

| Mechanizm | Szczegóły |
|-----------|-----------|
| Magic link | JWT w linku email, jednorazowy |
| Nowe urządzenie | SMS 6-cyfrowy kod weryfikacyjny |
| Device fingerprint | Zapisywany na 30 dni |

#### Public API (integracje zewnętrzne)

Format klucza: `ts_live_<64 hex chars>` (256-bit entropy). Przechowywany jako SHA-256 hash. Trzy poziomy rate limiting: Free (100 req/h), Pro (10 000 req/h), Enterprise (100 000 req/h).

### Autoryzacja RBAC

| Rola | Uprawnienia |
|------|-------------|
| `owner` | Pełny dostęp do wszystkiego |
| `manager` | Personel, raporty, ustawienia; bez billing i zarządzania studiami |
| `receptionist` | Rezerwacje, klienci, kalendarz |
| `artist` | Wyłącznie własne rezerwacje/klienci/kalendarz |
| `accountant` | Dane finansowe i podatkowe |

System 24 granularnych uprawnień z zakresem `:own` vs `:all`. Guards: `JwtAuthGuard`, `RolesGuard`, `PermissionsGuard` — chainowane na poziomie route.

### Izolacja multi-tenancy

Izolacja danych na czterech poziomach:

| Poziom | Mechanizm |
|--------|-----------|
| HTTP request | Nagłówek `X-Tenant-ID` wymagany we wszystkich żądaniach |
| Middleware | `TenantContextMiddleware` → `TenantContextInterceptor` |
| JWT | `tenantId` wbudowany w payload tokena |
| Baza danych | `tenantId` w każdym zapytaniu Prisma; PostgreSQL RLS policy |

Wzorzec SQL: `SET LOCAL app.current_tenant_id = 'uuid'; CREATE POLICY tenant_isolation ON <table> USING (tenant_id = current_setting('app.current_tenant_id')::uuid);`

### Security headers (Helmet)

| Nagłówek | Wartość |
|----------|---------|
| Content-Security-Policy | `default-src 'self'`, strict directives |
| Strict-Transport-Security | `max-age=31536000; includeSubDomains; preload` |
| X-Frame-Options | `DENY` |
| X-Content-Type-Options | `nosniff` |
| Referrer-Policy | `strict-origin-when-cross-origin` |

OWASP Top 10 — audyt: wszystkie kategorie PASS (raport z 2026-01-30, ocena **A**).

---

## Baza danych — PostgreSQL 16

### Kluczowe decyzje projektowe

| Decyzja | Szczegóły |
|---------|-----------|
| Primary keys | UUID (globalnie unikalne, brak sequential leaks) |
| Soft deletes | Kolumna `deleted_at` zamiast fizycznego usuwania |
| Audit columns | `created_at`, `updated_at`, `created_by` wszędzie |
| Elastyczność | JSONB dla ustawień, metadanych, zmiennych schematów |
| Enums | `VARCHAR` (łatwiejsze migracje niż DB enums) |

### Schemat — grupy tabel

| Grupa | Tabele |
|-------|--------|
| Core | tenants, users, artists, clients |
| Booking | bookings, sessions, slot_proposals, waitlist |
| Inquiry | inquiries, projects, design_versions |
| Communication | conversations, messages, quick_replies |
| Payments | payments, invoices, deposits |
| Inventory | products, batches, material_use, shopping_list |
| Sterilization | cycles, instruments, spore_tests |
| Notifications | templates, triggers, logs |
| Auth | access_tokens, verify_codes, devices |

### Strategia indeksowania

```sql
-- Composite index dla izolacji tenanta
CREATE INDEX idx_bookings_tenant_date ON bookings(tenant_id, booking_date);

-- Partial index dla typowych zapytań
CREATE INDEX idx_bookings_upcoming ON bookings(tenant_id, booking_date)
  WHERE status = 'confirmed' AND booking_date > NOW();

-- Full-text search po polsku
CREATE INDEX idx_clients_search ON clients
  USING gin(to_tsvector('polish', first_name || ' ' || last_name || ' ' || email));
```

---

## Cache — Redis 7

### Prefiksy i TTL

| Prefiks | TTL | Zastosowanie |
|---------|-----|--------------|
| `cache:artists:list:` | 300s | Lista artystów per tenant |
| `cache:artists:single:` | 300s | Profil artysty |
| `cache:schedule:` | 60s | Harmonogramy |
| `cache:config:` | 3600s | Statyczna konfiguracja |
| `session:` | 86400s | Sesje użytkowników (staff) |
| token blacklist | Zmienny | Unieważnione JWT |

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
| Bucket | `tattoo-spots-uploads` |
| CDN | CloudFront `cdn.tattoospots.app` |
| Cache-Control | `max-age=31536000, immutable` |

Optymalizacja obrazów przez `sharp`:

| Wariant | Jakość | Szerokość |
|---------|--------|-----------|
| original | 85% JPEG | oryginalna |
| medium | 80% JPEG | 800 px |
| thumbnail | 75% JPEG | 300 px |

Upload plików przez **presigned URLs S3** — klient uploaduje bezpośrednio, bez przez API.

---

## Monitoring i obserwowalność

| Narzędzie | Zastosowanie | Integracja |
|-----------|-------------|------------|
| **Sentry** | Error tracking, performance monitoring | API + Web (React SDK) |
| **OpenTelemetry** | Distributed tracing (OTLP) | `initTracing()` przed bootstrapem NestJS |
| **Prometheus** | Metryki aplikacji (prom-client) | `MetricsModule` |
| **Pino** | Strukturalne logi JSON | `LoggerModule`, `LoggingInterceptor` |
| Health checks | `/api/v1/health/*` | `HealthModule` |

Format log entry:
```json
{
  "requestId": "uuid",
  "method": "POST",
  "url": "/api/v1/bookings",
  "tenantId": "tenant-uuid",
  "userId": "user-uuid",
  "duration": 150,
  "statusCode": 201
}
```

---

## Integracje zewnętrzne

### Płatności

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
| Twilio | SMS (fallback, globalne) | `@nestjs/packages` |

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

*Dokument oparty na analizie repozytorium tattoo-spots-ai (stan: marzec 2026)*
