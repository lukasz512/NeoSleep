# Logowanie po deployu (Google OAuth)

Jeśli **„Sign in with Google”** nie działa na wdrożonej aplikacji (np. app.neosleepcare.com), sprawdź poniższe punkty.

## 1. BFF jest dostępny pod adresem z aplikacji

- W GitHub Secrets (deploy rep-app) muszą być ustawione **`VITE_BFF_URL_PROD`** i **`VITE_BFF_URL_UAT`** – adres API (BFF), np. `https://api.neosleepcare.com`.
- Po zmianie secretów zrób **ponowny deploy** rep-app, żeby build miał poprawny URL.
- Otwórz w przeglądarce: `https://twoj-bff-url/auth/google`.  
  - Jeśli widzisz przekierowanie do Google lub JSON `{"error":"Google login not configured"}` – BFF działa.  
  - Jeśli błąd połączenia / 404 – BFF nie jest wdrożony lub adres jest zły.

## 2. Zmienne środowiskowe na serwerze BFF

Na serwerze, na którym działa BFF (Node), ustaw w `.env` lub w panelu hostingu:

| Zmienna | Opis | Przykład (prod) |
|--------|------|------------------|
| `GOOGLE_CLIENT_ID` | ID klienta OAuth z Google Cloud Console | (wklej z konsoli) |
| `GOOGLE_CLIENT_SECRET` | Secret klienta OAuth | (wklej z konsoli) |
| `FRONTEND_URL` | URL rep-app (dokładnie ta domena) | `https://app.neosleepcare.com` |
| `OAUTH_REDIRECT_ORIGIN` | Adres BFF (callback Google) | `https://api.neosleepcare.com` |
| `SESSION_SECRET` | Długi losowy string do podpisu sesji | (wygeneruj, np. `openssl rand -hex 32`) |
| `DATABASE_URL` | Connection string do Postgres | `postgresql://...` |

Bez `GOOGLE_CLIENT_ID` BFF zwróci 503 przy `/auth/google`.  
Bez poprawnego `FRONTEND_URL` użytkownik po logowaniu w Google zostanie przekierowany w złe miejsce.

## 3. Google Cloud Console – redirect URI

1. Wejdź w [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials.
2. Otwórz klienta OAuth 2.0 (typ „Web application”).
3. W **Authorized redirect URIs** dodaj **dokładnie** (z protokołem i ścieżką):
   - Produkcja: `https://api.neosleepcare.com/auth/google/callback`
   - UAT (jeśli osobny BFF): `https://api-uat.neosleepcare.com/auth/google/callback`
4. W **Authorized JavaScript origins** możesz dodać: `https://app.neosleepcare.com` (i wersję UAT, jeśli jest).

Adres w „Authorized redirect URIs” musi być **identyczny** z tym, co BFF wysyła do Google (czyli `OAUTH_REDIRECT_ORIGIN` + `/auth/google/callback`).

## 4. CORS i cookies

- BFF musi akceptować origin rep-app: w `FRONTEND_URL` podaj pełny URL aplikacji (np. `https://app.neosleepcare.com`). W dev BFF akceptuje też localhost i typowe adresy LAN.
- Sesja jest w cookie. Domena aplikacji i BFF (np. app.neosleepcare.com i api.neosleepcare.com) muszą być z tej samej domeny nadrzędnej (np. neosleepcare.com), żeby cookie działało z ustawieniem `SameSite=Lax`.

## 5. Komunikaty na stronie logowania

Po powrocie z Google aplikacja może pokazać:

- **„Sign-in was cancelled or failed”** – anulowano w Google lub błąd stanu OAuth; spróbuj ponownie.
- **„Google sign-in is not configured on the server”** – brak `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` lub błąd wymiany tokenu; sprawdź zmienne i logi BFF.
- **„You were signed in but the session could not be restored”** – logowanie w Google się udało, ale request do BFF po powrocie nie ma sesji (np. cookie nie jest wysyłane); sprawdź CORS, domeny i ustawienia cookie w BFF.

## Szybki checklist

- [ ] Rep-app zbudowany z poprawnym `VITE_BFF_URL` (sekrety w GitHub + ponowny deploy).
- [ ] BFF wdrożony i dostępny pod tym URL.
- [ ] Na serwerze BFF: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `FRONTEND_URL`, `OAUTH_REDIRECT_ORIGIN`, `SESSION_SECRET`, `DATABASE_URL`.
- [ ] W Google Cloud: redirect URI = `https://<bff-domena>/auth/google/callback`.
- [ ] Przeglądarka nie blokuje ciasteczek (np. tryb incognito / inne rozszerzenia).

Zobacz też: **foundation/docs/FTP_DEPLOY_GODADDY.md** (sekrety deploy) i **foundation/docs/DEPLOYMENT.md**.
