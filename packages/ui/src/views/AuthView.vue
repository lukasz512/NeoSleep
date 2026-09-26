<template>
  <div class="auth-view" :class="{ 'auth-view--backdrop-exiting': backdropExiting }">
    <AuthChrome ref="authChromeRef" :auto-play="false" :dots-busy="isLoading" :dots-anchor="cardSlotEl" />

    <div ref="cardSlotEl" class="auth-view__card-slot">
      <!-- The breathing orbs behind this card live in the public layout
           (AuthOrbs, see AuthBackdrop) so they're on screen before this view
           even mounts — this slot is only registered as their anchor. -->
      <AuthCard
        ref="authCardRef"
        class="auth-view__card"
        :style="cardAccentStyle"
        :back-to="backTo"
        :title="cardTitle"
        :loading="isLoading"
        :step-key="stepKey"
        :auto-play="false"
        motion="zoom"
      >
      <div v-if="step === 'signin'" class="auth-view__body">
        <h1 class="auth-view__title-visually-hidden">{{ t('user.login.title') }}</h1>
        <!-- Not the semantic <h1> above (that stays screen-reader-only, same
             wording it always had) — this is the visible brand heading, a
             plain paragraph styled like one rather than a second landmark
             heading on the page. -->
        <p class="auth-view__heading">{{ t('user.login.heading') }}</p>

        <VForm ref="signinForm" class="auth-view__form" @submit.prevent="handleSignIn">
          <VTextField
            ref="loginEmailFieldRef"
            v-model="loginFlow.email.value"
            type="email"
            :label="t('user.login.email')"
            variant="outlined"
            density="comfortable"
            autocomplete="email"
            :rules="[ruleEmailRequired, ruleEmailFormat]"
            class="auth-view__field"
            :disabled="loginFlow.loading.value"
          >
            <template #prepend-inner>
              <button
                type="button"
                class="auth-view__at-btn"
                :aria-label="t('app.identity.form.emailInsertAt')"
                @mousedown.prevent="insertAtSign(loginFlow.email, loginEmailFieldRef)"
              >
                <VIcon icon="mdi-at" size="20" />
              </button>
            </template>
          </VTextField>

          <VTextField
            v-model="loginFlow.password.value"
            :type="showPassword ? 'text' : 'password'"
            :label="t('user.login.password')"
            variant="outlined"
            density="comfortable"
            autocomplete="current-password"
            prepend-inner-icon="mdi-lock-outline"
            :rules="[rulePasswordRequired]"
            class="auth-view__field"
            :disabled="loginFlow.loading.value"
            :append-inner-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
            @click:append-inner="showPassword = !showPassword"
          />

          <div class="auth-view__row">
            <VCheckbox
              v-model="loginFlow.rememberMe.value"
              :label="t('user.login.rememberMe')"
              color="primary"
              density="compact"
              hide-details
              class="auth-view__remember"
            />
          </div>

          <VBtn
            type="submit"
            color="primary"
            size="large"
            block
            :loading="loginFlow.loading.value"
            class="auth-view__submit"
          >
            {{ t('user.login.signIn') }}
          </VBtn>
        </VForm>

        <!-- Only where this environment has a Google OAuth client configured
             (GET /auth/providers, see useGoogleSignIn) — NEO-78. -->
        <template v-if="googleSignIn.available.value">
          <div class="auth-view__divider" role="separator">
            <span>{{ t('user.login.google.or') }}</span>
          </div>
          <GoogleSignInButton
            :href="googleSignIn.href.value"
            :label="t('user.login.google.signIn')"
            :dark="themeStore.mode === 'dark'"
            :loading="googleSignIn.redirecting.value"
            :disabled="loginFlow.loading.value"
            @start="googleSignIn.redirecting.value = true"
          />
        </template>

        <div class="auth-view__footer">
          <VBtn
            variant="text"
            size="small"
            to="/forgot-password"
            class="auth-view__forgot"
            @click="goToForgot"
          >
            {{ t('user.login.forgotPassword') }}
          </VBtn>
        </div>
      </div>

      <div v-else-if="step === 'forgot'" class="auth-view__body">
        <p class="auth-view__subtitle">{{ t('user.forgotPassword.subtitle') }}</p>

        <VForm ref="forgotForm" class="auth-view__form" @submit.prevent="handleForgotSubmit">
          <VTextField
            ref="forgotEmailFieldRef"
            v-model="forgotFlow.email.value"
            type="email"
            :label="t('user.login.email')"
            variant="outlined"
            density="comfortable"
            autocomplete="email"
            :rules="[ruleEmailRequired, ruleEmailFormat]"
            class="auth-view__field"
            :disabled="forgotFlow.loading.value"
          >
            <template #prepend-inner>
              <button
                type="button"
                class="auth-view__at-btn"
                :aria-label="t('app.identity.form.emailInsertAt')"
                @mousedown.prevent="insertAtSign(forgotFlow.email, forgotEmailFieldRef)"
              >
                <VIcon icon="mdi-at" size="20" />
              </button>
            </template>
          </VTextField>

          <VBtn
            type="submit"
            color="primary"
            size="large"
            block
            :loading="forgotFlow.loading.value"
            class="auth-view__submit"
          >
            {{ t('user.forgotPassword.submit') }}
          </VBtn>
        </VForm>
      </div>

      <div v-else-if="step === 'sent'" class="auth-view__body">
        <template v-if="forgotFlow.submitted.value">
          <VAlert type="success" variant="tonal" density="comfortable" class="auth-view__result-alert">
            {{ t('user.forgotPassword.successMessage') }}
          </VAlert>
        </template>
        <template v-else>
          <VAlert type="error" variant="tonal" density="comfortable" class="auth-view__result-alert">
            {{ t(forgotFlow.errorKey.value ?? 'user.forgotPassword.error.network') }}
          </VAlert>
          <VBtn variant="outlined" color="primary" size="large" block class="auth-view__submit auth-view__retry" @click="retryForgot">
            {{ t('user.forgotPassword.tryAgain') }}
          </VBtn>
        </template>
      </div>

      <div v-else class="auth-view__body">
        <template v-if="resetFlow.tokenValid.value === false">
          <p class="auth-view__subtitle auth-view__subtitle--break">{{ t('user.resetPassword.error.invalidToken') }}</p>
          <VBtn variant="outlined" color="primary" size="large" block to="/forgot-password" class="auth-view__submit">
            {{ t('user.resetPassword.requestNewLink') }}
          </VBtn>
        </template>

        <template v-else-if="resetFlow.tokenValid.value === true">
          <p class="auth-view__subtitle">{{ t('user.resetPassword.subtitle') }}</p>

          <VAlert
            v-if="resetFlow.errorKey.value"
            type="error"
            variant="tonal"
            density="compact"
            class="auth-view__alert"
            closable
            @click:close="resetFlow.errorKey.value = null"
          >
            {{ t(resetFlow.errorKey.value) }}
          </VAlert>

          <VForm ref="resetForm" class="auth-view__form" @submit.prevent="handleResetSubmit">
            <VTextField
              v-model="resetFlow.newPassword.value"
              :type="showResetPassword ? 'text' : 'password'"
              :label="t('user.resetPassword.newPassword')"
              variant="outlined"
              density="comfortable"
              autocomplete="new-password"
              prepend-inner-icon="mdi-lock-outline"
              :rules="[ruleResetPasswordRequired, ruleResetPasswordLength]"
              class="auth-view__field"
              :disabled="resetFlow.loading.value"
              :append-inner-icon="showResetPassword ? 'mdi-eye-off' : 'mdi-eye'"
              @click:append-inner="showResetPassword = !showResetPassword"
            />

            <VTextField
              v-model="resetFlow.confirmPassword.value"
              :type="showResetConfirmPassword ? 'text' : 'password'"
              :label="t('user.resetPassword.confirmPassword')"
              variant="outlined"
              density="comfortable"
              autocomplete="new-password"
              prepend-inner-icon="mdi-lock-outline"
              :rules="[ruleResetPasswordRequired, ruleResetPasswordsMatch]"
              class="auth-view__field"
              :disabled="resetFlow.loading.value"
              :append-inner-icon="showResetConfirmPassword ? 'mdi-eye-off' : 'mdi-eye'"
              @click:append-inner="showResetConfirmPassword = !showResetConfirmPassword"
            />

            <VBtn
              type="submit"
              color="primary"
              size="large"
              block
              :loading="resetFlow.loading.value"
              class="auth-view__submit"
            >
              {{ t('user.resetPassword.submit') }}
            </VBtn>
          </VForm>
        </template>

        <div v-else class="auth-view__validating" aria-hidden="true" />
      </div>
    </AuthCard>
    </div>

    <!-- Badge (with the same halo as the logo's, see AuthChrome, at half
         size) and the app version under it. The wrap owns the badge's
         entrance/exit opacity so halo and badge fade together; the img keeps
         the magnetic transform. -->
    <div class="auth-view__badge-footer">
      <div
        class="auth-view__pwa-badge-wrap"
        :class="{ 'auth-view__pwa-badge-wrap--visible': badgeVisible }"
      >
        <div class="auth-view__pwa-badge-halo">
          <AuthHalo :dark="themeStore.mode === 'dark'" size="sm" />
        </div>
      <img
        ref="pwaBadgeEl"
        :src="pwaBadgeUrl"
        :alt="t('user.login.pwaBadge')"
        class="auth-view__pwa-badge"
        />
      </div>
      <p
        v-if="appVersionLabel"
        class="auth-view__app-version"
        :class="{
          'auth-view__app-version--visible': badgeVisible,
          'auth-view__app-version--dark': themeStore.mode === 'dark',
        }"
      >
        {{ appVersionLabel }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, inject, onMounted, onBeforeUnmount, nextTick } from "vue";
