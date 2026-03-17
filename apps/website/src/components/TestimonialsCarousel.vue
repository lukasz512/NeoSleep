<template>
  <section
    class="tc"
    @mouseenter="pause"
    @mouseleave="resume"
    @focusin="pause"
    @focusout="resume"
  >
    <div class="tc__inner page-container">

      <Transition name="tc-fade" mode="out-in">
        <div :key="current" class="tc__item">

          <div class="tc__stars" aria-hidden="true">
            <svg
              v-for="i in items[current].rating"
              :key="i"
              viewBox="0 0 24 24"
              fill="currentColor"
            ><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
          </div>

          <blockquote class="tc__quote">
            {{ t(items[current].quoteKey) }}
          </blockquote>

          <div class="tc__author">
            <span class="tc__author-name">{{ t(items[current].authorKey) }}</span>
            <span class="tc__author-sep" aria-hidden="true">·</span>
            <span class="tc__author-role">{{ t(items[current].roleKey) }}</span>
          </div>

        </div>
      </Transition>

      <div class="tc__dots" role="tablist">
        <button
          v-for="(_, i) in items"
          :key="i"
          class="tc__dot"
          :class="{ 'tc__dot--active': current === i }"
          role="tab"
          :aria-selected="current === i"
          :aria-label="`Testimonial ${i + 1}`"
          @click="goTo(i)"
        />
      </div>

    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { patientTestimonials } from '../config/patientsConfig'

const { t } = useI18n()
const items   = patientTestimonials
const current = ref(0)
let timer: ReturnType<typeof setInterval> | null = null

function goTo(i: number) {
  current.value = i
  resetTimer()
}

function next() {
  current.value = (current.value + 1) % items.length
}

function startTimer() {
  timer = setInterval(next, 5000)
}

function resetTimer() {
  if (timer) clearInterval(timer)
  startTimer()
}

function pause()  { if (timer) clearInterval(timer) }
function resume() { startTimer() }

onMounted(startTimer)
onUnmounted(() => { if (timer) clearInterval(timer) })
</script>

<style lang="scss" scoped>
$bp-mobile: 600px;

.tc {
  padding: 5rem 0 4.5rem;
  background: var(--website-bg);

  @media (max-width: $bp-mobile) {
    padding: 3.5rem 0 3rem;
  }
}

.tc__inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2.5rem;
}

.tc__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  max-width: 660px;
  gap: 1.25rem;
}

.tc__stars {
  display: flex;
  gap: 0.25rem;

  svg {
    width: 16px;
    height: 16px;
    color: var(--website-primary);
    opacity: 0.8;
  }
}

.tc__quote {
  font-size: clamp(1.125rem, 2.5vw, 1.375rem);
  font-style: italic;
  line-height: 1.75;
  color: var(--website-text);
  margin: 0;
  min-height: calc(1.375rem * 1.75 * 3); /* reserve 3 lines at max size */

  &::before { content: '\201C'; margin-right: 0.05em; color: var(--website-primary); opacity: 0.5; }
  &::after  { content: '\201D'; margin-left:  0.05em; color: var(--website-primary); opacity: 0.5; }
}

.tc__author {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  justify-content: center;
}

.tc__author-name {
  font-size: 0.9375rem;
  font-weight: 700;
  color: var(--website-text);
}

.tc__author-sep {
  color: var(--website-text-secondary);
  font-size: 0.875rem;
}

.tc__author-role {
  font-size: 0.875rem;
  color: var(--website-text-secondary);
}

/* ── Dots ──────────────────────────────────────────────────────────────── */
.tc__dots {
  display: flex;
  gap: 0.5rem;
}

.tc__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  border: none;
  background: var(--website-primary);
  opacity: 0.25;
  cursor: pointer;
  padding: 0;
  transition: opacity 0.2s, transform 0.2s;
  outline: none;

  &--active {
    opacity: 1;
    transform: scale(1.35);
  }

  &:focus-visible {
    box-shadow: 0 0 0 3px rgba(18, 143, 131, 0.3);
    opacity: 0.7;
  }
}

/* ── Fade transition ───────────────────────────────────────────────────── */
.tc-fade-enter-active,
.tc-fade-leave-active {
  transition: opacity 0.35s ease, transform 0.35s ease;
}

.tc-fade-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.tc-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
