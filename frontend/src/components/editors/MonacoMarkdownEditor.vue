<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import 'monaco-editor/min/vs/editor/editor.main.css'

const props = defineProps<{
  modelValue: string
  language?: string
  readOnly?: boolean
  height?: number
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
}>()

const containerRef = ref<HTMLDivElement | null>(null)
let editor: import('monaco-editor').editor.IStandaloneCodeEditor | null = null
let monaco: typeof import('monaco-editor') | null = null

async function initEditor() {
  if (typeof window === 'undefined') return
  if (!containerRef.value) return
  if (!monaco) {
    monaco = await import('monaco-editor')
  }
  if (!monaco) return

  editor = monaco.editor.create(containerRef.value, {
    value: props.modelValue ?? '',
    language: props.language ?? 'markdown',
    automaticLayout: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    readOnly: Boolean(props.readOnly),
    fontSize: 14,
    wordWrap: 'on',
    padding: { top: 8, bottom: 8 },
  })

  editor.onDidChangeModelContent(() => {
    if (editor) {
      emit('update:modelValue', editor.getValue())
    }
  })
}

watch(
  () => props.modelValue,
  (value) => {
    if (editor && value !== editor.getValue()) {
      editor.setValue(value ?? '')
    }
  },
)

watch(
  () => props.readOnly,
  (value) => {
    if (editor) {
      editor.updateOptions({ readOnly: Boolean(value) })
    }
  },
)

onMounted(() => {
  void initEditor()
})

onBeforeUnmount(() => {
  editor?.dispose()
  editor = null
})
</script>

<template>
  <div
    ref="containerRef"
    class="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden"
    :style="{ minHeight: props.height ? `${props.height}px` : '256px' }"
  />
</template>