import type { Ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { brandColors } from "@brand/colors";
import { BRAND_PWA_BADGE_URL, BRAND_PWA_BADGE_DARK_URL } from "@brand/logos";
import { createUseLoginFlow } from "../composables/useLoginFlow";
import { createUseForgotPasswordFlow } from "../composables/useForgotPasswordFlow";
import { createUseResetPasswordFlow } from "../composables/useResetPasswordFlow";
import { useMagneticPointer } from "../composables/useMagneticPointer";
import { AUTH_BACKDROP_KEY } from "../composables/authBackdrop";
import type { ApiFetchOptions } from "@api";
import { useThemeStore, type AuthTokenStorage } from "@stores";
import { useAppVersionLabel } from "../composables/useAppVersionLabel";
import AuthChrome from "../components/AuthChrome.vue";
import AuthCard from "../components/AuthCard.vue";
import AuthHalo from "../components/AuthHalo.vue";
import GoogleSignInButton from "../components/GoogleSignInButton.vue";
import { API_URL_KEY, googleSignInErrorKey, useGoogleSignIn } from "../composables/useGoogleSignIn";

// White badge in light mode, dark badge in dark mode (NEO-12) — same theme
// source AuthChrome uses for its logo.
const themeStore = useThemeStore();
const pwaBadgeUrl = computed(() =>
  themeStore.mode === "dark" ? BRAND_PWA_BADGE_DARK_URL : BRAND_PWA_BADGE_URL,
);

type ApiFetchFn = (path: string, options?: ApiFetchOptions) => Promise<Response>;
type NotifyType = "success" | "info" | "warning" | "error";
type NotifyFn = (message: string, type: NotifyType, key?: string) => void;
type Step = "signin" | "forgot" | "sent" | "reset";

function stepFromPath(path: string): Step {
  if (path === "/forgot-password") return "forgot";
  if (path === "/reset-password") return "reset";
  return "signin";
}

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const apiFetch = inject<ApiFetchFn>("neo:apiFetch")!;
const authTokenStorage = inject<AuthTokenStorage>("neo:authTokenStorage")!;
const notify = inject<NotifyFn>("neo:notify")!;

const useLoginFlow = createUseLoginFlow(apiFetch, authTokenStorage);
const loginFlow = useLoginFlow();

// ?email= prefill — e.g. the "Go to login" button a doctor sees right after
// finishing partner registration (NEO-51), so they only type the password
// they just chose. Never overwrites something already typed.
if (typeof route.query.email === "string" && !loginFlow.email.value) {
  loginFlow.email.value = route.query.email;
}

// The sign-in error used to render inline (a VAlert above the form) — moved
// onto the app's native toast/notification system instead (NEO-10), matching
// every other error surface in the app. loginFlow.errorKey itself is
// untouched (still reset at the top of every submit()), just no longer read
// for inline display.
watch(loginFlow.errorKey, (key) => {
  if (key) notify(t(key), "error", key);
});

// "Sign in with Google" (NEO-78): shown only when the API says it's configured.
const googleSignIn = useGoogleSignIn(apiFetch, inject<string | null>(API_URL_KEY, null));
onMounted(() => googleSignIn.load());

// The Google callback sends refusals/failures back as /login?error=<code>
// (e.g. an email no admin has invited). Shown once as a toast, then dropped
// from the URL so a reload or back-navigation doesn't repeat it.
const googleErrorKey = googleSignInErrorKey(route.query.error);
if (googleErrorKey) {
  notify(t(googleErrorKey), "error", googleErrorKey);
  void router.replace({
    query: Object.fromEntries(Object.entries(route.query).filter(([key]) => key !== "error")),
  });
}

const useForgotPasswordFlow = createUseForgotPasswordFlow(apiFetch);
const forgotFlow = useForgotPasswordFlow();

const useResetPasswordFlow = createUseResetPasswordFlow(apiFetch);
const resetFlow = useResetPasswordFlow();

// /login, /forgot-password and /reset-password share one route component
// (see routes.ts), so this instance — and the AuthChrome/AuthCard it
// renders once, above — persists across navigation between them instead of
// remounting. `step` just mirrors whichever URL we're on, restoring
// correctly on a direct load/bookmark/back-button too, not only on clicks.
const step = ref<Step>(stepFromPath(route.path));
watch(
  () => route.path,
  (path) => {
    if (path === "/forgot-password") step.value = "forgot";
    else if (path === "/reset-password") step.value = "reset";
    else if (path === "/login") step.value = "signin";
  },
);

// The reset step has its own validating → valid/invalid sub-states, each
// worth its own crossfade — step alone isn't granular enough for that.
const stepKey = computed(() => {
  if (step.value !== "reset") return step.value;
  if (resetFlow.tokenValid.value === null) return "reset-validating";
  return resetFlow.tokenValid.value ? "reset-valid" : "reset-invalid";
});

const backTo = computed(() => (step.value === "signin" ? null : "/login"));
// Signin's own <h1> is visually hidden (screen-reader only) — its title isn't meant to be seen, so
// AuthCard gets no title for that step; forgot/sent/reset all show one, rendered next to the back arrow.
const cardTitle = computed(() => {
  if (step.value === "forgot" || step.value === "sent") return t("user.forgotPassword.title");
  if (step.value === "reset") return t("user.resetPassword.title");
  return null;
});
const isLoading = computed(
  () =>
    loginFlow.loading.value ||
    forgotFlow.loading.value ||
    resetFlow.loading.value ||
    googleSignIn.redirecting.value,
);

const showPassword = ref(false);
const showResetPassword = ref(false);
const showResetConfirmPassword = ref(false);
const signinForm = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null);
const forgotForm = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null);
const resetForm = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null);
const authCardRef = ref<{ playEnter: () => Promise<void>; playExit: () => Promise<void> } | null>(null);
const authChromeRef = ref<{ playEnter: () => Promise<void>; playExit: () => Promise<void> } | null>(null);
const loginEmailFieldRef = ref<{ $el?: HTMLElement } | null>(null);
const forgotEmailFieldRef = ref<{ $el?: HTMLElement } | null>(null);

