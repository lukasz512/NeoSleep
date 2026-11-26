# Integracje zewnętrzne — Tattoo Spots AI

Data analizy: 2026-03-20

---

## 1. Przegląd integracji

| Usługa | Cel | Status | Zmienne env | Uwagi |
|--------|-----|--------|-------------|-------|
| **Stripe** | Płatności międzynarodowe, subskrypcje | Skonfigurowana | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY` | Oficjalny SDK `stripe@20`, webhooks, checkout sessions, BLIK+P24 przez Stripe |
| **Przelewy24 (P24)** | Płatności krajowe (PL) | Skonfigurowana | `P24_MERCHANT_ID`, `P24_POS_ID`, `P24_CRC`, `P24_API_KEY`, `P24_SANDBOX` | REST API, weryfikacja podpisu SHA384, BLIK, karty, Google Pay, Apple Pay |
| **PayPal** | Płatności międzynarodowe | Skonfigurowana | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_MODE` | OAuth2, capture orders, refundy, weryfikacja webhooków |
| **Klarna** | Płatności odroczone (BNPL) | Skonfigurowana | `KLARNA_API_KEY`, `KLARNA_API_SECRET`, `KLARNA_REGION`, `KLARNA_ENVIRONMENT` | EU/NA/OC regiony, playground + production, retry na 5xx |
| **PayU** | Marketplace (prowizje) | Skonfigurowana | `PAYU_CLIENT_ID`, `PAYU_CLIENT_SECRET`, `PAYU_MERCHANT_POS_ID`, `PAYU_SECOND_KEY`, `PAYU_SANDBOX` | Marketplace dla prowizji studia/artysty |
| **AWS S3** | Przechowywanie plików | Skonfigurowana | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_BUCKET` | SDK v3, `@aws-sdk/client-s3`, upload zdjęć i projektów |
| **AWS CloudFront** | CDN | Częściowa | `CDN_ENABLED`, `CDN_DOMAIN`, `CDN_DISTRIBUTION_ID` | Skonfigurowany w kodzie, domyślnie wyłączony (`CDN_ENABLED=false`) |
| **OpenAI** | AI — generowanie treści, analiza | Skonfigurowana | `OPENAI_API_KEY`, `AI_DEFAULT_MODEL`, `AI_MOCK_MODE` | SDK `openai@6`, domyślny provider, model `gpt-4o-mini` |
| **Anthropic** | AI — generowanie treści (alternatywa) | Skonfigurowana | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | SDK `@anthropic-ai/sdk@0.71`, model Claude Sonnet 4 |
| **SendGrid** | E-mail transakcyjny | Skonfigurowana | `SENDGRID_API_KEY`, `EMAIL_FROM`, `EMAIL_FROM_NAME` | REST API v3, domyślny provider email |
| **SMTP** | E-mail transakcyjny (alternatywa) | Skonfigurowana | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_EMAIL` | Nodemailer, wspiera plain/login/OAuth2 |
| **Mailgun** | E-mail transakcyjny (alternatywa) | Skonfigurowana | `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_REGION` | REST API, EU/US region |
| **SMSAPI** | SMS (rynek PL) | Skonfigurowana | `SMSAPI_TOKEN`, `SMSAPI_SENDER`, `SMSAPI_TEST_MODE` | REST API, normalizacja numerów PL, rate limiting, bulk SMS |
| **Twilio** | SMS (rynek globalny) | Skonfigurowana | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` | SDK `twilio@5`, alternatywa dla SMSAPI |
| **Firebase FCM** | Push notifications (mobile) | Skonfigurowana | `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` | `firebase-admin@13`, inicjalizacja przy starcie |
| **Web Push (VAPID)** | Push notifications (przeglądarka) | Skonfigurowana | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | `web-push@3`, TTL 24h domyślnie |
| **Sentry** | Śledzenie błędów (API) | Skonfigurowana | `SENTRY_DSN`, `SENTRY_RELEASE` | `@sentry/node@10`, wyłączony na `development` |
| **Sentry** | Śledzenie błędów (Web) | Skonfigurowana | `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | `@sentry/nextjs@10`, Replay + Feedback |
| **Google Analytics 4** | Analityka web | Częściowa | `NEXT_PUBLIC_GA_MEASUREMENT_ID`, `NEXT_PUBLIC_ENABLE_ANALYTICS` | gtag.js, consent mode, domyślnie wyłączony |
| **Google Business** | Zarządzanie profilem Google Maps | Skonfigurowana | `GOOGLE_BUSINESS_CLIENT_ID`, `GOOGLE_BUSINESS_CLIENT_SECRET` | OAuth2, recenzje, posty lokalne, metryki lokalizacji |
| **Meta (Facebook/Instagram)** | Social media publishing | Skonfigurowana | `META_APP_ID`, `META_APP_SECRET` | Graph API v18, carousel, video reels, insighty |
| **inFakt** | Fakturowanie PL (OAuth2) | Skonfigurowana | `INFAKT_CLIENT_ID`, `INFAKT_CLIENT_SECRET`, `INFAKT_API_URL`, `INFAKT_OAUTH_URL` | OAuth2, sync faktur i klientów, auto-sync po płatności |
| **Fakturownia** | Fakturowanie PL (API token) | Skonfigurowana | `FAKTUROWNIE_API_TOKEN`, `FAKTUROWNIE_ACCOUNT_PREFIX`, `FAKTUROWNIE_SANDBOX` | REST API, faktury, klienci, PDF |
| **FakturaXL** | Fakturowanie PL (XML API) | Skonfigurowana | `FAKTURAXL_API_TOKEN`, `FAKTURAXL_COMPANY_ID` | XML API, faktury VAT, korekty |
| **iFirma** | Fakturowanie PL (HMAC-SHA1) | Skonfigurowana | `IFIRMA_API_KEY`, `IFIRMA_API_USER`, `IFIRMA_INVOICE_TYPE` | HMAC-SHA1 auth, faktury VAT i proforma |
| **wFirma** | Fakturowanie PL (HMAC-SHA256) | Skonfigurowana | `WFIRMA_ACCESS_KEY`, `WFIRMA_SECRET_KEY`, `WFIRMA_APP_KEY`, `WFIRMA_COMPANY_ID` | XML API, HMAC-SHA256, faktury i kontrahenci |
| **OpenTelemetry** | Distributed tracing | Częściowa | `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`, `OTEL_TRACE_SAMPLE_RATE` | SDK `@opentelemetry/*`, eksport do Tempo/Grafana, opcjonalny |

