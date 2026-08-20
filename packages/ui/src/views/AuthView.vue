<template>
  <div class="auth-view">
    <AuthChrome ref="authChromeRef" :auto-play="false" />

    <div ref="cardSlotEl" class="auth-view__card-slot">
      <!-- Purely decorative, behind the card (z-index below it) — three
           semi-transparent brand-teal circles, gently pulsing (see
           auth-view-orb-pulse) so they interweave with the animated page
           background showing through the gaps, rather than sitting static.
           Anchor divs own the static position/centering transform; the span
           inside each owns the continuous per-frame magnetic transform (see
           useMagneticPointer) — same split as AuthChrome's halo/logo, so the
           two transforms never fight each other on one element. Smaller
           circles float more (see script's strengths) — same "lighter things
           move more" depth logic as the logo/badge split in AuthChrome.
           Height is locked to the card-slot's size on first paint (see
           orbsFrameStyle) rather than tracking it live — AuthCard animates
           its own height on every step change (signin ↔ forgot ↔ reset), and
           since the anchors below are positioned in % of this box, letting it
           track that live would drag the orbs along with every step
           transition instead of leaving them planted behind the card.
           Each anchor pops in/out via a scale keyframe (see bigOrbPhase etc.
           and the auth-view-orb-pop-in/-out animations below) — a separate
           transform-only animation from the span's continuous pulse and
           magnetic-pointer transform inside, so the three never fight over
           the same property. -->
      <div class="auth-view__orbs" aria-hidden="true" :style="orbsFrameStyle">
        <div
          class="auth-view__orb-anchor auth-view__orb-anchor--big"
          :class="orbAnchorPhaseClass(bigOrbPhase)"
        >
          <span ref="bigOrbEl" class="auth-view__orb auth-view__orb--big" />
        </div>
        <div
          class="auth-view__orb-anchor auth-view__orb-anchor--medium"
          :class="orbAnchorPhaseClass(mediumOrbPhase)"
        >
          <span ref="mediumOrbEl" class="auth-view__orb auth-view__orb--medium" />
        </div>
        <div
          class="auth-view__orb-anchor auth-view__orb-anchor--small"
          :class="orbAnchorPhaseClass(smallOrbPhase)"
        >
          <span ref="smallOrbEl" class="auth-view__orb auth-view__orb--small" />
        </div>
      </div>

      <AuthCard
        ref="authCardRef"
        class="auth-view__card"
        :style="cardAccentStyle"
        :back-to="backTo"
        :title="cardTitle"
        :loading="isLoading"
        :step-key="stepKey"
        :auto-play="false"
      >
      <div v-if="step === 'signin'" class="auth-view__body">
        <h1 class="auth-view__title-visually-hidden">{{ t('user.login.title') }}</h1>
        <!-- Not the semantic <h1> above (that stays screen-reader-only, same
             wording it always had) — this is the visible brand heading, a
             plain paragraph styled like one rather than a second landmark
             heading on the page. -->
        <p class="auth-view__heading">{{ t('user.login.heading') }}</p>

        <VAlert
          v-if="loginFlow.errorKey.value"
          type="error"
          variant="tonal"
          density="compact"
          class="auth-view__alert"
          closable
          @click:close="loginFlow.errorKey.value = null"
        >
          {{ t(loginFlow.errorKey.value) }}
        </VAlert>

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

    <img
      ref="pwaBadgeEl"
      :src="pwaBadgeUrl"
      :alt="t('user.login.pwaBadge')"
      class="auth-view__pwa-badge"
      :class="{ 'auth-view__pwa-badge--visible': badgeVisible }"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, inject, onMounted, onBeforeUnmount, nextTick } from "vue";
