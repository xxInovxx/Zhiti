<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { IonContent, IonPage, onIonViewDidEnter } from '@ionic/vue'
import AppHeader from '@/components/AppHeader.vue'
import type { PracticeScope } from '@/domain/models'
import { countAnswerable } from '@/modules/practice/practiceEngine'
import { useQuizStore } from '@/stores/quizStore'

const store = useQuizStore()
const route = useRoute()
const router = useRouter()
const projectId = String(route.params.id ?? '')
const project = computed(() => store.data.projects.find((item) => item.id === projectId))
const practiceScope = ref<PracticeScope>(route.query.scope === 'HISTORICAL_WRONG' ? 'HISTORICAL_WRONG' : 'ALL')
const exam = reactive({
  singleCount: 0, multipleCount: 0, judgeCount: 0, fillCount: 0, caseCount: 0, timeLimitMinutes: 30,
  singleRatio: 1, multipleRatio: 1, judgeRatio: 1, fillRatio: 1, caseRatio: 1,
})
const busy = ref(false)
const message = ref('')
let checkingResume = false

onIonViewDidEnter(async () => {
  if (checkingResume) return
  const unfinished = store.data.sessions.find((session) => (
    session.projectId === projectId && session.mode === 'EXAM' && session.status === 'ACTIVE'
  ))
  if (!unfinished) return
  checkingResume = true
  try {
    if (window.confirm('检测到上一次随机组卷还未交卷，是否继续答题？')) {
      await router.replace(`/practice/${unfinished.id}`)
    }
  } finally { checkingResume = false }
})

const scopedUnits = computed(() => store.getScopedProjectUnits(projectId, practiceScope.value))
const availability = computed(() => ({
  single: scopedUnits.value.filter((unit) => !unit.context && unit.questions[0]?.answerMode === 'SINGLE').length,
  multiple: scopedUnits.value.filter((unit) => !unit.context && unit.questions[0]?.answerMode === 'MULTIPLE').length,
  judge: scopedUnits.value.filter((unit) => !unit.context && unit.questions[0]?.answerMode === 'JUDGE').length,
  fill: scopedUnits.value.filter((unit) => !unit.context && unit.questions[0]?.answerMode === 'FILL').length,
  cases: scopedUnits.value.filter((unit) => unit.context?.nodeType === 'CASE').length,
}))
const scopeCounts = computed(() => ({
  all: countAnswerable(store.getScopedProjectUnits(projectId, 'ALL')),
  wrong: countAnswerable(store.getScopedProjectUnits(projectId, 'HISTORICAL_WRONG')),
}))

async function startExam(): Promise<void> {
  if (!project.value || busy.value) return
  const selectedRatioTotal = [
    exam.singleCount > 0 ? exam.singleRatio : 0,
    exam.multipleCount > 0 ? exam.multipleRatio : 0,
    exam.judgeCount > 0 ? exam.judgeRatio : 0,
    exam.fillCount > 0 ? exam.fillRatio : 0,
    exam.caseCount > 0 ? exam.caseRatio : 0,
  ].reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0)
  if (selectedRatioTotal <= 0) return flash('请至少为已选题型设置一个大于 0 的分数比值')
  busy.value = true
  try {
    const session = await store.startPractice(projectId, 'EXAM', exam, practiceScope.value)
    await router.replace(`/practice/${session.id}`)
  } catch (error) {
    flash((error as Error).message)
  } finally { busy.value = false }
}

function flash(text: string): void {
  message.value = text
  window.setTimeout(() => { message.value = '' }, 2300)
}
</script>

<template>
  <IonPage>
    <AppHeader
      :title="project ? `${project.name} · 随机组卷` : '项目不存在'"
      subtitle="选择题目范围、各题型数量和答题时间"
      back
    />
    <IonContent :fullscreen="true">
      <main v-if="project" class="page-content no-nav exam-setup-page">
        <section class="card exam-scope-card">
          <h3>题目范围</h3>
          <div class="tabs">
            <button :class="{ active: practiceScope === 'ALL' }" @click="practiceScope = 'ALL'">全部题目 {{ scopeCounts.all }}</button>
            <button :class="{ active: practiceScope === 'HISTORICAL_WRONG' }" @click="practiceScope = 'HISTORICAL_WRONG'">历史错题 {{ scopeCounts.wrong }}</button>
          </div>
          <p>当前范围共有 {{ scopedUnits.length }} 个可抽取题目单元。</p>
        </section>

        <div class="section-heading"><h2>组卷设置</h2><span>按题型顺序出题</span></div>
        <section class="card form-card">
          <div class="stats-grid">
            <label class="field"><span>单选（可选 {{ availability.single }}）</span><input v-model.number="exam.singleCount" type="number" min="0" :max="availability.single" /></label>
            <label class="field"><span>多选（可选 {{ availability.multiple }}）</span><input v-model.number="exam.multipleCount" type="number" min="0" :max="availability.multiple" /></label>
            <label class="field"><span>判断（可选 {{ availability.judge }}）</span><input v-model.number="exam.judgeCount" type="number" min="0" :max="availability.judge" /></label>
            <label class="field"><span>填空（可选 {{ availability.fill }}）</span><input v-model.number="exam.fillCount" type="number" min="0" :max="availability.fill" /></label>
            <label class="field">
              <span>{{ store.data.settings.splitCaseQuestions ? '案例小题' : '案例题' }}（可选 {{ availability.cases }}）</span>
              <input v-model.number="exam.caseCount" type="number" min="0" :max="availability.cases" />
            </label>
          </div>
          <div class="score-heading"><h3>各题型分数比值</h3><span>按比例折算为 100 分</span></div>
          <div class="stats-grid score-grid">
            <label class="field"><span>单选比值</span><input v-model.number="exam.singleRatio" type="number" min="0" step="0.1" /></label>
            <label class="field"><span>多选比值</span><input v-model.number="exam.multipleRatio" type="number" min="0" step="0.1" /></label>
            <label class="field"><span>判断比值</span><input v-model.number="exam.judgeRatio" type="number" min="0" step="0.1" /></label>
            <label class="field"><span>填空比值</span><input v-model.number="exam.fillRatio" type="number" min="0" step="0.1" /></label>
            <label class="field"><span>案例比值</span><input v-model.number="exam.caseRatio" type="number" min="0" step="0.1" /></label>
          </div>
          <label class="field"><span>限时（分钟）</span><input v-model.number="exam.timeLimitMinutes" type="number" min="1" max="600" /></label>
          <button class="primary-button wide-button" :disabled="busy" @click="startExam">
            {{ busy ? '正在生成…' : '生成试卷' }}
          </button>
        </section>
      </main>

      <div v-else class="empty-state">
        <h3>项目不存在</h3>
        <button class="primary-button" @click="router.replace('/')">返回学习页</button>
      </div>
      <div v-if="message" class="toast">{{ message }}</div>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.exam-scope-card .tabs { margin: 14px 0 10px; }
.exam-scope-card p { margin-top: 0; }
.form-card .stats-grid .field { margin: 0; }
.score-heading { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin: 20px 0 8px; }
.score-heading h3 { margin: 0; font-size: 15px; }
.score-heading span { color: var(--muted); font-size: 11px; }
.score-grid { margin-bottom: 4px; }
.primary-button:disabled { opacity: .6; }
</style>