---

## 2. Szczegóły każdej integracji

### Stripe

**Co robi:** Obsługuje płatności kartą, subskrypcje SaaS, checkout sessions (z BLIK i P24 w trybie Stripe). Webhooks dla potwierdzenia płatności.

**Implementacja:**
- Plik: `apps/api/src/payment/stripe.client.ts` — klasa `StripeClient`
- Webhook handler: `apps/api/src/payment/stripe-webhook.controller.ts`
- SDK: `stripe@20.2.0`, API version `2025-12-15.clover`

**Konfiguracja:**
```
STRIPE_SECRET_KEY=sk_...
STRIPE_PUBLISHABLE_KEY=pk_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_...
```

**Status:** W pełni zaimplementowany — payment intents, subscriptions, refunds, customers, checkout sessions, webhook verification.

**Uwagi:** Stripe Checkout Session obsługuje metody `card`, `p24`, `blik`. Timeout sesji: 30 minut.

---

### Przelewy24 (P24)

**Co robi:** Bramka płatnicza dla rynku polskiego. Obsługuje BLIK, karty, przelewy, Google Pay, Apple Pay.

**Implementacja:**
- Plik: `apps/api/src/payment/p24.client.ts` — klasa `P24Client`
- Podpis: SHA384 hashowanie JSON z CRC
- Sandbox URL: `https://sandbox.przelewy24.pl`

**Konfiguracja:**
```
P24_MERCHANT_ID=
P24_POS_ID=
P24_CRC=
P24_API_KEY=
P24_SANDBOX=true
```

**Status:** Zaimplementowany — rejestracja transakcji, weryfikacja, zwroty, pobieranie metod płatności.

**Marketplace P24:** Dodatkowo skonfigurowany marketplace z `P24_MARKETPLACE_ENABLED` i `P24_MARKETPLACE_PLATFORM_MERCHANT_ID`.

