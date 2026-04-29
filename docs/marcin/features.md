# Tattoo Spots AI — Katalog funkcji

> Ostatnia aktualizacja: 2026-03-20
> Podstawa oceny: analiza kodu w `apps/api/src/` i `apps/web/app/`

---

## Legenda statusów

| Status | Definicja |
|--------|-----------|
| **Kompletny** | Backend + frontend + testy, działa end-to-end |
| **Częściowy** | Część implementacji istnieje (np. backend bez frontendu lub logika niepełna) |
| **Zaślepka** | Katalog/pliki istnieją, ale zawierają stub / TODO / niedziałający kod |
| **Brakujący** | Wzmiankowany, ale brak implementacji |

---

## 1. Uwierzytelnianie i użytkownicy

| Funkcja | Status | Opis | Co działa | Co nie działa | Zależności |
|---------|--------|------|-----------|---------------|------------|
| Login email/hasło | **Kompletny** | JWT + HttpOnly cookies, bcrypt, rate limiting | Login, logout, refresh token, blacklisting tokenów | — | Redis (blacklist), PostgreSQL |
| Rejestracja | **Kompletny** | Multi-tenant, walidacja e-mail | Rejestracja z tenantId | — | — |
| Odświeżanie tokenu | **Kompletny** | Osobna usługa `RefreshTokenService` | Rotate refresh tokenów, cookie-based | — | Redis |
| Bezpieczeństwo logowania | **Kompletny** | Rate limiting, blokada konta, logowanie prób | Detekcja brute-force, IP-based throttling | — | `LoginSecurityService` |
| WebAuthn (Passkeys) | **Kompletny** | `webauthn/webauthn.service.ts` + controller + testy | Rejestracja i logowanie biometryczne | — | `@simplewebauthn` |
| Biometryczne potwierdzenie | **Kompletny** | `biometric-confirmation.service.ts` | Potwierdzanie wrażliwych akcji | — | WebAuthn |
| Magic link (client auth) | **Kompletny** | `client-auth` module, szablon e-mail | Generowanie i walidacja jednorazowych linków | — | E-mail |
| Ustawienia konta (web) | **Częściowy** | `/settings/security/page.tsx`, `/settings/profile/page.tsx` | Strony istnieją z logiką UI | Brak pełnego wiring'u zmiany hasła w profilu artysty | — |

---

## 2. Booking i harmonogram

| Funkcja | Status | Opis | Co działa | Co nie działa | Zależności |
|---------|--------|------|-----------|---------------|------------|
| Tworzenie rezerwacji | **Kompletny** | `booking.service.ts` — walidacja konfliktów, 6 typów serwisów | CRUD, walidacja nakładania się slotów, depozyt | — | `availability`, `health-questionnaires` |
| Status rezerwacji | **Kompletny** | Zarządzanie przejściami stanu (FSM) | Przejścia PENDING→CONFIRMED→COMPLETED etc. | — | — |
| Kaucja (depozyt) | **Kompletny** | Rejestracja wpłaty depozytu | Zapis kwoty depozytu, powiązanie z płatnością | — | `payment` |
| Lista i filtrowanie rezerwacji | **Kompletny** | Paginated query z filtrami | Filtrowanie po artyście, dacie, statusie | — | — |
| Sprawdzanie konfliktów | **Kompletny** | `findConflictingBookings` | Weryfikacja w bazie przed zapisem | — | — |
| Podpisanie formularza zgody | **Kompletny** | `SignConsentFormDto`, `bookingService.signConsentForm` | Powiązanie podpisu z rezerwacją | — | `signatures` |
| Widok kalendarza (web) | **Kompletny** | `/calendar/page.tsx` — pełny UI z DnD | Tworzenie rezerwacji, klienci z API, 6 typów | — | `bookings` API |
| Widok listy rezerwacji (web) | **Kompletny** | `/bookings/page.tsx` + `[id]/page.tsx` | Podgląd, zmiana statusu | — | — |
| Google Calendar sync | **Kompletny** | `google-calendar.service.ts` + OAuth2 | Import/export zdarzeń, wymiana kodu OAuth | — | Google API |
| iCal feed | **Kompletny** | `ical.service.ts` + controller | Generowanie i subskrypcja feedu .ics | — | — |
| Dostępność artysty | **Kompletny** | `availability.service.ts` — godziny pracy, wyjątki | CRUD tygodniowego harmonogramu, override'y dat | — | — |
| Harmonogram artysty | **Kompletny** | `artist-schedule.service.ts` — template'y tygodniowe | Tygodniowy plan pracy z przerwami | — | — |
| Propozycje dat | **Kompletny** | `date-proposals` — backend + client PWA | Tworzenie, akceptacja/odrzucenie, wygasanie | — | `session`, `project` |
| Lista oczekujących | **Kompletny** | `waitlist.service.ts` + controller + testy | CRUD, awansowanie z listy | — | — |
| Publiczny formularz rezerwacji | **Zaślepka** | `/app/booking/page.tsx` | UI formularz istnieje | Zakodowane na sztywno dane artystów (`ARTISTS = [{id:'1', name:'Anna Kowalska'}]`), brak prawdziwego API call | — |