// Shared auth backdrop (photo, gradient, breathing orbs) owned by the public
// layout — optional, so this view still works mounted on its own (tests).
const backdrop = inject(AUTH_BACKDROP_KEY, null);

// The orbs sit behind this slot (the card's box) rather than a guessed spot.
const cardSlotEl = ref<HTMLElement | null>(null);
onMounted(() => backdrop?.registerAnchor(cardSlotEl.value));
onBeforeUnmount(() => backdrop?.registerAnchor(null));

// Every wait in this view — sign-in, forgot-password, reset-token validation
// and reset submit — makes the orbs breathe faster until it settles.
const backdropBusy = computed(
  () => isLoading.value || (step.value === "reset" && resetFlow.tokenValid.value === null),
);
watch(backdropBusy, (busy) => backdrop?.setBusy("auth-view", busy), { immediate: true });
onBeforeUnmount(() => backdrop?.setBusy("auth-view", false));

// Barely-there — "bardzo malutko" — unlike the logo/badge pair in AuthChrome,
// which float noticeably more.
const pwaBadgeEl = ref<HTMLElement | null>(null);
useMagneticPointer(pwaBadgeEl, { strength: 4, ease: 0.14 });

// Whole-screen entrance/exit choreography. The layout's intro plays first
// (orbs pop in on a plain ground, the background spreads out from under them,
// see AuthBackdrop) — then the card zooms out of the orbs, then the logo, then
// the PWA badge, each starting once the previous has settled.
// playExitSequence() on successful login: badge + logo leave, the card melts
// forward, then the orbs rush toward the user and dissolve together with the
// background — router.push only fires once all of that has finished, see
// handleSignIn.
const badgeVisible = ref(false);
// AuthChrome's dot field and settings chip are part of the "canvas" too —
// they dissolve together with the layout's background, not before or after it.
const backdropExiting = ref(false);