---

### PayPal

**Co robi:** Płatności PayPal dla rynku międzynarodowego.

**Implementacja:**
- Plik: `apps/api/src/payment/paypal.client.ts` — klasa `PayPalClient`
- Plik: `apps/api/src/payment/paypal-webhook.controller.ts`
- OAuth2 client credentials, automatyczne odświeżanie tokenu (bufor 5 min)

**Konfiguracja:**
```
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_WEBHOOK_ID=
PAYPAL_MODE=sandbox
```

**Status:** Zaimplementowany — tworzenie zleceń, capture, zwroty, weryfikacja webhooków.

---

### Klarna

**Co robi:** Płatności odroczone (kup teraz, zapłać później) dla rynku EU.

**Implementacja:**
- Plik: `apps/api/src/payment/klarna.client.ts` — klasa `KlarnaClient`
- Plik: `apps/api/src/payment/klarna-webhook.controller.ts`
- Retry na błędy 5xx (max 2 próby z delay)

**Konfiguracja:**
```
KLARNA_API_KEY=
KLARNA_API_SECRET=
KLARNA_REGION=eu
KLARNA_ENVIRONMENT=playground
NEXT_PUBLIC_KLARNA_CLIENT_ID=
```

**Status:** Zaimplementowany — sesje płatności, autoryzacja, capture, refundy, anulowanie.

---

### PayU (Marketplace)

**Co robi:** Obsługa marketplace — podział prowizji między platformę a studio (domyślnie platforma 5%, studio 20%).

**Implementacja:**
- Plik: `apps/api/src/payment/marketplace/providers/payu/payu.client.ts`
- Konfiguracja: `apps/api/src/config/marketplace.config.ts`

**Konfiguracja:**
```
PAYU_CLIENT_ID=
PAYU_CLIENT_SECRET=
PAYU_MERCHANT_POS_ID=
PAYU_SECOND_KEY=
PAYU_SANDBOX=true
MARKETPLACE_DEFAULT_PLATFORM_COMMISSION_PCT=5.00
MARKETPLACE_DEFAULT_STUDIO_COMMISSION_PCT=20.00
```

---

### AWS S3 + CloudFront

**Co robi:** Przechowywanie plików użytkownika — zdjęcia portfolio, projekty tatuaży, zdjęcia artystów. Opcjonalny CDN przez CloudFront.

**Implementacja:**
- Konfiguracja: `apps/api/src/config/storage.config.ts`
- SDK: `@aws-sdk/client-s3@3.975`, `@aws-sdk/client-cloudfront@3.975`, `@aws-sdk/s3-request-presigner`
- Optymalizacja obrazów: `sharp@0.34` — jakość 85/80/75%, rozmiary medium 800px, thumbnail 300px

**Konfiguracja:**
```
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=eu-central-1
S3_BUCKET=tattoo-spots-uploads
CDN_ENABLED=false
CDN_DOMAIN=cdn.tattoo-spots.pl
CDN_DISTRIBUTION_ID=
```

**Status:** CDN jest zaimplementowany w kodzie, ale domyślnie wyłączony.

---

### OpenAI i Anthropic (AI)

**Co robi:** Generowanie treści AI — sugestie dla artystów, asystent do opisów projektów, automatyzacja komunikacji.

**Implementacja:**
- Konfiguracja: `apps/api/src/ai/ai.config.ts`
- Moduł: `apps/api/src/ai/ai.module.ts`
- Rate limiter: `apps/api/src/ai/ai-rate-limiter.service.ts`
- Monitor użycia: `apps/api/src/ai/ai-usage-monitor.service.ts`
- SDKs: `openai@6.16`, `@anthropic-ai/sdk@0.71`

**Konfiguracja:**
```
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-20250514
AI_MOCK_MODE=true
AI_DEFAULT_PROVIDER=openai
AI_DEFAULT_MODEL=gpt-4o-mini
AI_RATE_LIMIT_RPM=100
AI_RATE_LIMIT_TPM=100000
AI_RATE_LIMIT_MAX=60
AI_RATE_LIMIT_WINDOW_MS=60000
AI_CIRCUIT_FAILURE_THRESHOLD=5
AI_CIRCUIT_RESET_TIMEOUT_MS=30000
AI_USAGE_LOG_ENABLED=true
AI_USAGE_ALERT_THRESHOLD_DAILY=1000
```

