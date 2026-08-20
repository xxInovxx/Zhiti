<script setup lang="ts">
import { ref } from 'vue'
import { IonContent, IonPage } from '@ionic/vue'
import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import AppHeader from '@/components/AppHeader.vue'
import LoadingOverlay from '@/components/LoadingOverlay.vue'
import { useQuizStore } from '@/stores/quizStore'
import type { AppSnapshot } from '@/domain/models'

const store = useQuizStore()
const message = ref('')
const restoring = ref(false)
const savingSetting = ref(false)

async function backup(): Promise<void> {
  let cachePath: string | null = null
  try {
    const content = JSON.stringify(store.exportSnapshot(), null, 2)
    const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 17)
    const name = `quiz-backup-${stamp}.json`
    if (Capacitor.isNativePlatform()) {
      const result = await Filesystem.writeFile({
        path: name, data: content, encoding: Encoding.UTF8, directory: Directory.Cache,
      })
      cachePath = name
      try {
        await Share.share({ title: '知题数据备份', url: result.uri, dialogTitle: '保存或分享备份' })
      } catch {
        try { await Filesystem.deleteFile({ path: name, directory: Directory.Cache }) } catch { /* best effort */ }
        return
      }
    } else {
      const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = name
      anchor.click()
      URL.revokeObjectURL(url)
    }
  } catch {
    if (cachePath && Capacitor.isNativePlatform()) {
      try { await Filesystem.deleteFile({ path: cachePath, directory: Directory.Cache }) } catch { /* best effort */ }
    }
  }
}

async function restore(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!window.confirm('恢复备份会覆盖当前全部数据，是否继续？')) return
  restoring.value = true
  try {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    const snapshot = JSON.parse(await file.text()) as AppSnapshot
    await store.restoreSnapshot(snapshot)
    flash('数据已恢复')
  } catch (error) {
    flash(`恢复失败：${(error as Error).message}`)
  } finally { restoring.value = false }
}

async function changeCaseSplit(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  savingSetting.value = true
  try {
    await store.setSplitCaseQuestions(input.checked)
    flash(input.checked ? '案例题将按小题拆分' : '案例题将合并后一次提交')
  } catch (error) {
    input.checked = store.data.settings.splitCaseQuestions
    flash(`设置保存失败：${(error as Error).message}`)
  } finally { savingSetting.value = false }
}

function flash(text: string): void {
  message.value = text
  window.setTimeout(() => { message.value = '' }, 2600)
}
</script>