// "Version 1.0.0 (build 12) · DEV" under the badge (see useAppVersionLabel).
const appVersionLabel = useAppVersionLabel();
const BADGE_ENTER_DELAY = 150;
const BADGE_EXIT_DURATION = 250;

const prefersReducedMotion =
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

onMounted(async () => {
  if (prefersReducedMotion) {
    // Both resolve instantly under reduced motion — still needed, since
    // autoPlay=false means nothing else ever makes the card/logo visible.
    await authCardRef.value?.playEnter();
    await authChromeRef.value?.playEnter();
    badgeVisible.value = true;
    return;
  }
  await backdrop?.whenEntered();
  await authCardRef.value?.playEnter();
  await authChromeRef.value?.playEnter();
  await wait(BADGE_ENTER_DELAY);
  badgeVisible.value = true;
});

async function playExitSequence(): Promise<void> {
  if (prefersReducedMotion) {
    await backdrop?.playExit();
    return;
  }
  badgeVisible.value = false;
  await Promise.all([wait(BADGE_EXIT_DURATION), authChromeRef.value?.playExit()]);
  await authCardRef.value?.playExit();
  backdropExiting.value = true;
  await backdrop?.playExit();
}

/** Inserts "@" at the caret in an email field — a no-op once one is already present (an email has at most one). */
function insertAtSign(emailModel: Ref<string>, fieldRef: Ref<{ $el?: HTMLElement } | null>) {
  const current = emailModel.value ?? "";
  if (current.includes("@")) return;
  const inputEl = fieldRef.value?.$el?.querySelector("input") ?? undefined;
  const start = inputEl?.selectionStart ?? current.length;
  const end = inputEl?.selectionEnd ?? current.length;
  emailModel.value = current.slice(0, start) + "@" + current.slice(end);
  nextTick(() => {
    inputEl?.focus();
    // type="email" doesn't support the selection API — setSelectionRange
    // throws InvalidStateError there, so re-placing the caret is best-effort.
    try {
      inputEl?.setSelectionRange(start + 1, start + 1);
    } catch {
      // benign: unsupported input type for setSelectionRange — focus() above is enough.
    }
  });
}

