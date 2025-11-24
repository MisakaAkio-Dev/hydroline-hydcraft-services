<script lang="ts" setup>
const props = defineProps({
  href: {
    type: String,
    default: 'https://jq.qq.com/',
  },
})
</script>

<template>
  <div class="shadow-sm bg-[#87ea01] rounded-xl w-26">
    <a
      class="flex justify-center items-center p-1.5 hover:opacity-75 transition duration-200"
      target="_blank"
      :href="props.href"
      noreferrer
      noopener
    >
      <img
        class="block h-6"
        src="@/assets/resources/kook_logo.png"
        alt="Kook Logo"
      />
    </a>
  </div>
</template>
