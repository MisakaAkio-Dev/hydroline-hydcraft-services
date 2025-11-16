<template>
  <div class="justify-end flex-2/5 relative">
    <div class="absolute left-0 right-0 top-0 bottom-0 select-none">
      <slot name="background"></slot>
    </div>

    <div
      class="blur-mask absolute left-0 right-0 top-0 bottom-0 bg-white/80 dark:bg-slate-900/70"
    ></div>

    <div class="relative z-200 w-full h-full">
      <slot name="foreground"></slot>
    </div>
  </div>
</template>

<style>
.blur-mask {
  backdrop-filter: blur(48px) saturate(150%);
  mask: linear-gradient(to top, #fff 60%, transparent 150%);
  pointer-events: none;
}
</style>