---

## 3. Zarządzanie artystami i personelem

| Funkcja | Status | Opis | Co działa | Co nie działa | Zależności |
|---------|--------|------|-----------|---------------|------------|
| CRUD artystów | **Kompletny** | `artists.service.ts` + controller + testy | Tworzenie, edycja, dezaktywacja artysty | — | — |
| Upload zdjęcia artysty | **Kompletny** | `photoUrl` na modelu Artist | Przesyłanie i zapis URL zdjęcia | — | `storage` |
| Zarządzanie personelem | **Kompletny** | `staff.service.ts` — zaproszenia, role, transfery | Zaproszenie via e-mail, zmiana roli, transfer między studiami | — | E-mail |
| Profil artysty (web) | **Kompletny** | `/settings/profile/page.tsx` | Edycja danych, awatar | — | `artist-profile` API |
| Ustawienia marketingowe artysty | **Kompletny** | `/settings/marketing/page.tsx` | Konfiguracja profilu publicznego | — | — |
| Raporty artysty | **Częściowy** | `/settings/reports/page.tsx` | Strona UI istnieje | Brak pewności pełnego wiring'u z `/reports` API | `reports` |
| Certyfikaty artysty | **Kompletny** | `training.service.ts` — certyf. i kursy | Typy certyfikatów, przypisanie do artysty, weryfikacja | — | — |
| Ustawienia social media artysty | **Częściowy** | `/artist/settings/social/page.tsx` | Strona UI istnieje | Powiązanie z integracją social media niejasne | `integrations/social-media` |
| Strona artysty (page-builder) | **Kompletny** | `artist-page.service.ts` + `studio-page.service.ts` | Budowanie i publikacja stron | — | `public-api` |

---

## 4. Zarządzanie klientami

| Funkcja | Status | Opis | Co działa | Co nie działa | Zależności |
|---------|--------|------|-----------|---------------|------------|
| CRUD klientów | **Kompletny** | `client.service.ts` + controller + testy | Tworzenie, edycja, wyszukiwanie, tagowanie | — | — |
| Lista klientów (web) | **Kompletny** | `/clients/page.tsx` + `[id]/page.tsx` + `new` + `edit` | Pełny CRUD w UI | — | `clients` API |
| Portal klienta (client PWA) | **Częściowy** | `apps/client-pwa/` — Next.js PWA | Podgląd projektu, chat, designs, wycena, propozycje dat | Tylko kilka ekranów — brak pełnej historii rezerwacji, płatności, profilowania | `project-chat`, `date-proposals` |
| Formularze zdrowotne | **Kompletny** | `health-questionnaire.service.ts` — 3 szablony (tattoo, piercing, laser) | CRUD kwestionariuszy, walidacja wymagań bookingu | — | `booking` |
| Podpisy elektroniczne | **Kompletny** | `signatures.service.ts` + biometryczna kalkulacja | Zbieranie i weryfikacja podpisów | — | — |
| Historia klienta | **Kompletny** | Backend: powiązane bookings + projekty | Pobieranie danych | Strona `[id]/page.tsx` pobiera z API | — |
| GDPR eksport danych klienta | **Kompletny** | `gdpr-export.service.ts` | Generowanie paczki danych klienta | — | `consent` |

