<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { IonContent, IonPage } from '@ionic/vue'
import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import AppHeader from '@/components/AppHeader.vue'
import rewardQrCodeUrl from '@/assets/reward-qrcode.png'

const message = ref('')
const rewardHolding = ref(false)
const savingReward = ref(false)
let rewardHoldTimer: number | undefined

onBeforeUnmount(() => window.clearTimeout(rewardHoldTimer))

function startRewardHold(): void {
  if (savingReward.value) return
  window.clearTimeout(rewardHoldTimer)
  rewardHolding.value = true
  rewardHoldTimer = window.setTimeout(() => {
    rewardHolding.value = false
    void saveRewardCode()
  }, 2000)
}

function cancelRewardHold(): void {
  window.clearTimeout(rewardHoldTimer)
  rewardHolding.value = false
}

async function rewardCodeBase64(): Promise<string> {
  const response = await fetch(rewardQrCodeUrl)
  if (!response.ok) throw new Error('无法读取赞赏码图片')
  const blob = await response.blob()
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('图片读取失败'))
    reader.readAsDataURL(blob)
  })
  return dataUrl.slice(dataUrl.indexOf(',') + 1)
}

async function saveRewardCode(): Promise<void> {
  savingReward.value = true
  const name = 'xxInovxx-赞赏码.png'
  try {
    if (Capacitor.isNativePlatform()) {
      await Filesystem.writeFile({
        path: `知题/${name}`,
        data: await rewardCodeBase64(),
        directory: Directory.Documents,
        recursive: true,
      })
      flash('赞赏码已保存到文档/知题目录')
    } else {
      const anchor = document.createElement('a')
      anchor.href = rewardQrCodeUrl
      anchor.download = name
      anchor.click()
      flash('赞赏码已保存')
    }
  } catch (error) {
    flash(`保存失败：${(error as Error).message}`)
  } finally { savingReward.value = false }
}

function flash(text: string): void {
  message.value = text
  window.setTimeout(() => { message.value = '' }, 2600)
}
</script>

<template>
  <IonPage>
    <AppHeader title="支持作者" subtitle="感谢您对知题的支持" back />
    <IonContent :fullscreen="true">
      <main class="page-content no-nav">
        <section class="card support-card">
          <h2>支持 xxInovxx</h2>
          <p>开源不易，如果这个项目为您节省了时间，欢迎请作者喝杯咖啡。</p>
          <button
            class="reward-code-button"
            :class="{ holding: rewardHolding }"
            :disabled="savingReward"
            aria-label="长按2秒保存赞赏码"
            @pointerdown="startRewardHold"
            @pointerup="cancelRewardHold"
            @pointercancel="cancelRewardHold"
            @pointerleave="cancelRewardHold"
            @contextmenu.prevent
          >
            <img :src="rewardQrCodeUrl" alt="xxInovxx 的赞赏码" draggable="false" />
          </button>
          <span class="reward-hint">{{ savingReward ? '正在保存…' : rewardHolding ? '请继续按住…' : '长按 2 秒保存赞赏码' }}</span>
        </section>
      </main>
      <div v-if="message" class="toast">{{ message }}</div>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.support-card { text-align: center; }
.support-card h2 { margin: 0 0 8px; font-size: 20px; }
.support-card > p { max-width: 480px; margin: 0 auto 17px; }
.reward-code-button { position: relative; display: block; width: min(100%, 430px); margin: auto; padding: 0; overflow: hidden; border: 1px solid var(--line); border-radius: 16px; background: white; touch-action: manipulation; user-select: none; -webkit-user-select: none; }
.reward-code-button img { display: block; width: 100%; pointer-events: none; user-select: none; -webkit-user-drag: none; }
.reward-code-button::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 6px; background: var(--accent); transform: scaleX(0); transform-origin: left; }
.reward-code-button.holding::after { animation: reward-hold 2s linear forwards; }
.reward-code-button:disabled { opacity: .72; }
.reward-hint { display: block; margin-top: 11px; color: var(--primary); font-size: 12px; font-weight: 800; }
@keyframes reward-hold { to { transform: scaleX(1); } }
</style>