const ruleEmailRequired = (v: string) =>
  !!v.trim() || t("user.login.validation.emailRequired");
const ruleEmailFormat = (v: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) || t("user.login.validation.emailInvalid");
const rulePasswordRequired = (v: string) =>
  !!v || t("user.login.validation.passwordRequired");
const ruleResetPasswordRequired = (v: string) =>
  !!v || t("user.resetPassword.validation.passwordRequired");
const ruleResetPasswordLength = (v: string) =>
  v.length >= 8 || t("user.resetPassword.validation.passwordTooShort");
const ruleResetPasswordsMatch = (v: string) =>
  v === resetFlow.newPassword.value || t("user.resetPassword.validation.passwordMismatch");

// Carries whatever's already typed in the sign-in form over to the
// forgot-password step, so the user isn't asked to retype their email.
function goToForgot() {
  forgotFlow.email.value = loginFlow.email.value.trim();
}

function retryForgot() {
  forgotFlow.errorKey.value = null;
  step.value = "forgot";
}

async function handleSignIn() {
  if (!signinForm.value) return;
  const { valid } = await signinForm.value.validate();
  if (!valid) return;
  // Retract everything (see playExitSequence) before router.push actually
  // navigates away, so the app underneath only appears once the whole auth
  // screen — badge, logo, card, orbs, page background — has faded out.
  await loginFlow.submit({
    onSuccess: playExitSequence,
  });
}