---

## 5. Projekty i workflow

| Funkcja | Status | Opis | Co działa | Co nie działa | Zależności |
|---------|--------|------|-----------|---------------|------------|
| CRUD projektów | **Kompletny** | `project.service.ts` + testy | Tworzenie, update, zarządzanie statusem, odrzucenie | — | — |
| Upload designów do projektu | **Kompletny** | `design-upload.service.ts` + controller | Przesyłanie plików z projektem | — | — |
| Chat projektu | **Kompletny** | `project-chat` — backend + client PWA `ChatPanel` | Wiadomości real-time, zdjęcia, lightbox | — | — |
| Kanban projektów (web) | **Kompletny** | `/projects/page.tsx` — toggle widoku + DnD | Drag-and-drop kolumn, optimistic UI, rollback | — | `projects` API |
| Sesje tatuażu | **Kompletny** | `session.service.ts` + controller + testy | CRUD sesji powiązanych z projektem/rezerwacją | — | — |
| Zapytania (inquiries) | **Kompletny** | `inquiry` — wizard, walidacja, wycena | Wizard wieloetapowy, upload plików, quota | — | — |
| AI Chat w zapytaniach | **Kompletny** | `ai-chat.service.ts` — GPT-4o-mini | Konwersacja zbierająca dane do formularza, ekstrakcja JSON | — | OpenAI API |
| Konfiguracja formularzy zapytań | **Kompletny** | `inquiry-form-config.service.ts` | Własne pola, domyślny template | — | — |
| Panel zapytań (web) | **Kompletny** | `/inquiries/page.tsx` + `[id]/page.tsx` + `ai-chat-log` | Lista, szczegóły, log chatu AI | — | `inquiries` API |

---

## 6. Platnosci i faktury

| Funkcja | Status | Opis | Co działa | Co nie działa | Zależności |
|---------|--------|------|-----------|---------------|------------|
| Płatności Przelewy24 (P24) | **Kompletny** | `payment.service.ts` + `P24Client` | Inicjowanie płatności, webhook weryfikacja, refundy | — | P24 API |
| Karty podarunkowe (płatności) | **Kompletny** | `GiftCardsService` wewnątrz PaymentService | Aplikowanie kart do płatności, saldo pozostałe | — | `gift-cards` |
| Faktury (własny system) | **Kompletny** | `invoice.service.ts` + PDF + e-mail | CRUD faktur, numeracja, PDF generowanie, wysyłka e-mail | — | `email`, `invoice-pdf` |
| Integracja Infakt | **Kompletny** | `infakt.service.ts` wywołana z PaymentService | Automatyczne tworzenie faktur w Infakt po płatności | — | Infakt API |
| Integracja Fakturownia | **Kompletny** | `fakturownia.service.ts` + client + testy | Sync klientów i faktur | — | Fakturownia API |
| Integracja FakturaXL | **Kompletny** | `fakturaxl.service.ts` + korekty + testy | Faktury, korekty, sync | — | FakturaXL API |
| Integracja iFirma | **Kompletny** | `ifirma.service.ts` + produkty + testy | Faktury, klienci, produkty | — | iFirma API |
| Integracja wFirma | **Kompletny** | `wfirma.service.ts` + korekty + testy | Faktury, klienci, produkty, korekty | — | wFirma API |
| Klarna (BNPL) | **Częściowy** | `apps/web/lib/api/klarna.ts` istnieje | Frontend API client | Brak modułu backendowego `klarna` w `apps/api/src/` | — |
| Subskrypcje SaaS | **Kompletny** | `subscription` — remindery + winback | Przypomnienia o odnowieniu, 4-etapowa kampania odzyskiwania | Brak Stripe/PayPal do procesowania — TODO w kodzie | `notification` |
| Płatności admin (billing) | **Kompletny** | `subscription-admin.service.ts` + `invoice-admin.service.ts` | Statystyki, pauzowanie, anulowanie, rabaty | Retry i refund invoice — TODO w kodzie (bez Stripe/PayPal) | — |
| Widok płatności (web) | **Kompletny** | `/payments/` — lista, szczegóły, initiate, success/failed/processing | Pełny flow płatności | — | `payments` API |
| Membership klientów | **Kompletny** | `membership.service.ts` + testy | Plany, subskrypcja, faktury członkowskie | — | `payment` |
| Pakiety sesji | **Kompletny** | `packages.service.ts` — szablony + zakupy | Tworzenie szablonów, zakup, śledzenie sesji, transfer | `UsePackageSession` — brak endpoint wired w `/packages/my` | — |

