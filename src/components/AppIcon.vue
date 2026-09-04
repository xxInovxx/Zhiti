<script setup lang="ts">
defineProps<{ name: 'study' | 'library' | 'statistics' | 'history' | 'settings' | 'wrong' | 'note' | 'sun' | 'moon' | 'system' }>()
</script>

<template>
  <svg class="app-icon" viewBox="0 0 24 24" aria-hidden="true">
    <template v-if="name === 'study'">
      <path d="M3 3h5a4 4 0 0 1 4 4v14a4 4 0 0 0-4-4H3z" />
      <path d="M21 3h-5a4 4 0 0 0-4 4v14a4 4 0 0 1 4-4h5z" />
    </template>
    <template v-else-if="name === 'library'">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M8 7h8M8 11h8M8 15h5" />
    </template>
    <template v-else-if="name === 'statistics'">
      <path d="M4 21V10M10 21V3M16 21v-8M21 21H3" />
    </template>
    <template v-else-if="name === 'history'">
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5M12 7v5l3 2" />
    </template>
    <template v-else-if="name === 'wrong'">
      <path d="M6 3h9l4 4v14H6zM15 3v5h4" />
      <path d="m9 14 2 2 4-4" />
    </template>
    <template v-else-if="name === 'note'">
      <path d="M5 3h10l4 4v14H5zM15 3v5h4" />
      <path d="M8 12h8M8 16h6" />
    </template>
    <template v-else-if="name === 'settings'">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.6v-.09A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3V9.6h.09A1.7 1.7 0 0 0 4.6 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.09A1.7 1.7 0 0 0 15.5 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.4.23.75.57 1 .98.23.4.35.86.35 1.32v1.4c0 .46-.12.92-.35 1.3-.25.43-.6.77-1 1z" />
    </template>
    <template v-else-if="name === 'sun'">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" />
    </template>
    <template v-else-if="name === 'moon'">
      <path d="M20.4 14.6A8.5 8.5 0 0 1 9.4 3.6a8.5 8.5 0 1 0 11 11z" />
    </template>
    <template v-else>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
      <path d="M8.5 10.5a3.5 3.5 0 0 0 5 3.2 4 4 0 0 1 0-6.4 3.5 3.5 0 0 0-5 3.2z" />
    </template>
  </svg>
</template>