**Status:** Domyślnie `AI_MOCK_MODE=true` — w trybie deweloperskim AI nie wysyła prawdziwych zapytań. Zaimplementowany circuit breaker i rate limiting. Monitoring użycia z alertami po przekroczeniu progu dziennego.

**Uwaga:** Faktyczne wywołania do OpenAI/Anthropic API wymagają ustawienia `AI_MOCK_MODE=false` i podania kluczy.

---

### E-mail (SendGrid / SMTP / Mailgun)

**Co robi:** Wysyłanie e-maili transakcyjnych — potwierdzenia rezerwacji, faktury, przypomnienia, notyfikacje.

**Implementacja:**
- Fabryka: `apps/api/src/notification/email/email-provider.factory.ts`
- Provider jest wybierany na podstawie `EMAIL_PROVIDER` (domyślnie: `sendgrid`)
- Szablony React Email: `apps/api/src/notification/email/templates/`
- Renderer: `apps/api/src/notification/email-template-renderer.service.ts`
- Biblioteka: `nodemailer@7` (dla SMTP)

**Konfiguracja (SendGrid):**
```
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=
EMAIL_FROM=noreply@tattoospots.pl
EMAIL_FROM_NAME=Tattoo Spots
```

**Konfiguracja (SMTP):**
```
EMAIL_PROVIDER=smtp
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM_EMAIL=
SMTP_FROM_NAME=
SMTP_AUTH_METHOD=plain
```

**Konfiguracja (Mailgun):**
```
EMAIL_PROVIDER=mailgun
MAILGUN_API_KEY=
MAILGUN_DOMAIN=
MAILGUN_REGION=eu
```

**Status:** Trzy providery w pełni zaimplementowane. System weryfikuje połączenie przy starcie aplikacji.

---

### SMS (SMSAPI / Twilio)

**Co robi:** Wysyłanie SMS-ów — przypomnienia o wizytach, weryfikacja telefonu, powiadomienia.

**Implementacja SMSAPI:**
- Plik: `apps/api/src/notification/sms/smsapi.service.ts`
- Normalizacja numerów polskich (+48)
- Rate limiting: 60/min, 1000/h, 10000/dzień
- Bulk SMS w paczkach po 100
- Monitoring kosztów (punkty → PLN, ~0.07 PLN/punkt)

**Implementacja Twilio:**
- Plik: `apps/api/src/notification/sms.service.ts`
- SDK: `twilio@5.12`

**Konfiguracja (SMSAPI):**
```
SMSAPI_TOKEN=
SMSAPI_SENDER=TattooSpots
SMSAPI_TEST_MODE=false
SMSAPI_RATE_LIMIT_MINUTE=60
SMSAPI_RATE_LIMIT_HOUR=1000
SMSAPI_RATE_LIMIT_DAY=10000
```

**Konfiguracja (Twilio):**
```
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
```

**Status:** Oba dostawcy zaimplementowani. SMSAPI jest priorytetowy dla rynku PL. Twilio jako globalna alternatywa.

---

### Firebase FCM i Web Push

**Co robi:** Push notifications — powiadomienia w przeglądarce (Web Push/VAPID) i na telefonie (Firebase Cloud Messaging).

**Implementacja FCM:**
- Plik: `apps/api/src/notification/fcm.config.ts`
- SDK: `firebase-admin@13.6`
- Uwaga: FCM używa zmiennych `FCM_PROJECT_ID` itp., różnych od `FIREBASE_*` w root `.env.example`

**Implementacja Web Push:**
- Plik: `apps/api/src/notification/web-push.config.ts`
- Biblioteka: `web-push@3.6`
- TTL domyślnie: 24h
- Automatyczne czyszczenie wygasłych subskrypcji (status 404/410)

**Konfiguracja FCM:**
```
FCM_PROJECT_ID=
FCM_CLIENT_EMAIL=
FCM_PRIVATE_KEY=
```