---

## 7. Powiadomienia

| Funkcja | Status | Opis | Co działa | Co nie działa | Zależności |
|---------|--------|------|-----------|---------------|------------|
| E-mail (multi-provider) | **Kompletny** | Factory z SendGrid, Mailgun, SMTP | Wysyłanie przez wybrany provider | — | SendGrid/Mailgun/SMTP |
| SMS (SMSAPI.pl) | **Kompletny** | `smsapi.service.ts` + cost tracking + testy | Wysyłka SMS, szablony, śledzenie kosztów | — | SMSAPI |
| Push (FCM + Web Push) | **Kompletny** | `push.service.ts`, `web-push.config.ts`, FCM config | Web push + Firebase push do urządzeń | — | FCM, VAPID |
| Szablony e-mail (React Email) | **Kompletny** | 10 szablonów: booking-confirmation, reminder, payment, invoice, welcome, magic-link etc. | Renderowanie i wysyłka szablonów | — | `react-email` |
| Scheduler przypomnień | **Kompletny** | `reminder.scheduler.ts` + `reminder.service.ts` | Zaplanowane przypomnienia przed wizytą | — | cron |
| Preferencje powiadomień | **Kompletny** | `notification-preferences.service.ts` | CRUD preferencji (email/SMS/push per typ) | — | — |
| Flow powiadomień | **Kompletny** | `flow-notification.service.ts` | Orchestracja wielokanałowych powiadomień | — | — |
| Log powiadomień | **Kompletny** | `notification-log.repository.ts` | Zapis historii wysłanych powiadomień | — | — |
| Panel powiadomień (web) | **Kompletny** | `/settings/notifications/page.tsx` | Konfiguracja preferencji | — | — |

---

## 8. Marketing

| Funkcja | Status | Opis | Co działa | Co nie działa | Zależności |
|---------|--------|------|-----------|---------------|------------|
| E-mail marketing | **Kompletny** | `email-marketing.service.ts` — kampanie A/B, tracking | CRUD kampanii, segmentacja odbiorców, A/B testy, open/click tracking, unsubscribe | — | `email` |
| Social media scheduler | **Kompletny** | `social-media.service.ts` + scheduler + client | Planowanie postów, obsługa webhooków | — | Social media APIs |
| Google Business | **Kompletny** | `google-business.service.ts` + client + testy | Zarządzanie profilem, odpowiedzi na opinie | — | Google Business API |
| Kampanie promocyjne | **Kompletny** | `promotion.service.ts` + testy | CRUD promocji, walidacja kodów, kalendarze | — | — |
| Program lojalnościowy | **Kompletny** | `loyalty.service.ts` + testy | Punkty, wymiana, tier'y (bronze/silver/gold/platinum), transfer, zdarzenia bonusowe | — | — |
| Program poleceń | **Kompletny** | `referral.service.ts` + testy | Kody polecające, śledzenie konwersji, nagrody | — | — |
| Program partnerski (Affiliate) | **Kompletny** | `affiliate.service.ts` — tracking, wypłaty, fraud | Rejestracja afiliatów, linki śledzące, konwersje, payouty, flagi fraudu | — | — |
| AI Writer (treści) | **Częściowy** | `/marketing/ai-writer/page.tsx` + `apps/web/lib/api/ai.ts` | Frontend + API client do `/api/v1/ai/content/generate` | Brak backendowego kontrolera/usługi `ai/content` — moduł `ai` to tylko rate-limiter i usage monitor | OpenAI |
| Landing pages | **Kompletny** | `landing-pages.service.ts` + testy | CRUD stron lądowania per tenant | — | `page-builder` |
| Blog | **Kompletny** | `blog.service.ts` + testy | CRUD wpisów, kategoryzacja | — | — |
| Widok marketingu (web) | **Kompletny** | `/marketing/` — email, social, pages, ai-writer | Pełny zestaw stron UI | AI Writer wymaga brakującego backendu | — |
| Winback campaign | **Kompletny** | `winback-campaign.service.ts` | 4-etapowa sekwencja odzyskiwania klientów z rabatami | — | `notification` |

