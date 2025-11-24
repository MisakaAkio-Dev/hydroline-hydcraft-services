<script lang="ts" setup>
import BilibiliLogo from '@/assets/resources/bilibili_logo.svg?base64'

const props = defineProps({
  href: {
    type: String,
    default: 'https://bilibili.com/',
  },
})
</script>

<template>
  <div
    class="shadow-sm bg-[linear-gradient(135deg,#fe3a78,#ff6296)] rounded-xl w-26"
  >
    <a
      class="flex justify-center items-center p-1.5 hover:opacity-75 transition duration-200"
      target="_blank"
      :href="props.href"
      noreferrer
      noopener
    >
      <img class="block h-6" :src="BilibiliLogo" alt="bilibili Logo" />
    </a>
  </div>
</template>