<template>
  <IonPage>
    <AppHeader title="设置" subtitle="所有数据保存在本地" />
    <IonContent :fullscreen="true">
      <main class="page-content">
        <div class="section-heading"><h2>刷题设置</h2><span>全局生效</span></div>
        <label class="card global-setting-card">
          <span class="setting-copy">
            <strong>案例题小题拆分</strong>
            <small>开启后案例小题单独显示；关闭后同一案例的小题合并显示。</small>
          </span>
          <span class="switch-control">
            <input
              type="checkbox"
              :checked="store.data.settings.splitCaseQuestions"
              :disabled="savingSetting"
              aria-label="案例题小题拆分"
              @change="changeCaseSplit"
            />
            <i aria-hidden="true"></i>
          </span>
        </label>
        <div class="section-heading"><h2>数据安全</h2><span>建议定期备份</span></div>
        <section class="card">
          <h3>导出完整备份</h3>
          <p>包含 XLSX 题目、项目、全局错题与收藏、答题记录和刷题进度。</p>
          <button class="primary-button wide-button" style="margin-top:14px" @click="backup">导出 JSON 备份</button>
        </section>
        <label class="card" style="display:block; margin-top:12px">
          <input type="file" :disabled="restoring" accept="application/json,.json" style="display:none" @change="restore" />
          <h3>恢复备份</h3>
          <p>选择由本应用导出的 JSON 文件。恢复前会要求再次确认。</p>
          <div class="secondary-button" style="margin-top:14px;text-align:center">选择备份文件</div>
        </label>

        <div class="section-heading"><h2>存储概况</h2></div>
        <section class="stats-grid">
          <div class="stat-card"><strong>{{ store.data.sources.length }}</strong><span>XLSX 题库</span></div>
          <div class="stat-card"><strong>{{ store.data.projects.length }}</strong><span>刷题项目</span></div>
          <div class="stat-card"><strong>{{ store.data.questions.filter(q => q.answerMode !== 'NONE').length }}</strong><span>存储题目</span></div>
          <div class="stat-card"><strong>{{ store.data.sessions.filter(s => s.status === 'COMPLETED').length }}</strong><span>学习记录</span></div>
        </section>

        <div class="section-heading"><h2>关于</h2></div>
        <section class="card about-card">
            <h3>知题 1.0.0</h3>
          <p>Vue + Ionic + Capacitor 构建的离线刷题应用。</p>
          <div class="author-row">
            <span>作者</span>
            <a href="https://github.com/xxInovxx" target="_blank" rel="noopener noreferrer">xxInovxx · GitHub</a>
          </div>
          <nav class="about-links" aria-label="关于选项">
            <RouterLink class="settings-link" to="/usage-guide">
              <span>
                <strong>使用说明</strong>
                <small>功能介绍、题库格式与本地数据说明</small>
              </span>
              <span class="settings-link-arrow" aria-hidden="true">›</span>
            </RouterLink>
            <RouterLink class="settings-link" to="/open-source-licenses">
              <span>
                <strong>开源许可</strong>
                <small>第三方组件、版权声明与许可证文本</small>
              </span>
              <span class="settings-link-arrow" aria-hidden="true">›</span>
            </RouterLink>
            <RouterLink class="settings-link" to="/support-author">
              <span>
                <strong>支持作者</strong>
                <small>所有功能皆可免费使用</small>
              </span>
              <span class="settings-link-arrow" aria-hidden="true">›</span>
            </RouterLink>
          </nav>
        </section>
      </main>
      <LoadingOverlay v-if="restoring" text="正在恢复备份…" />
      <div v-if="message" class="toast">{{ message }}</div>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.global-setting-card { display: flex; align-items: center; justify-content: space-between; gap: 18px; }
.setting-copy { min-width: 0; }
.setting-copy strong, .setting-copy small { display: block; }
.setting-copy strong { font-size: 15px; }
.setting-copy small { margin-top: 6px; color: var(--muted); font-size: 12px; line-height: 1.55; }
.switch-control { position: relative; width: 52px; height: 30px; flex: 0 0 auto; }
.switch-control input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.switch-control i { position: absolute; inset: 0; border-radius: 99px; background: #c9cfcc; transition: .2s ease; }
.switch-control i::after { content: ''; position: absolute; width: 24px; height: 24px; left: 3px; top: 3px; border-radius: 50%; background: white; box-shadow: 0 2px 7px rgba(0,0,0,.18); transition: .2s ease; }
.switch-control input:checked + i { background: var(--primary); }
.switch-control input:checked + i::after { transform: translateX(22px); }
.switch-control input:focus-visible + i { box-shadow: 0 0 0 3px var(--primary-soft); }
.switch-control input:disabled + i { opacity: .6; }
.about-card > p { margin-bottom: 15px; }
.author-row { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 14px; color: var(--muted); font-size: 12px; }
.author-row a { color: var(--primary); font-weight: 800; }
.about-links { border-top: 1px solid var(--line); }
.settings-link { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 64px; padding: 12px 2px; }
.settings-link + .settings-link { box-shadow: inset 0 1px 0 var(--line); }
.settings-link strong, .settings-link small { display: block; }
.settings-link strong { font-size: 14px; }
.settings-link small { margin-top: 4px; color: var(--muted); font-size: 11px; }
.settings-link-arrow { color: var(--primary); font-size: 24px; line-height: 1; }
</style>
