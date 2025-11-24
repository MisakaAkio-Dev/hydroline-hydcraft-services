<script lang="ts" setup>
import WeChatLogo from '@/assets/resources/wechat_logo.svg?base64'

const props = defineProps({
  href: {
    type: String,
    default: 'https://bilibili.com/',
  },
})
</script>

<template>
  <div class="shadow-sm bg-[#2aae67] rounded-xl w-26">
    <a
      class="flex justify-center items-center p-1.5 hover:opacity-75 transition duration-200"
      target="_blank"
      :href="props.href"
      noreferrer
      noopener
    >
      <img class="block h-6" :src="WeChatLogo" alt="WeChat Logo" />
    </a>
  </div>
</template>
