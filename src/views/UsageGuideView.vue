<script setup lang="ts">
import { IonContent, IonPage } from '@ionic/vue'
import AppHeader from '@/components/AppHeader.vue'
import readme from '../../README.md?raw'

type ReadmeBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'code'; text: string }

function parseReadme(source: string): ReadmeBlock[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReadmeBlock[] = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index] ?? ''
    if (!line.trim()) {
      index += 1
      continue
    }
    if (line.startsWith('```')) {
      const code: string[] = []
      index += 1
      while (index < lines.length && !(lines[index] ?? '').startsWith('```')) {
        code.push(lines[index] ?? '')
        index += 1
      }
      blocks.push({ type: 'code', text: code.join('\n') })
      index += 1
      continue
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line)
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1]?.length ?? 2, text: heading[2] ?? '' })
      index += 1
      continue
    }
    if (line.startsWith('- ')) {
      const items: string[] = []
      while (index < lines.length && (lines[index] ?? '').startsWith('- ')) {
        items.push((lines[index] ?? '').slice(2))
        index += 1
      }
      blocks.push({ type: 'list', items })
      continue
    }
    const paragraph = [line.trim()]
    index += 1
    while (index < lines.length) {
      const next = lines[index] ?? ''
      if (!next.trim() || next.startsWith('#') || next.startsWith('- ') || next.startsWith('```')) break
      paragraph.push(next.trim())
      index += 1
    }
    blocks.push({ type: 'paragraph', text: paragraph.join(' ') })
  }
  return blocks
}

function inlineMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
}

const blocks = parseReadme(readme)
</script>

<template>
  <IonPage>
    <AppHeader title="使用说明" subtitle="功能、题库格式与本地数据说明" back />
    <IonContent :fullscreen="true">
      <main class="page-content no-nav">
        <article class="card readme-card">
          <template v-for="(block, index) in blocks" :key="index">
            <h1 v-if="block.type === 'heading' && block.level === 1" v-html="inlineMarkdown(block.text)"></h1>
            <h2 v-else-if="block.type === 'heading'" v-html="inlineMarkdown(block.text)"></h2>
            <p v-else-if="block.type === 'paragraph'" v-html="inlineMarkdown(block.text)"></p>
            <ul v-else-if="block.type === 'list'">
              <li v-for="(item, itemIndex) in block.items" :key="itemIndex" v-html="inlineMarkdown(item)"></li>
            </ul>
            <pre v-else-if="block.type === 'code'"><code>{{ block.text }}</code></pre>
          </template>
        </article>
      </main>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.readme-card { padding: 22px; }
.readme-card h1 { margin: 0 0 16px; font: 700 26px Georgia, "Songti SC", serif; }
.readme-card h2 { margin: 27px 0 11px; padding-top: 20px; border-top: 1px solid var(--line); font-size: 18px; }
.readme-card h1 + h2 { margin-top: 20px; }
.readme-card p, .readme-card li { color: var(--ink); font-size: 13px; line-height: 1.75; }
.readme-card p { margin: 10px 0; }
.readme-card ul { margin: 8px 0; padding-left: 21px; }
.readme-card li + li { margin-top: 6px; }
.readme-card pre { overflow-x: auto; margin: 12px 0; padding: 14px; border-radius: 12px; color: #eaf3ee; background: #24312b; font-size: 12px; line-height: 1.6; }
.readme-card :deep(code:not(pre code)) { padding: 2px 5px; border-radius: 5px; color: var(--primary); background: var(--primary-soft); font-family: Consolas, monospace; }
</style>
