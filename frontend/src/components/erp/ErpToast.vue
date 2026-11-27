<script setup lang="ts">
import type { Component } from 'vue'
import Toast, { type ToastMessageOptions } from 'primevue/toast'
import { CircleCheck, CircleX, Info, TriangleAlert, X } from '@lucide/vue'

/**
 * Every toast in the ERP, mounted once in App.vue. PrimeVue keeps the queue, the timer and the ARIA; this draws each
 * message as an ERP card: white, the card border and radius, the severity as a round badge in the status-chip colours
 * (the same in every module, as the chips are), the title in the page's text colour, the detail muted, and a thin bar
 * that runs down the time left. Pointing at a toast keeps it open (PrimeVue pauses its timer, the bar pauses with it).
 * It sits under the top bar, so it never covers Alerts or the user menu. Tokens: DESIGN_TOKENS.md → Toasts.
 */
type Tone = 'done' | 'released' | 'pending' | 'cancelled'
const LOOK: Record<string, { icon: Component; tone: Tone }> = {
  success: { icon: CircleCheck, tone: 'done' },
  info: { icon: Info, tone: 'released' },
  warn: { icon: TriangleAlert, tone: 'pending' },
  error: { icon: CircleX, tone: 'cancelled' },
}
const look = (message: ToastMessageOptions) => LOOK[message.severity ?? 'info'] ?? LOOK.info!

// PrimeVue pauses a toast's timer while the pointer is on it only when these handlers are given.
const keepOpen = () => {}
const PHONE = { '640px': { width: 'calc(100vw - 32px)', right: '16px', left: '16px' } }
</script>

<template>
  <Toast position="top-right" class="erp-toast" :breakpoints="PHONE" :on-mouse-enter="keepOpen" :on-mouse-leave="keepOpen">
    <template #container="{ message, closeCallback }">
      <div class="erp-toast-body" :data-tone="look(message).tone">
        <span class="erp-toast-badge" aria-hidden="true"><component :is="look(message).icon" :size="16" :stroke-width="2.25" /></span>
        <div class="erp-toast-text">
          <p class="erp-toast-title">{{ message.summary }}</p>
          <p v-if="message.detail" class="erp-toast-detail">{{ message.detail }}</p>
        </div>
        <button v-if="message.closable !== false" type="button" class="erp-toast-close" aria-label="Close" @click="closeCallback">
          <X :size="14" :stroke-width="2.25" aria-hidden="true" />
        </button>
        <span v-if="message.life" class="erp-toast-timer" :style="{ animationDuration: `${message.life}ms` }" aria-hidden="true" />
      </div>
    </template>
  </Toast>
</template>

<style>
/* Not scoped: PrimeVue draws the message frame (.p-toast-message) in a portal on <body>. Unlayered, so it wins over
   PrimeVue's own layer without fighting its specificity. */
.erp-toast {
  width: 352px;
  /* Under the top bar (64px) and in line with the page panel's right edge. PrimeVue sets 20px inline, hence
     !important; under 640px the breakpoint in the template takes the whole width. */
  top: 72px !important;
  right: 16px !important;
}
.erp-toast .p-toast-message {
  margin: 0 0 10px;
  overflow: hidden;
  border: 1px solid var(--erp-input-border);
  border-radius: var(--erp-radius-lg);
  background: var(--erp-card);
  color: var(--erp-text);
  box-shadow: var(--toast-shadow);
  backdrop-filter: none;
}
.erp-toast-body {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-height: 0; /* lets the leave animation fold the card away */
  overflow: hidden;
  padding: 14px 10px 14px 15px;
  font-family: var(--erp-font);
}
.erp-toast-body[data-tone='done'] {
  --toast-tone: var(--chip-done-text);
  --toast-tone-bg: var(--chip-done-bg);
}
.erp-toast-body[data-tone='released'] {
  --toast-tone: var(--chip-released-text);
  --toast-tone-bg: var(--chip-released-bg);
}
.erp-toast-body[data-tone='pending'] {
  --toast-tone: var(--chip-pending-text);
  --toast-tone-bg: var(--chip-pending-bg);
}
.erp-toast-body[data-tone='cancelled'] {
  --toast-tone: var(--chip-cancelled-text);
  --toast-tone-bg: var(--chip-cancelled-bg);
}
.erp-toast-badge {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--toast-tone-bg);
  color: var(--toast-tone);
}
.erp-toast-text {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 2px;
  padding-top: 5px;
}
.erp-toast-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  line-height: 20px;
  color: var(--erp-text);
}
.erp-toast-detail {
  margin: 0;
  font-size: 13px;
  line-height: 18px;
  color: var(--erp-muted);
}
.erp-toast-close {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin-top: 1px;
  padding: 0;
  border: 0;
  border-radius: 9999px;
  background: transparent;
  color: var(--erp-muted);
  cursor: pointer;
  transition:
    background 150ms,
    color 150ms;
}
.erp-toast-close:hover {
  background: var(--erp-muted-bg);
  color: var(--erp-text);
}
.erp-toast-close:focus-visible {
  outline: 2px solid var(--erp-link);
  outline-offset: 1px;
}
/* The time left: a thin bar along the bottom in the severity colour, paused while the pointer is on the toast. */
.erp-toast-timer {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 3px;
  background: var(--toast-tone);
  opacity: 0.75;
  transform-origin: left center;
  animation: erp-toast-time linear forwards;
}
.erp-toast .p-toast-message:hover .erp-toast-timer {
  animation-play-state: paused;
}
/* In from the right and out folding up, with the module layout's motion. */
.erp-toast .p-toast-message-enter-active {
  animation: erp-toast-in 300ms cubic-bezier(0.16, 1, 0.3, 1);
}
.erp-toast .p-toast-message-leave-active {
  animation: erp-toast-out 220ms ease-in forwards;
}
@keyframes erp-toast-time {
  from {
    transform: scaleX(1);
  }
  to {
    transform: scaleX(0);
  }
}
@keyframes erp-toast-in {
  from {
    opacity: 0;
    transform: translateX(24px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@keyframes erp-toast-out {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
    margin-bottom: 0;
    grid-template-rows: 0fr;
    transform: translateX(24px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .erp-toast .p-toast-message-enter-active,
  .erp-toast .p-toast-message-leave-active {
    animation: none;
  }
  .erp-toast-timer {
    display: none;
  }
}
</style>
