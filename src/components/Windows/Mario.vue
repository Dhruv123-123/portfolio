<template>
  <div class="relative right-0 h-full flex">
    <div id="mario-dosbox" class="w-full h-full bg-black pt-6 overflow-hidden"></div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
let dosbox = null
let isRunning = ref(false)

onMounted(() => {
  if (window.Dosbox) {
    dosbox = new Dosbox({
      id: 'mario-dosbox',
      onload: function (dosbox) {
        dosbox.run('/game/mario.zip', './MARIO.EXE')
        isRunning.value = true
      },
      onrun: function (dosbox, app) {
        console.log("App '" + app + "' is running")
      }
    })
  } else {
    console.error('Dosbox is not defined')
  }
})

onUnmounted(() => {
  if (isRunning.value) {
    window.location.reload()
  }
})
</script>
