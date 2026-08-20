<script setup lang="ts">
defineProps<{ text: string }>()
</script>

<template>
  <div class="loading-overlay" role="status" aria-live="polite" :aria-label="text">
    <div class="loading-dialog">
      <span class="loading-spinner" aria-hidden="true"></span>
      <strong>{{ text }}</strong>
      <small>请稍候，不要关闭应用</small>
    </div>
  </div>
</template>

<style scoped>
.loading-overlay {
  position: fixed;
  z-index: 120;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(20, 32, 27, .48);
  backdrop-filter: blur(3px);
}
.loading-dialog {
  width: min(100%, 270px);
  display: grid;
  justify-items: center;
  gap: 10px;
  padding: 25px 20px;
  border-radius: 20px;
  color: var(--ink);
  background: var(--paper);
  box-shadow: 0 18px 50px rgba(16, 30, 24, .2);
}
.loading-dialog small { color: var(--muted); }
.loading-spinner {
  width: 38px;
  height: 38px;
  border: 4px solid var(--primary-soft);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: loading-spin .75s linear infinite;
}
@keyframes loading-spin { to { transform: rotate(360deg); } }
</style>