---

## 9. AI i predykcje

| Funkcja | Status | Opis | Co działa | Co nie działa | Zależności |
|---------|--------|------|-----------|---------------|------------|
| AI Chat w zapytaniach | **Kompletny** | `ai-chat.service.ts` — GPT-4o-mini | Rozmowa z klientem, ekstrakcja danych do formularza | — | OpenAI API |
| AI Generowanie designów | **Częściowy** | Frontend `DesignWizard` + API client do `/api/v1/ai/design/generate` | UI wizard z 4 krokami, streaming postępu | Brak backendowego kontrolera AI dla generowania — moduł `ai` nie zawiera service'u generowania | OpenAI/DALL-E |
| AR Preview (podgląd tatuażu) | **Częściowy** | Frontend `ARPreviewWizard` — kamera, canvas, warstwy | Nakładanie tatuażu na zdjęcie, pełny wizard UI | Brak backendowego przetwarzania — czysto frontend (canvas) | — |
| Dopasowanie artystów AI | **Częściowy** | `/matching/page.tsx` + `useArtistMatching` hook | UI wyszukiwania, lista wyników, porównanie | Brak backendowego endpointu matchingu — API client wskazuje na `/api/v1/ai/matching` | OpenAI |
| Predykcja popytu | **Kompletny** | `predictions.service.ts` + `TimeSeriesForecastService` | Prognoza rezerwacji, analiza sezonowości, okresy szczytowe | — | — |
| Prognoza przychodów | **Kompletny** | `predictions.service.ts` — `getRevenueForecast` | Prognoza na podstawie historii | — | — |
| Rekomendacje kadrowe | **Kompletny** | `predictions.service.ts` — `getStaffScheduleRecommendations` | Optymalny grafik na bazie popytu | — | — |
| Optymalne ceny | **Kompletny** | `predictions.service.ts` — `getOptimalPricing` | Sugestie cenowe na bazie popytu | — | — |
| AI Rate Limiter | **Kompletny** | `ai-rate-limiter.service.ts` | RPM + TPM limiting w oknie czasowym | — | — |
| AI Usage Monitor | **Kompletny** | `ai-usage-monitor.service.ts` | Śledzenie wykorzystania i kosztów AI | — | — |
| Wycena AI | **Częściowy** | Frontend `usePriceEstimate` + API do `/api/v1/ai/pricing/estimate` | UI z wyborem miejsca, rozmiaru, złożoności | Brak backendowego kontrolera dla `/ai/pricing` | OpenAI |
| Analiza stylu AI | **Częściowy** | Frontend `useStyleAnalysis` + API do `/api/v1/ai/style/analyze` | UI upload zdjęć + wyniki | Brak backendowego kontrolera dla `/ai/style` | OpenAI/Vision |
| AI Insights (dashboard) | **Częściowy** | Frontend `useAIInsights` + API do `/api/v1/ai/insights` | UI dashboard z prognozami | Brak backendowego kontrolera dla `/ai/insights` | `predictions` |

---

## 10. Studio store i marketplace

