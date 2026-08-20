import { createRouter, createWebHistory } from '@ionic/vue-router'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  { path: '/', component: () => import('@/views/HomeView.vue') },
  { path: '/sources', component: () => import('@/views/SourcesView.vue') },
  { path: '/library', component: () => import('@/views/LibraryView.vue') },
  { path: '/history', component: () => import('@/views/HistoryView.vue') },
  { path: '/settings', component: () => import('@/views/SettingsView.vue') },
  { path: '/usage-guide', component: () => import('@/views/UsageGuideView.vue') },
  { path: '/open-source-licenses', component: () => import('@/views/OpenSourceLicensesView.vue') },
  { path: '/support-author', component: () => import('@/views/SupportAuthorView.vue') },
  { path: '/project/:id', component: () => import('@/views/ProjectView.vue') },
  { path: '/project/:id/exam', component: () => import('@/views/ExamSetupView.vue') },
  { path: '/project/:id/statistics', component: () => import('@/views/ProjectStatisticsView.vue') },
  { path: '/practice/:id', component: () => import('@/views/PracticeView.vue') },
  { path: '/result/:id/review', component: () => import('@/views/ResultReviewView.vue') },
  { path: '/result/:id', component: () => import('@/views/ResultView.vue') },
]

export default createRouter({ history: createWebHistory(import.meta.env.BASE_URL), routes })