**Konfiguracja Web Push:**
```
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:contact@tattoospots.pl
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
```

**Uwaga:** Root `.env.example` używa `FIREBASE_PROJECT_ID`, ale kod faktycznie czyta `FCM_PROJECT_ID`. Rozbieżność do poprawienia.

---

### Sentry (monitorowanie błędów)

**Co robi:** Śledzenie błędów i wyjątków w runtime — zarówno na backendzie (NestJS) jak i frontendzie (Next.js).

**Implementacja API:**
- Plik: `apps/api/src/sentry.config.ts` — funkcja `initSentry()`
- Integracje: HTTP + Express
- Wyłączony w środowisku `development`

**Implementacja Web:**
- Pliki: `apps/web/sentry.client.config.ts`, `apps/web/sentry.server.config.ts`
- Funkcje: Session Replay (10%), Error Replay (100%), Feedback widget
- SDK: `@sentry/nextjs@10.37`

**Konfiguracja:**
```
SENTRY_DSN=
SENTRY_RELEASE=
NEXT_PUBLIC_SENTRY_DSN=
NEXT_PUBLIC_SENTRY_RELEASE=
SENTRY_ORG=tattoo-spots
SENTRY_PROJECT=tattoo-spots-web
SENTRY_AUTH_TOKEN=
```

---

### Google Analytics 4

**Co robi:** Analityka zachowań użytkowników na stronie webowej.

**Implementacja:**
- Plik: `apps/web/lib/analytics/gtag.ts`
- Consent mode — GA ładowany dopiero po akceptacji przez użytkownika
- Domyślnie wyłączony flagą `NEXT_PUBLIC_ENABLE_ANALYTICS=false`

**Konfiguracja:**
```
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
NEXT_PUBLIC_ENABLE_ANALYTICS=false
```

---

### Google Business

**Co robi:** Zarządzanie profilem Google Maps/Business — aktualizacja danych lokalizacji, posty lokalne, odpowiedzi na recenzje, analityka.

**Implementacja:**
- Plik: `apps/api/src/integrations/google-business/google-business.client.ts`
- OAuth2 z odświeżaniem tokenów
- API: `mybusinessbusinessinformation.googleapis.com/v1`, `mybusiness.googleapis.com/v4`

**Konfiguracja:**
```
GOOGLE_BUSINESS_CLIENT_ID=
GOOGLE_BUSINESS_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/v1/integrations/google/callback
```

**Status:** Pełna implementacja — konta, lokalizacje, posty, recenzje, metryki. Tokeny przechowywane w bazie danych per tenant.

---

### Meta (Facebook + Instagram)

**Co robi:** Automatyczne publikowanie postów i relacji na Facebook Pages i Instagram Business.

**Implementacja:**
- Plik: `apps/api/src/integrations/social-media/social-media.client.ts`
- Plik: `apps/api/src/integrations/social-media/social-media.scheduler.ts`
- Graph API v18.0
- Zakres uprawnień: `pages_manage_posts`, `instagram_content_publish`, `instagram_manage_insights`

**Konfiguracja:**
```
META_APP_ID=
META_APP_SECRET=
```

**Status:** Zaimplementowane — posty tekstowe i ze zdjęciami na Facebook, posty/reels/karuzele na Instagram, insighty (zasięgi, reakcje), schedulowanie.

---

### OpenTelemetry (Distributed Tracing)

**Co robi:** Śledzenie rozproszonych śladów (traces) — diagnostyka wydajności, integracja z Grafana Tempo.

**Implementacja:**
- Plik: `apps/api/src/instrumentation.ts`
- SDK: `@opentelemetry/sdk-node@0.212`, eksport OTLP HTTP
- Auto-instrumentacja HTTP, Express, Prisma (ignoruje /health i /metrics)

**Konfiguracja:**
```
OTEL_EXPORTER_OTLP_ENDPOINT=http://tempo:4318
OTEL_SERVICE_NAME=tattoo-spots-api
OTEL_TRACE_SAMPLE_RATE=0.1
```

**Status:** Opcjonalny — aktywowany tylko gdy `OTEL_EXPORTER_OTLP_ENDPOINT` jest ustawiony.

---

