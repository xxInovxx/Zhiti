<script setup lang="ts">
import AppIcon from './AppIcon.vue'

const items = [
  { path: '/', icon: 'study', label: '学习' },
  { path: '/sources', icon: 'library', label: '题库' },
  { path: '/library', icon: 'statistics', label: '统计' },
  { path: '/history', icon: 'history', label: '历史' },
  { path: '/settings', icon: 'settings', label: '设置' },
] as const
</script>

<template>
  <nav class="bottom-nav">
    <RouterLink v-for="item in items" :key="item.path" :to="item.path" :class="{ active: $route.path === item.path }">
      <span class="bottom-nav-icon" aria-hidden="true">
        <AppIcon :name="item.icon" />
      </span>
      {{ item.label }}
    </RouterLink>
  </nav>
</template>
