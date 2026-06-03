<template>
  <div class="relative right-0 h-full flex">
    <div id="dosbox" class="w-full h-full bg-black pt-6 overflow-hidden"></div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue'

let dosbox = null
const trackedAudioContexts = []
let nativeAudioContext = null
let nativeWebkitAudioContext = null

function patchAudioContext() {
  const Original = window.AudioContext || window.webkitAudioContext
  if (!Original) return

  nativeAudioContext = window.AudioContext
  nativeWebkitAudioContext = window.webkitAudioContext

  const PatchedAudioContext = function (...args) {
    const ctx = new Original(...args)
    trackedAudioContexts.push(ctx)
    return ctx
  }
  PatchedAudioContext.prototype = Original.prototype

  window.AudioContext = PatchedAudioContext
  if (window.webkitAudioContext) {
    window.webkitAudioContext = PatchedAudioContext
  }
}

function restoreAudioContext() {
  if (nativeAudioContext) window.AudioContext = nativeAudioContext
  if (nativeWebkitAudioContext) window.webkitAudioContext = nativeWebkitAudioContext
}

function stopEmulatorAudio() {
  trackedAudioContexts.forEach((ctx) => {
    if (ctx.state !== 'closed') {
      ctx.suspend().catch(() => {})
      ctx.close().catch(() => {})
    }
  })
  trackedAudioContexts.length = 0

  document.querySelectorAll('audio').forEach((audio) => {
    audio.pause()
    audio.currentTime = 0
    try {
      audio.src = ''
      audio.load()
    } catch {
      /* ignore */
    }
  })

  const container = document.getElementById('dosbox')
  if (container) {
    container.querySelectorAll('iframe, canvas').forEach((node) => node.remove())
    container.innerHTML = ''
  }
}

onMounted(() => {
  patchAudioContext()

  if (window.Dosbox) {
    dosbox = new Dosbox({
      id: 'dosbox',
      onload: function (box) {
        box.run('/game/DOOM-@evilution.zip', './DOOM/DOOM.EXE')
      },
      onrun: function () {}
    })
  } else {
    console.error('Dosbox is not defined')
  }
})

onUnmounted(() => {
  stopEmulatorAudio()
  restoreAudioContext()
  dosbox = null
})
</script>