## 3. inFakt

inFakt to polska platforma do wystawiania faktur, z którą system jest zintegrowany przez OAuth2.

### Architektura

| Komponent | Plik |
|-----------|------|
| Klient HTTP | `apps/api/src/infakt/infakt.client.ts` (`InfaktApiClient`) |
| Logika biznesowa | `apps/api/src/infakt/infakt.service.ts` (`InfaktService`) |
| Kontroler REST | `apps/api/src/infakt/infakt.controller.ts` |
| Typy/interfejsy | `apps/api/src/infakt/infakt.interface.ts` |
| Moduł NestJS | `apps/api/src/infakt/infakt.module.ts` |

### Przepływ OAuth2

1. Studio inicjuje połączenie — `GET /api/v1/infakt/auth` generuje URL autoryzacji inFakt
2. inFakt przekierowuje do callbacku — `GET /api/v1/infakt/callback`
3. System wymienia kod na tokeny access + refresh, przechowuje w `InfaktConnection` w bazie
4. Tokeny są automatycznie odświeżane przy każdym żądaniu (bufor 5 minut przed wygaśnięciem)

### Dane przechowywane w bazie

- `InfaktConnection` — tokeny OAuth2, stan połączenia, auto-sync, data ostatniej synchronizacji
- `InfaktClient` — mapowanie: klient systemu ↔ klient inFakt (po ID)
- `InfaktInvoice` — mapowanie: faktura systemu ↔ faktura inFakt + numer faktury + URL PDF
- `InfaktProduct` — lista produktów zsynchronizowanych z inFakt
- `InfaktSyncLog` — pełny log synchronizacji (typ encji, kierunek push/pull, status)

### Funkcjonalności

**Synchronizacja klientów (push):**
- `syncClient(tenantId, clientId)` — tworzy lub aktualizuje klienta w inFakt
- Dane: imię, nazwisko, email, telefon

**Synchronizacja faktur (push):**
- `syncInvoice(tenantId, invoiceId, sendEmail)` — tworzy fakturę w inFakt
- Automatycznie synchronizuje klienta jeśli brak mapowania
- Opcja wysłania faktury e-mailem do klienta przez inFakt
- Konwersja stawek VAT: 23/8/5/0% → symbole inFakt
- Pobieranie URL PDF faktury

**Oznaczanie jako zapłacona:**
- `markInvoicePaid(tenantId, invoiceId)` — aktualizuje status w inFakt

**Auto-sync:**
- `handlePaymentCompleted(tenantId, paymentId)` — wywołany po zakończeniu płatności, automatycznie synchronizuje fakturę i oznacza jako zapłaconą (tylko gdy `autoSync=true`)

**Synchronizacja produktów (pull):**
- `syncProducts(tenantId)` — pobiera produkty z inFakt do lokalnej bazy

### Konfiguracja

```
INFAKT_CLIENT_ID=
INFAKT_CLIENT_SECRET=
INFAKT_API_URL=https://api.infakt.pl/v3
INFAKT_OAUTH_URL=https://app.infakt.pl/oauth
APP_BASE_URL=https://api.tattoospots.pl
```

### Potencjalne problemy

- Tokeny OAuth2 wygasają — kod odświeża je automatycznie, ale jeśli refresh token wygaśnie (inFakt: zwykle 30 dni bez użycia), konieczne jest ponowne połączenie przez użytkownika
- Brak synchronizacji wstecznej faktur istniejących przed integracją
- `sendEmail` wysyła e-mail przez inFakt — jeśli klient nie ma adresu email, ta opcja jest cicho pomijana

---

## 4. Pozostałe systemy fakturowania polskiego

System obsługuje **pięć** alternatywnych polskich platform fakturowania. Wszystkie mają identyczną strukturę modułu (client + service + controller). Firmy mogą wybrać jeden z nich.

### Fakturownia

- Plik: `apps/api/src/integrations/fakturownia/fakturownia.client.ts`
- Autoryzacja: API token w parametrze `api_token`
- URL: `https://{account_prefix}.fakturownia.pl`
- Konfiguracja: `FAKTUROWNIE_API_TOKEN`, `FAKTUROWNIE_ACCOUNT_PREFIX`, `FAKTUROWNIE_SANDBOX`
- Funkcje: faktury, klienci, PDF, wysyłka e-mail, oznaczanie jako zapłacona