import type { Ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { brandColors } from "@brand/colors";
import { BRAND_PWA_BADGE_URL } from "@brand/logos";
import { createUseLoginFlow } from "../composables/useLoginFlow";
import { createUseForgotPasswordFlow } from "../composables/useForgotPasswordFlow";
import { createUseResetPasswordFlow } from "../composables/useResetPasswordFlow";
import { useMagneticPointer } from "../composables/useMagneticPointer";
import { AUTH_BACKGROUND_EXIT_KEY } from "../composables/authBackgroundExit";
import type { ApiFetchOptions } from "@api";
import AuthChrome from "../components/AuthChrome.vue";
import AuthCard from "../components/AuthCard.vue";

const pwaBadgeUrl = BRAND_PWA_BADGE_URL;

type ApiFetchFn = (path: string, options?: ApiFetchOptions) => Promise<Response>;
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

const useLoginFlow = createUseLoginFlow(apiFetch);
const loginFlow = useLoginFlow();

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
  () => loginFlow.loading.value || forgotFlow.loading.value || resetFlow.loading.value,
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

// Decorative orbs behind the card — small floats the most, medium a middle
// amount, big the least, same "lighter things move more" depth logic as the
// logo/badge split in AuthChrome.
const bigOrbEl = ref<HTMLElement | null>(null);
const mediumOrbEl = ref<HTMLElement | null>(null);
const smallOrbEl = ref<HTMLElement | null>(null);
useMagneticPointer(bigOrbEl, { strength: 8, ease: 0.06 });
useMagneticPointer(mediumOrbEl, { strength: 16, ease: 0.11 });
useMagneticPointer(smallOrbEl, { strength: 26, ease: 0.18 });

// The orb anchors below are positioned in % of .auth-view__orbs' own box, so
// that box needs a stable height — but its parent (.auth-view__card-slot)
// wraps AuthCard, which animates its own height on every step change (see
// AuthCard.vue's viewportHeight). Left alone, the orbs box would inherit that
// live height and drag the orbs along with each signin/forgot/reset
// transition. Instead, measure the card-slot's box once on first paint and
// freeze it — the observer disconnects itself after the first reading, so
// later step transitions never touch orbsFrameHeight again.
const cardSlotEl = ref<HTMLElement | null>(null);
const orbsFrameHeight = ref("auto");
const orbsFrameStyle = computed(() => ({ height: orbsFrameHeight.value }));
let orbsResizeObserver: ResizeObserver | null = null;

onMounted(() => {
  if (!cardSlotEl.value) return;
  orbsResizeObserver = new ResizeObserver((entries) => {
    const height = entries[0]?.contentRect.height;
    if (!height) return;
    orbsFrameHeight.value = `${Math.ceil(height)}px`;
    orbsResizeObserver?.disconnect();
    orbsResizeObserver = null;
  });
  orbsResizeObserver.observe(cardSlotEl.value);
});

onBeforeUnmount(() => orbsResizeObserver?.disconnect());

// Barely-there — "bardzo malutko" — unlike the logo/badge pair in AuthChrome,
// which float noticeably more.
const pwaBadgeEl = ref<HTMLElement | null>(null);
useMagneticPointer(pwaBadgeEl, { strength: 4, ease: 0.14 });

// Whole-screen entrance/exit choreography: orbs (big → medium → small), then
// the card, then the logo, then the PWA badge — each one only starts once
// the previous has visibly settled, rather than everything popping in at
// once. playExitSequence() runs the same list in reverse (badge → logo →
// card → orbs) on successful login, plus the shared page background (see
// authBackgroundExit, injected from PublicLayout) — router.push only fires
// once the whole thing has faded, see handleSignIn.
//
// Each orb's own "life" comes from a scale keyframe rather than a plain fade
// (see auth-view-orb-pop-in/-out in <style>): grows from 0 past its resting
// size to a slight overshoot before settling back — pop-out mirrors that,
// growing a touch bigger before shrinking away to nothing.
type OrbPhase = "hidden" | "enter" | "exit";
const bigOrbPhase = ref<OrbPhase>("hidden");
const mediumOrbPhase = ref<OrbPhase>("hidden");
const smallOrbPhase = ref<OrbPhase>("hidden");
const badgeVisible = ref(false);
const authBackgroundExit = inject(AUTH_BACKGROUND_EXIT_KEY, undefined);

function orbAnchorPhaseClass(phase: OrbPhase): Record<string, boolean> {
  return {
    "auth-view__orb-anchor--enter": phase === "enter",
    "auth-view__orb-anchor--exit": phase === "exit",
  };
}

// The gaps between each orb starting, and how long each one's own pop
// animation takes, all come from the Fibonacci sequence (in ms) instead of
// evenly-spaced numbers — a growing, organic rhythm rather than a metronome.
const FIB = { orbGap1: 89, orbGap2: 144, popInDuration: 610, popOutDuration: 377 };
const BADGE_ENTER_DELAY = 150;
const BADGE_EXIT_DURATION = 250;

const prefersReducedMotion =
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

onMounted(async () => {
  if (prefersReducedMotion) {
    bigOrbPhase.value = "enter";
    mediumOrbPhase.value = "enter";
    smallOrbPhase.value = "enter";
    badgeVisible.value = true;
    return;
  }
  bigOrbPhase.value = "enter";
  await wait(FIB.orbGap1);
  mediumOrbPhase.value = "enter";
  await wait(FIB.orbGap2);
  smallOrbPhase.value = "enter";
  await wait(FIB.popInDuration);
  await authCardRef.value?.playEnter();
  await authChromeRef.value?.playEnter();
  await wait(BADGE_ENTER_DELAY);
  badgeVisible.value = true;
});

async function playExitSequence(): Promise<void> {
  if (prefersReducedMotion) {
    await authBackgroundExit?.();
    return;
  }
  badgeVisible.value = false;
  await wait(BADGE_EXIT_DURATION);
  await authChromeRef.value?.playExit();
  await authCardRef.value?.playExit();
  smallOrbPhase.value = "exit";
  await wait(FIB.orbGap2);
  mediumOrbPhase.value = "exit";
  await wait(FIB.orbGap1);
  bigOrbPhase.value = "exit";
  await wait(FIB.popOutDuration);
  await authBackgroundExit?.();
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
      // no-op: unsupported input type, focus() above is enough
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

/* Shared positioning box for the card and the decorative orbs behind it
   (see .auth-view__orbs) — orbs size themselves as a percentage of this, so
   they scale with the card instead of needing separate fixed px math. */
.auth-view__card-slot {
  position: relative;
  width: 100%;
  max-width: 420px;
}

.auth-view__card {
  position: relative;
  z-index: 1;
  width: 100%;
  /* No background here — VCard already themes its own surface color (light
     vs dark) via --v-theme-surface; a fixed white would fight that. */
  border: 1px solid color-mix(in srgb, var(--auth-view-card-accent) 28%, transparent);
}

/* Behind the card (z-index: 0 < the card's 1), overflowing its box on
   purpose so the three circles peek out around its edges. Height comes from
   orbsFrameStyle (frozen on first paint, see script), not inset:0 — this box
   must NOT track .auth-view__card-slot's live height, which animates on
   every step change. */
.auth-view__orbs {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  z-index: 0;
  overflow: visible;
  pointer-events: none;
}

/* Static position/size only — the magnetic transform lives on the .auth-view__orb
   span inside each (see script), never on the same element as this one.
   Entrance/exit "life" comes from a scale keyframe here too (see
   auth-view-orb-pop-in/-out below) rather than on the span: the span's own
   auth-view-orb-pulse animation touches transform every frame too (for the
   magnetic pointer), which would fight a keyframe placed on that element. */
.auth-view__orb-anchor {
  position: absolute;
  aspect-ratio: 1;
  transform: scale(0);
}

.auth-view__orb-anchor--big {
  width: 150%;
  top: 56%;
  left: 70%;
  transform: translate(-50%, -50%) scale(0);
}

.auth-view__orb-anchor--medium {
  width: 78%;
  bottom: 35%;
  left: -17%;
}

.auth-view__orb-anchor--small {
  width: 102%;
  top: -11%;
  left: -48%;
}

/* Grows past its resting size (105%) before settling back to 100% — a small
   bounce rather than a flat fade, so the orbs read as more alive while they
   sit there. --big carries its own centering translate (see above), so it
   gets its own keyframes that keep that translate at every step instead of
   one transform declaration clobbering the other. */
.auth-view__orb-anchor--enter {
  animation: auth-view-orb-pop-in 610ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

.auth-view__orb-anchor--big.auth-view__orb-anchor--enter {
  animation-name: auth-view-orb-pop-in-centered;
}

/* Mirrors the entrance the other way — grows to 110% first, then shrinks
   away to nothing, instead of just fading out. */
.auth-view__orb-anchor--exit {
  animation: auth-view-orb-pop-out 377ms cubic-bezier(0.4, 0, 0.7, 0.4) forwards;
}

.auth-view__orb-anchor--big.auth-view__orb-anchor--exit {
  animation-name: auth-view-orb-pop-out-centered;
}

@keyframes auth-view-orb-pop-in {
  0% {
    transform: scale(0);
  }
  65% {
    transform: scale(1.05);
  }
  100% {
    transform: scale(1);
  }
}

@keyframes auth-view-orb-pop-in-centered {
  0% {
    transform: translate(-50%, -50%) scale(0);
  }
  65% {
    transform: translate(-50%, -50%) scale(1.05);
  }
  100% {
    transform: translate(-50%, -50%) scale(1);
  }
}

@keyframes auth-view-orb-pop-out {
  0% {
    transform: scale(1);
  }
  35% {
    transform: scale(1.1);
  }
  100% {
    transform: scale(0);
  }
}

@keyframes auth-view-orb-pop-out-centered {
  0% {
    transform: translate(-50%, -50%) scale(1);
  }
  35% {
    transform: translate(-50%, -50%) scale(1.1);
  }
  100% {
    transform: translate(-50%, -50%) scale(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .auth-view__orb-anchor--enter {
    animation: none;
    transform: scale(1);
  }

  .auth-view__orb-anchor--big.auth-view__orb-anchor--enter {
    transform: translate(-50%, -50%) scale(1);
  }

  .auth-view__orb-anchor--exit {
    animation: none;
    transform: scale(0);
  }

  .auth-view__orb-anchor--big.auth-view__orb-anchor--exit {
    transform: translate(-50%, -50%) scale(0);
  }
}

.auth-view__orb {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: rgb(var(--v-theme-primary));
  animation: auth-view-orb-pulse 8s ease-in-out infinite alternate;
  will-change: transform;
}

.auth-view__orb--big {
  opacity: 0.42;
}

.auth-view__orb--medium {
  /* Lighter than the other two (which stay plain rgb(var(--v-theme-primary)))
     so the three don't read as one flat, same-toned shape. */
  background: color-mix(in srgb, rgb(var(--v-theme-primary)) 55%, white 45%);
  opacity: 0.5;
  animation-delay: -1.5s;
}

.auth-view__orb--small {
  opacity: 0.55;
  animation-delay: -3s;
}

/* Gentle breathing, not synced 1:1 with the page background's own flow
   animation (they'd fight for attention) — just a similar unhurried pace,
   staggered per orb (animation-delay above) so the three drift out of phase.
   Raised from the original 0.22–0.5 range so the orbs cover the photo/gradient
   underneath more (see PublicLayout.vue) — capped below 0.7 so even at their
   most opaque point, what's behind still shows through a little. */
@keyframes auth-view-orb-pulse {
  0% {
    opacity: 0.34;
  }
  100% {
    opacity: 0.68;
  }
}

@media (prefers-reduced-motion: reduce) {
  .auth-view__orb {
    animation: none;
  }
}

/* Below the card now, not next to the logo (see AuthChrome) — logo, card,
   badge, top to bottom. Magnetic transform target (see useMagneticPointer in
   <script>) — written to directly every frame, so it stays free of any CSS
   transition of its own. */
.auth-view__pwa-badge {
  position: relative;
  z-index: 1;
  flex: none;
  height: 24px;
  width: auto;
  object-fit: contain;
  opacity: 0;
  will-change: transform;
  /* opacity only, not transform — transform is written to directly every
     frame by the magnetic pointer above; transitioning it too would make
     that continuous per-frame tracking lag/animate instead of following the
     pointer 1:1. */
  transition: opacity 0.3s ease-out;
}

.auth-view__pwa-badge--visible {
  opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
  .auth-view__pwa-badge {
    transition: none;
  }
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