| Funkcja | Status | Opis | Co działa | Co nie działa | Zależności |
|---------|--------|------|-----------|---------------|------------|
| Studio Store | **Kompletny** | `studio-store.service.ts` — sklep produktów | CRUD sklepu, produkty, kategorie | — | — |
| Merch Store (Printify) | **Kompletny** | `merch-store` — cart, checkout, orders + Printify webhooks | Koszyk, checkout, zamówienia, webhook handling | Printify disconnect — TODO w `printify-webhook.handler.ts` (brak integracji notyfikacyjnej) | Printify API |
| Marketplace (guest spots) | **Kompletny** | `marketplace.service.ts` — guest spots, aplikacje, profile artystów podróżujących | CRUD miejsc gościnnych, aplikacje, weryfikacja artystów | — | — |
| Inventory (zapasy) | **Kompletny** | `inventory.service.ts` + testy | Produkty, korekty stanów, sugestie reorderu | — | — |
| Dostawcy | **Kompletny** | `suppliers` — backend + web | CRUD dostawców | — | — |
| Wysyłka InPost | **Kompletny** | `inpost-shipx.client.ts` + webhooks + testy | Tworzenie paczek, śledzenie, parcel locker | — | InPost API |
| Wysyłka DPD | **Kompletny** | `dpd-api.client.ts` + service + testy | Tworzenie przesyłek, pickup points, śledzenie | — | DPD API |
| Widok marketplace (web) | **Kompletny** | `/studio-marketplace/` — guest spots, aplikacje | UI dla miejsca gościnnego + aplikacje | — | `marketplace` API |
| Widok inventory (web) | **Kompletny** | `/inventory/` — lista, nowy, edycja, raporty | Pełny CRUD w UI | — | `inventory` API |
| AI zdjęcia produktów | **Zaślepka** | `/artist/store/products/[id]/ai-photos/page.tsx` | Strona istnieje | Brak wiadomo implementacji AI generowania zdjęć produktów | AI |

---

## 11. Panel Super Admin

| Funkcja | Status | Opis | Co działa | Co nie działa | Zależności |
|---------|--------|------|-----------|---------------|------------|
| Dashboard admin | **Częściowy** | `/admin/page.tsx` + `admin.service.ts` | KPI cards, revenue chart, lista studiów, dystrybucja planów | Activity feed — TODO w kodzie ("coming soon") | `admin` API |
| Zarządzanie studiami | **Kompletny** | `/admin/studios/` + `admin.controller.ts` | Lista, szczegóły, onboarding | — | — |
| Zarządzanie artystami | **Kompletny** | `/admin/artists/` | Lista, szczegóły | — | — |
| Onboarding | **Kompletny** | `onboarding.service.ts` + `onboarding-completion.service.ts` | Wieloetapowy onboarding nowego tenanta | — | — |
| Billing admin | **Kompletny** | `subscription-admin.service.ts` + `invoice-admin.service.ts` | Subskrypcje, faktury, statystyki, pauza, anulowanie | Retry płatności i refund — TODO (bez Stripe/PayPal) | — |
| Plany subskrypcji | **Kompletny** | `plan.service.ts` | CRUD planów, przypisanie do tenanta | — | — |
| Add-ony | **Kompletny** | `add-on.service.ts` | CRUD dodatków | — | — |
| Rabaty | **Kompletny** | `discount.service.ts` | CRUD rabatów | — | — |
| Żądania dostępu | **Kompletny** | `access-request.service.ts` | Zatwierdzanie/odrzucanie requestów o dostęp | — | — |
| Monitoring | **Kompletny** | `admin-monitoring.service.ts` | Metryki systemowe, alerty | — | — |
| Branding admin | **Kompletny** | `admin-branding.service.ts` | Globalne ustawienia brandingu platformy | — | — |
| AI admin | **Kompletny** | `ai-admin.service.ts` | Konfiguracja AI, limity, modele | — | — |
| Ustawienia systemu | **Kompletny** | `admin-settings.service.ts` | Globalne ustawienia platformy | — | — |

---

## 12. Client PWA

| Funkcja | Status | Opis | Co działa | Co nie działa | Zależności |
|---------|--------|------|-----------|---------------|------------|
| Projekt klienta | **Kompletny** | `/projects/[id]/page.tsx` | Podgląd szczegółów projektu przez token | — | `project-chat` API |
| Chat klienta | **Kompletny** | `ChatPanel`, `MessageBubble`, `ImageLightbox` | Real-time chat z artystą, lightbox zdjęć | — | `project-chat` API |
| Designsy projektu | **Kompletny** | `/projects/[id]/designs/page.tsx` | Podgląd przesłanych designów | — | — |
| Wycena projektu | **Kompletny** | `/projects/[id]/quote/page.tsx` | Podgląd wyceny | — | — |
| Propozycje dat | **Kompletny** | `/proposals/[id]/page.tsx` | Akceptacja/odrzucenie propozycji dat | — | `date-proposals` API |
| PWA manifest + SW | **Kompletny** | `public/manifest.json`, `public/sw.js`, `ServiceWorkerRegistrar` | Instalacja jako PWA, offline fallback | — | — |
| Link wygasły | **Kompletny** | `/expired/page.tsx` | Obsługa wygasłych tokenów klienta | — | — |