async function handleForgotSubmit() {
  if (!forgotForm.value) return;
  const { valid } = await forgotForm.value.validate();
  if (!valid) return;
  await forgotFlow.submit();
  step.value = "sent";
  if (forgotFlow.submitted.value) {
    window.setTimeout(() => router.push("/login"), 3000);
  }
}

async function handleResetSubmit() {
  if (!resetForm.value) return;
  const { valid } = await resetForm.value.validate();
  if (valid) await resetFlow.submit();
}

// /reset-password is only ever reached via a fresh page load (an emailed
// link), never by navigating here from signin/forgot within the app, so
// validating once on mount — rather than on every step change — is correct.
onMounted(() => {
  if (step.value === "reset") resetFlow.validateToken();
});

// Feeds the brand teal into the card border (see .auth-view__card in <style>), so the
// accent tracks packages/brand/colors.ts instead of a hardcoded hex duplicated here.
const cardAccentStyle = {
  "--auth-view-card-accent": brandColors.primary,
};
</script>

<style scoped>
.auth-view {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
  padding: 24px 16px;
  /* Fixed offset, not vertical centering — the logo (AuthChrome) is the
     anchor; the card grows/shrinks below it without ever moving it. */
  padding-top: clamp(24px, 10vh, 96px);
  gap: 16px;
}

/* Same 1.4s / easing as the layout's background dissolve (PublicLayout's
   .layout-public__bg--dissolving), so the dot field and the settings chip
   melt away with the rest of the canvas instead of lingering on the bare page. */
.auth-view--backdrop-exiting :deep(.auth-dot-grid),
.auth-view--backdrop-exiting :deep(.auth-chrome__topbar) {
  opacity: 0;
  transition: opacity 1.4s cubic-bezier(0.4, 0, 0.2, 1);
}

/* The card's box — also the anchor the layout's breathing orbs (AuthOrbs)
   align behind, sized as a percentage of it so they scale with the card. */
.auth-view__card-slot {
  position: relative;
  width: 100%;
  max-width: 420px;
}

/* z-index 2, above the logo (AuthChrome) and PWA badge wraps (both 1) —
   their halos bleed past their own boxes and must never paint over the card. */
.auth-view__card {
  position: relative;
  z-index: 2;
  width: 100%;
  /* No background here — VCard already themes its own surface color (light
     vs dark) via --v-theme-surface; a fixed white would fight that. */
  border: 1px solid color-mix(in srgb, var(--auth-view-card-accent) 28%, transparent);
}

/* Below the card now, not next to the logo (see AuthChrome) — logo, card,
   badge, app version, top to bottom. Stacked tighter than the page's own
   16px gap. */