### FakturaXL

- Plik: `apps/api/src/integrations/fakturaxl/fakturaxl.client.ts`
- Protokół: XML API (POST na `https://program.fakturaxl.pl/api/`)
- Konfiguracja: `FAKTURAXL_API_TOKEN`, `FAKTURAXL_COMPANY_ID`
- Funkcje: faktury VAT, faktury korygujące, klienci, PDF, wysyłka e-mail
- Specyfika: komunikacja przez XML, niestandardowe parsowanie odpowiedzi

### iFirma

- Plik: `apps/api/src/integrations/ifirma/ifirma.client.ts`
- Autoryzacja: HMAC-SHA1 (klucz hex, podpisuje URL + user + typ + body)
- URL: `https://www.ifirma.pl/iapi`
- Konfiguracja: `IFIRMA_API_KEY`, `IFIRMA_API_USER`, `IFIRMA_INVOICE_TYPE`
- Funkcje: faktury VAT i proforma, klienci, produkty/usługi, PDF, wysyłka e-mail

### wFirma

- Plik: `apps/api/src/integrations/wfirma/wfirma.client.ts`
- Autoryzacja: HMAC-SHA256 (trzy klucze: access, secret, app)
- URL: `https://api2.wfirma.pl`
- Protokół: XML
- Konfiguracja: `WFIRMA_ACCESS_KEY`, `WFIRMA_SECRET_KEY`, `WFIRMA_APP_KEY`, `WFIRMA_COMPANY_ID`, `WFIRMA_INVOICE_TYPE`
- Funkcje: faktury VAT i proforma, faktury korygujące, kontrahenci, produkty (towary/usługi), PDF, wysyłka e-mail

---

## 5. Wymagane klucze API

Poniżej kompletna lista zmiennych środowiskowych potrzebnych do działania wszystkich integracji w środowisku produkcyjnym.

### Infrastruktura podstawowa (wymagane)
```
DATABASE_URL=
REDIS_URL=
JWT_SECRET=
JWT_REFRESH_SECRET=
APP_BASE_URL=
CORS_ORIGINS=
```

### Płatności
```
# Stripe (primary)
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# Przelewy24 (PL)
P24_MERCHANT_ID=
P24_POS_ID=
P24_CRC=
P24_API_KEY=
P24_SANDBOX=false

# PayPal
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_WEBHOOK_ID=
PAYPAL_MODE=live

# Klarna
KLARNA_API_KEY=
KLARNA_API_SECRET=
KLARNA_REGION=eu
KLARNA_ENVIRONMENT=production
NEXT_PUBLIC_KLARNA_CLIENT_ID=

# PayU Marketplace
PAYU_CLIENT_ID=
PAYU_CLIENT_SECRET=
PAYU_MERCHANT_POS_ID=
PAYU_SECOND_KEY=
PAYU_SANDBOX=false
P24_MARKETPLACE_ENABLED=false
P24_MARKETPLACE_PLATFORM_MERCHANT_ID=
MARKETPLACE_DEFAULT_PLATFORM_COMMISSION_PCT=5.00
MARKETPLACE_DEFAULT_STUDIO_COMMISSION_PCT=20.00
```

### AI
```
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-20250514
AI_MOCK_MODE=false
AI_DEFAULT_PROVIDER=openai
AI_DEFAULT_MODEL=gpt-4o-mini
AI_RATE_LIMIT_RPM=100
AI_RATE_LIMIT_TPM=100000
AI_USAGE_LOG_ENABLED=true
AI_USAGE_ALERT_THRESHOLD_DAILY=1000
```

### Storage
```
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=eu-central-1
S3_BUCKET=tattoo-spots-uploads
CDN_ENABLED=false
CDN_DOMAIN=
CDN_DISTRIBUTION_ID=
```

