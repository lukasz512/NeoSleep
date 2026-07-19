<template>
  <Teleport to="body">
    <div class="notif-hub">
      <Transition name="notif" @after-leave="onAfterLeave">
        <div
          v-if="visible && current"
          :key="current.id"
          class="notif-toast"
          :class="`notif-toast--${current.type}`"
          role="status"
          @click="triggerDismiss"
          @touchstart.passive="onTouchStart"
          @touchend.passive="onTouchEnd"
        >
          <span class="notif-toast__msg">{{ current.key ? t(current.key) : current.message }}</span>
          <div v-if="current.type !== 'error'" class="notif-toast__bar" :style="barStyle" />
        </div>
      </Transition>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, computed, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";
import { useNotifications } from "../composables/useNotifications";

const TIMEOUT = 4000;

const { t } = useI18n();
const { current, dismissCurrent } = useNotifications();
const visible = ref(false);
let timer: ReturnType<typeof setTimeout> | null = null;
let touchStartY = 0;

function clearTimer() {
  if (timer) { clearTimeout(timer); timer = null; }
}

function triggerDismiss() {
  clearTimer();
  visible.value = false; // transition plays, onAfterLeave calls dismissCurrent
}

function onAfterLeave() {
  dismissCurrent();
  // Show next if any
  if (current.value) visible.value = true;
}

watch(current, (val) => {
  if (val) {
    clearTimer();
    // Errors stay up until the rep taps/swipes them away — a 4s auto-dismiss
    // is too easy to miss while attention is on a form, and the message is
    // often the only feedback the rep gets that their submit failed.
    if (val.type !== "error") timer = setTimeout(triggerDismiss, TIMEOUT);
    if (!visible.value) visible.value = true;
  }
}, { immediate: true });

function onTouchStart(e: TouchEvent) {
  touchStartY = e.touches[0].clientY;
}
function onTouchEnd(e: TouchEvent) {
  const deltaY = e.changedTouches[0].clientY - touchStartY;
  if (deltaY < -40) triggerDismiss(); // swipe up
}

const barStyle = computed(() => ({
  animationDuration: `${TIMEOUT}ms`,
}));

onUnmounted(clearTimer);
</script>

<style scoped>
.notif-hub {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  pointer-events: none;
  width: min(400px, calc(100vw - 32px));
}

.notif-toast {
  pointer-events: all;
  padding: 14px 20px 16px;
  border-radius: 18px;
  cursor: pointer;
  overflow: hidden;
  position: relative;
  backdrop-filter: blur(24px) saturate(160%);
  -webkit-backdrop-filter: blur(24px) saturate(160%);
  background: rgba(20, 20, 30, 0.78);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 0.9rem;
  font-weight: 400;
  line-height: 1.4;
  user-select: none;
  -webkit-user-select: none;
}

.notif-toast--success { background: rgba(15, 80, 40, 0.85); }
.notif-toast--error   { background: rgba(110, 20, 20, 0.88); }
.notif-toast--warning { background: rgba(100, 50, 10, 0.85); }
.notif-toast--info    { background: rgba(20, 50, 120, 0.85); }

.notif-toast__msg {
  display: block;
  opacity: 0.95;
}

.notif-toast__bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: rgba(255, 255, 255, 0.45);
  transform-origin: left center;
  animation: notif-bar linear forwards;
}

@keyframes notif-bar {
  from { transform: scaleX(1); }
  to   { transform: scaleX(0); }
}

/* Slide up enter / slide down leave */
.notif-enter-active {
  transition: transform 0.38s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s ease;
}
.notif-leave-active {
  transition: transform 0.28s ease-in, opacity 0.22s ease;
}
.notif-enter-from,
.notif-leave-to {
  transform: translateY(64px);
  opacity: 0;
}
</style>
