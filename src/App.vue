<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { App as NativeApp } from '@capacitor/app'
import { IonApp, IonRouterOutlet } from '@ionic/vue'
import { useRoute } from 'vue-router'
import BottomNav from '@/components/BottomNav.vue'
import { useQuizStore } from '@/stores/quizStore'
import { applyThemeMode, normalizeThemeMode } from '@/theme'

const store = useQuizStore()
const route = useRoute()
const bottomNavPaths = new Set(['/', '/sources', '/library', '/history', '/settings'])
const showBottomNav = computed(() => bottomNavPaths.has(route.path))
const exitHintVisible = ref(false)
let lastPrimaryBackAt = 0
let exitHintTimer: number | undefined

interface IonBackButtonDetail {
  register: (priority: number, handler: () => void | Promise<void>) => void
}

function resetExitHint(): void {
  window.clearTimeout(exitHintTimer)
  exitHintTimer = undefined
  exitHintVisible.value = false
  lastPrimaryBackAt = 0
}

function handleHardwareBack(event: Event): void {
  if (!bottomNavPaths.has(route.path) || store.loading || Boolean(store.error)) return
  const detail = (event as CustomEvent<IonBackButtonDetail>).detail
  detail?.register(50, async () => {
    const now = Date.now()
    if (exitHintVisible.value && now - lastPrimaryBackAt <= 2_000) {
      resetExitHint()
      await NativeApp.exitApp()
      return
    }
    lastPrimaryBackAt = now
    exitHintVisible.value = true
    window.clearTimeout(exitHintTimer)
    exitHintTimer = window.setTimeout(resetExitHint, 2_000)
  })
}

onMounted(() => {
  void store.init()
  document.addEventListener('ionBackButton', handleHardwareBack)
})
onBeforeUnmount(() => {
  document.removeEventListener('ionBackButton', handleHardwareBack)
  resetExitHint()
})
watch(() => route.path, resetExitHint)
watch(
  [() => store.ready, () => store.data.settings.themeMode],
  ([ready, themeMode]) => {
    if (ready) applyThemeMode(normalizeThemeMode(themeMode))
  },
  { immediate: true },
)
</script>

<template>
  <IonApp>
    <div v-if="store.loading" class="splash-state">
      <div class="brand-mark">知</div>
      <strong>正在准备本地题库…</strong>
    </div>
    <div v-else-if="store.error" class="splash-state error-state">
      <div class="brand-mark">!</div>
      <strong>数据库初始化失败</strong>
      <p>{{ store.error }}</p>
    </div>
    <IonRouterOutlet v-else />
    <BottomNav v-if="!store.loading && !store.error && showBottomNav" />
    <div v-if="exitHintVisible" class="toast">再次返回退出知题</div>
  </IonApp>
</template>