### E-mail
```
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=
EMAIL_FROM=noreply@tattoospots.pl
EMAIL_FROM_NAME=Tattoo Spots
# Alternatywa SMTP:
# EMAIL_PROVIDER=smtp
# SMTP_HOST=
# SMTP_PORT=587
# SMTP_USER=
# SMTP_PASS=
# Alternatywa Mailgun:
# EMAIL_PROVIDER=mailgun
# MAILGUN_API_KEY=
# MAILGUN_DOMAIN=
# MAILGUN_REGION=eu
```

### SMS
```
# SMSAPI (PL, priorytetowy)
SMSAPI_TOKEN=
SMSAPI_SENDER=TattooSpots
SMSAPI_TEST_MODE=false
# Twilio (globalny)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
```

### Push notifications
```
# Firebase FCM
FCM_PROJECT_ID=
FCM_CLIENT_EMAIL=
FCM_PRIVATE_KEY=
# Web Push (VAPID)
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
```

### Monitorowanie
```
SENTRY_DSN=
SENTRY_RELEASE=
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_ORG=
SENTRY_PROJECT=
SENTRY_AUTH_TOKEN=
# OpenTelemetry (opcjonalne)
OTEL_EXPORTER_OTLP_ENDPOINT=http://tempo:4318
OTEL_SERVICE_NAME=tattoo-spots-api
```

### Google Analytics
```
NEXT_PUBLIC_GA_MEASUREMENT_ID=
NEXT_PUBLIC_ENABLE_ANALYTICS=false
```

### Integracje marketingowe
```
# Google Business
GOOGLE_BUSINESS_CLIENT_ID=
GOOGLE_BUSINESS_CLIENT_SECRET=
# Meta (Facebook/Instagram)
META_APP_ID=
META_APP_SECRET=
```

### Fakturowanie (wybrać jeden z pięciu)
```
# inFakt (OAuth2)
INFAKT_CLIENT_ID=
INFAKT_CLIENT_SECRET=
# Fakturownia
FAKTUROWNIE_API_TOKEN=
FAKTUROWNIE_ACCOUNT_PREFIX=
# FakturaXL
FAKTURAXL_API_TOKEN=
FAKTURAXL_COMPANY_ID=
# iFirma
IFIRMA_API_KEY=
IFIRMA_API_USER=
# wFirma
WFIRMA_ACCESS_KEY=
WFIRMA_SECRET_KEY=
WFIRMA_APP_KEY=
WFIRMA_COMPANY_ID=
```

---

## 6. Brakujące integracje

### Rozbieżność nazw zmiennych Firebase

Root `.env.example` definiuje `FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL`, ale kod w `apps/api/src/notification/fcm.config.ts` czyta `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`. Zmienne z root `.env.example` nie są czytane przez żaden kod — to błąd dokumentacji.

### Twilio — brak w `.env.example`

Twilio jest zainstalowany (`twilio@5`) i używany w `sms.service.ts`, ale zmienne `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` nie pojawiają się w żadnym pliku `.env.example`. Wymagają ręcznego dodania.

### Mailgun — brak w `.env.example`

Mailgun jest w pełni zaimplementowany jako provider email, ale `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_REGION` nie są udokumentowane w plikach `.env.example`.

### Brakująca migracja bazy danych

Pole `Project.rejectedAt` jest używane w kodzie dashboardu (`pendingDesigns`/`rejectedDesigns`), ale migracja `prisma migrate dev --name add-project-rejected-at` nie została wykonana (info z memory projektu).

### Slack (alerty infrastrukturalne)

`SLACK_WEBHOOK_URL` pojawia się w `infrastructure/docker/.env.production.example` dla Alertmanager/Grafana, ale nie jest zintegrowany z kodem aplikacji (tylko na poziomie infrastruktury monitoringu).

### Brak integracji z systemami kurierskimi

Kod frontendu (`apps/web/lib/api/shipments.ts`, strona `shipments/page.tsx`) sugeruje funkcjonalność wysyłki merchu studia, ale brak implementacji backendowej integracji z kurierami (InPost, DHL, DPD itp.).

### Web Vitals — niekompletna integracja backend

`apps/web/lib/analytics/web-vitals.ts` i `apps/web/lib/api/monitoring.ts` są zaimplementowane, ale endpoint `/api/v1/monitoring/web-vitals` (lub podobny) nie był widoczny wśród przeanalizowanych modułów backendowych.
