<script lang="ts" setup>
const props = defineProps({
  href: {
    type: String,
    default: 'https://jq.qq.com/',
  },
})
</script>

<template>
  <div class="shadow-sm bg-[#12b7f5] rounded-xl w-26">
    <a
      class="flex justify-center items-center p-1.5 hover:opacity-75 transition duration-200"
      target="_blank"
      :href="props.href"
      noreferrer
      noopener
    >
      <img
        class="block h-6"
        src="@/assets/resources/qq_logo.png"
        alt="QQ Logo"
      />
    </a>
  </div>
</template>
