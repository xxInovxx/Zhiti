<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { IonContent, IonPage } from '@ionic/vue'
import AppHeader from '@/components/AppHeader.vue'
import type { PracticeScope } from '@/domain/models'
import { countAnswerable } from '@/modules/practice/practiceEngine'
import { useQuizStore } from '@/stores/quizStore'

const store = useQuizStore()
const route = useRoute()
const router = useRouter()
const projectId = route.params.id as string
const project = computed(() => store.data.projects.find((item) => item.id === projectId))
const stats = computed(() => store.getProjectStats(projectId))
const showEdit = ref(false)
const message = ref('')
const practiceScope = ref<PracticeScope>('ALL')
const edit = reactive({ name: '', description: '', sourceIds: [] as string[] })
const overviewEntries = computed(() => Object.entries(stats.value.byMode)
  .filter(([, value]) => value.total > 0))

function typeLabel(answerMode: string): string {
  if (answerMode === 'SINGLE') return '单选题'
  if (answerMode === 'MULTIPLE') return '多选题'
  if (answerMode === 'JUDGE') return '判断题'
  return '填空题'
}

const scopeCounts = computed(() => ({
  all: countAnswerable(store.getScopedProjectUnits(projectId, 'ALL')),
  wrong: countAnswerable(store.getScopedProjectUnits(projectId, 'HISTORICAL_WRONG')),
}))

async function start(mode: 'ORDERED' | 'RANDOM_CYCLE'): Promise<void> {
  try {
    const session = await store.startPractice(projectId, mode, undefined, practiceScope.value)
    await router.push(`/practice/${session.id}`)
  } catch (error) { flash((error as Error).message) }
}

async function openExamSetup(): Promise<void> {
  await router.push({
    path: `/project/${projectId}/exam`,
    query: { scope: practiceScope.value },
  })
}

async function openModeStatistics(mode: string): Promise<void> {
  await router.push({
    path: `/project/${projectId}/statistics`,
    query: { mode },
  })
}

function openEdit(): void {
  if (!project.value) return
  edit.name = project.value.name
  edit.description = project.value.description
  edit.sourceIds = [...project.value.sourceIds]
  showEdit.value = true
}

async function saveEdit(): Promise<void> {
  if (!project.value) return
  try {
    await store.saveProject({ id: project.value.id, ...edit })
    showEdit.value = false
    flash('项目已更新')
  } catch (error) { flash((error as Error).message) }
}

async function removeProject(): Promise<void> {
  if (!project.value || !window.confirm(`删除项目“${project.value.name}”？题目和全局学习记录不会被删除。`)) return
  await store.deleteProject(project.value.id)
  await router.replace('/')
}

function flash(text: string): void {
  message.value = text
  window.setTimeout(() => { message.value = '' }, 2300)
}
</script>

<template>
  <IonPage>
    <AppHeader :title="project?.name || '项目不存在'" :subtitle="project?.description" back>
      <button v-if="project" class="text-button" @click="openEdit">编辑</button>
    </AppHeader>
    <IonContent :fullscreen="true">
      <main v-if="project" class="page-content no-nav">
        <section class="stats-grid">
          <div class="stat-card"><strong>{{ stats.attempted }}</strong><span>已经学习</span></div>
          <div class="stat-card"><strong>{{ stats.attempts }}</strong><span>累计做题</span></div>
          <div class="stat-card"><strong>{{ stats.wrongActive }}</strong><span>当前错题</span></div>
          <div class="stat-card"><strong>{{ Math.round(stats.correctRate * 100) }}%</strong><span>正确率</span></div>
        </section>

        <div class="section-heading"><h2>开始刷题</h2><span>进度自动保存</span></div>
        <div class="tabs practice-scope-tabs">
          <button :class="{ active: practiceScope === 'ALL' }" @click="practiceScope = 'ALL'">全部题目 {{ scopeCounts.all }}</button>
          <button :class="{ active: practiceScope === 'HISTORICAL_WRONG' }" @click="practiceScope = 'HISTORICAL_WRONG'">历史错题 {{ scopeCounts.wrong }}</button>
        </div>
        <section class="mode-grid">
          <button class="card mode-card" @click="start('ORDERED')">
            <div class="mode-icon">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <path d="M7 8h7M7 12h10M7 16h7M14 6l2 2-2 2M14 14l2 2-2 2" />
              </svg>
            </div>
            <h3>顺序刷题</h3><p>按原始顺序学习，退出后可继续上次进度。</p>
          </button>
          <button class="card mode-card" @click="start('RANDOM_CYCLE')">
            <div class="mode-icon">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <path d="M7 7l10 10M14 17h3v-3M7 17 17 7M14 7h3v3" />
              </svg>
            </div>
            <h3>随机刷题</h3><p>完整刷完一轮之前不会出现重复题目。</p>
          </button>
          <button class="card mode-card" @click="openExamSetup">
            <div class="mode-icon">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <circle cx="12" cy="12" r="5" />
                <path d="M12 9v3l2 1" />
              </svg>
            </div>
            <h3>随机组卷</h3><p>按题型数量抽题，支持限时自动交卷。</p>
          </button>
        </section>

        <div class="section-heading">
          <h2>学习概况</h2>
          <button class="text-button" @click="router.push(`/project/${projectId}/statistics`)">查看题目明细 →</button>
        </div>
        <button v-for="[key, value] in overviewEntries" :key="key" class="card overview-card" @click="openModeStatistics(key)">
          <h3>{{ typeLabel(key) }}</h3>
          <p>已学习 {{ value.attempted }} / {{ value.total }} · 做题 {{ value.attempts }} 次 · 正确率 {{ Math.round(value.correctRate * 100) }}%</p>
          <div class="progress-track"><i :style="{ width: `${value.total ? value.attempted / value.total * 100 : 0}%` }"></i></div>
          <span class="overview-arrow">›</span>
        </button>
      </main>

      <div v-if="showEdit && project" class="modal-backdrop" @click.self="showEdit = false">
        <section class="card modal-card">
          <h3>编辑项目</h3>
          <label class="field"><span>名称</span><input v-model="edit.name" /></label>
          <label class="field"><span>说明</span><textarea v-model="edit.description" rows="2"></textarea></label>
          <label v-for="source in store.data.sources" :key="source.id" class="check-row">
            <input v-model="edit.sourceIds" type="checkbox" :value="source.id" />
            <span><strong>{{ source.name }}</strong><small>{{ source.questionCount }} 道题</small></span>
          </label>
          <div class="button-row"><button class="secondary-button" @click="showEdit = false">取消</button><button class="primary-button" @click="saveEdit">保存</button></div>
          <button class="danger-button wide-button" style="margin-top:10px" @click="removeProject">删除项目</button>
        </section>
      </div>
      <div v-if="message" class="toast">{{ message }}</div>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.modal-backdrop { position: fixed; z-index: 50; inset: 0; padding: 20px; display: grid; place-items: center; background: var(--overlay); }
.modal-card { width: min(100%, 520px); max-height: 85vh; overflow: auto; }
.overview-card { position: relative; width: 100%; padding-right: 48px; text-align: left; color: var(--ink); }
.overview-arrow { position: absolute; right: 19px; top: 50%; transform: translateY(-50%); color: var(--primary); font-size: 28px; }
.practice-scope-tabs { margin-bottom: 12px; }
</style>