.auth-view__badge-footer {
  position: relative;
  z-index: 1;
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.auth-view__pwa-badge-wrap {
  position: relative;
  display: flex;
  opacity: 0;
  transition: opacity 0.3s ease-out;
}

.auth-view__pwa-badge-wrap--visible {
  opacity: 1;
}

/* Same ink as the badge's P/A letters in each theme (white in light,
   #3d3d3d in dark — see packages/brand/logos/pwa/), same 70% and fade-in. */
.auth-view__app-version {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  font-weight: 500;
  letter-spacing: 0.04em;
  font-variant-numeric: tabular-nums;
  color: #ffffff;
  opacity: 0;
  transition: opacity 0.3s ease-out;
}

.auth-view__app-version--dark {
  color: #3d3d3d;
}

.auth-view__app-version--visible {
  opacity: 0.7;
}

@media (prefers-reduced-motion: reduce) {
  .auth-view__pwa-badge-wrap,
  .auth-view__app-version {
    transition: none;
  }
}

/* Half of AuthChrome's logo halo bleed (-30px -70px). */
.auth-view__pwa-badge-halo {
  position: absolute;
  inset: -15px -35px;
  pointer-events: none;
}

/* Magnetic transform target (see useMagneticPointer in <script>) — written
   to directly every frame, so it stays free of any CSS transition of its own. */
.auth-view__pwa-badge {
  position: relative;
  height: 20px;
  width: auto;
  object-fit: contain;
  /* 70%, not full — the badge is a quiet footnote under the card (NEO-12).
     On the img, not the wrap, so the halo behind it keeps its own strength. */
  opacity: 0.7;
  will-change: transform;
}

.auth-view__body {
  padding: 24px 32px 32px;
}

/* Kept in the DOM for screen readers — functional, not visual focus. */
.auth-view__title-visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.auth-view__heading {
  margin: 0 0 20px;
  font-size: 1.75rem;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.02em;
  text-align: center;
  color: rgb(var(--v-theme-primary));
}

.auth-view__subtitle {
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
  margin: 0 0 24px;
}

.auth-view__subtitle--break {
  white-space: pre-line;
}

.auth-view__alert {
  margin-bottom: 20px;
}

.auth-view__result-alert {
  margin-bottom: 4px;
}

.auth-view__form {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.auth-view__field {
  margin-bottom: 4px;
}

/* Clickable "@" prepend-inner icon on the email field — mirrors FormRenderer's insertAtSign(). */
.auth-view__at-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
  color: rgb(var(--v-theme-primary));
}

.auth-view__row {
  display: flex;
  align-items: center;
  margin: 0 0 16px;
}

.auth-view__remember {
  flex: 1;
}

.auth-view__submit {
  text-transform: none;
  letter-spacing: normal;
  font-weight: 600;
}

/* Block (full-width) buttons — the app-wide iOS-style hover/active scale
   (theme.scss .v-btn:hover/:active) looks like a broken zoom on a full-width
   element, so it's switched off just for these. */
.auth-view__submit:hover,
.auth-view__submit:active {
  transform: none !important;
}

/* "or" between the password form and the Google button: hairlines in the
   same muted on-surface ink the subtitles use, so it reads in both themes. */
.auth-view__divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 16px 0;
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.auth-view__divider::before,
.auth-view__divider::after {
  content: "";
  flex: 1;
  height: 1px;
  background: rgba(var(--v-theme-on-surface), 0.16);
}

.auth-view__footer {
  display: flex;
  justify-content: center;
  margin-top: 12px;
}

/* Flat text buttons (not the block submit) — same reasoning: the app-wide
   hover/active scale reads as a stray zoom on a small flat button, so these
   stay plain and just take the standard text-button hover tint instead. */
.auth-view__forgot,
.auth-view__retry {
  text-transform: none;
  letter-spacing: normal;
}

.auth-view__forgot:hover,
.auth-view__forgot:active,
.auth-view__retry:hover,
.auth-view__retry:active {
  transform: none !important;
}

.auth-view__validating {
  height: 24px;
}
</style>