---

## 13. GDPR, Zgodność i Prawne

| Funkcja | Status | Opis | Co działa | Co nie działa | Zależności |
|---------|--------|------|-----------|---------------|------------|
| Zarządzanie zgodami | **Kompletny** | `consent.service.ts` — grant/revoke + audit log | Udzielanie i wycofywanie zgód, log audytowy | — | `audit-log` |
| Eksport danych (GDPR) | **Kompletny** | `gdpr-export.service.ts` | Generowanie paczki danych klienta | — | — |
| Pliki cookies | **Kompletny** | `cookie-consent` module | Zarządzanie zgodą na cookies | — | — |
| Compliance dashboard | **Kompletny** | `/compliance/page.tsx` — sterilizacja, checklisty, dokumenty, raporty | Pełny UI z danymi z API | — | `compliance` API |
| Dokumenty prawne | **Kompletny** | `legal` module — `white-label` zawiera `LegalDocument` | CRUD dokumentów per tenant | — | — |
| White-label branding | **Kompletny** | `white-label.service.ts` — branding, domeny, feature toggles, legal docs | Własna domena (DNS verify), CSS, kolory, logo | — | `dns-verifier` |

---

## 14. Obserwacje i analityka

| Funkcja | Status | Opis | Co działa | Co nie działa | Zależności |
|---------|--------|------|-----------|---------------|------------|
| Analytics biznesowe | **Kompletny** | `analytics.service.ts` + testy | Raporty rezerwacji, przychodów, retencji | — | — |
| Raporty | **Kompletny** | `reports.service.ts` + testy | Generowanie raportów finansowych i operacyjnych | — | — |
| Metryki Prometheus | **Kompletny** | `metrics.service.ts` + controller + interceptor | Zbieranie i eksponowanie metryk HTTP, biznesowych | — | Prometheus |
| Redis metryki | **Kompletny** | `redis-metrics.service.ts` | Metryki Redis (hit rate, memory, etc.) | — | Redis |
| Business anomaly detection | **Kompletny** | `business-anomaly.service.ts` | Wykrywanie anomalii w metrykach biznesowych | — | — |
| Distributed tracing (OTel) | **Kompletny** | `tracing.service.ts` + interceptor | OpenTelemetry tracing przez całe API | — | OpenTelemetry |
| Widok analityki (web) | **Kompletny** | `/analytics/page.tsx` + `/analytics/predictions/page.tsx` | Dashboardy analityczne | — | — |

---

## 15. Inne moduły

| Funkcja | Status | Opis | Co działa | Co nie działa | Zależności |
|---------|--------|------|-----------|---------------|------------|
| Portfolio | **Kompletny** | `portfolio.service.ts` + testy | Upload i zarządzanie pracami | — | `storage` |
| Recenzje | **Kompletny** | `reviews.service.ts` + testy | Zbieranie i moderowanie recenzji | — | — |
| Public API (zewnętrzna) | **Kompletny** | `public-api.service.ts` — klucze API, rate limiting, logging | Zarządzanie kluczami API, guard, interceptor | — | Redis |
| Experymenty A/B | **Kompletny** | `experiments` module | Feature flags, A/B testy per tenant | — | — |
| Developer portal (web) | **Częściowy** | `apps/web/lib/api/developer-portal.ts` | API client istnieje | Brak stron w `apps/web/app/` dla dev portalu | — |
| Ubezpieczenia | **Kompletny** | `insurance.service.ts` — providers, polisy, roszczenia | CRUD polis, weryfikacja pokrycia, roszczenia, przypomnienia | — | — |
| Szkolenia i certyfikaty | **Kompletny** | `training.service.ts` — kursy, enrollments, certyfikaty | CRUD kursów, zapisy, ukończenie, CPD summary | — | — |
| Integracja Google Business | **Kompletny** | `google-business.service.ts` | Profil firmy, opinie | — | — |
| Podpisywanie biometryczne | **Kompletny** | `biometric-calculator.service.ts` | Obliczenia biometryczne dla podpisów | — | — |
