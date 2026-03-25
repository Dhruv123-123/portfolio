<template>
  <div class="absolute bottom-0 w-full bg-gray-100 border-t border-gray-300 h-14 shadow-inner">
    <div class="flex items-center justify-between h-full px-2">
      <div class="w-1/3 overflow-hidden">
        <div class="flex items-center gap-2">
          <img
            v-if="currentTrack && currentTrack.album && currentTrack.album.images && currentTrack.album.images.length"
            :src="currentTrack.album.images[0].url"
            alt="album cover"
            class="w-10 h-10 rounded-sm flex-shrink-0"
          />
          <div class="flex flex-col overflow-hidden">
            <p class="text-xs font-trebuchet-pixel truncate">{{ currentTrack ? currentTrack.name : '' }}</p>
            <p class="text-xxs font-trebuchet-pixel truncate text-gray-500">
              {{ currentTrack && currentTrack.artists ? currentTrack.artists[0].name : '' }}
            </p>
          </div>
        </div>
      </div>
      <div class="w-1/3 flex items-center justify-center gap-2">
        <button @click="previousTrack" class="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-200 cursor-pointer text-sm font-bold">
          ⏮
        </button>
        <button
          @click="togglePlay"
          class="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-200 cursor-pointer text-base font-bold"
        >
          {{ isPlaying ? '⏸' : '▶' }}
        </button>
        <button @click="nextTrack" class="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-200 cursor-pointer text-sm font-bold">
          ⏭
        </button>
      </div>
      <div class="w-1/3">
        <p class="text-xxs font-trebuchet-pixel text-center text-gray-600">{{ formatTime(currentTime) }} / {{ formatTime(displayDuration) }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onUnmounted, watch } from 'vue'
import { useVolumeStore } from '@/stores/volumeStore'

const props = defineProps({
  playlist: {
    type: Array,
    required: true
  },
  trackToggled: String
})

const volumeStore = useVolumeStore()
const currentTrack = ref(props.playlist.length ? props.playlist[0] : null)
const isPlaying = ref(false)
const currentTime = ref(0)
const audioDuration = ref(0)
let audioElement = null
let timeUpdateHandler = null

const getAudioFile = (track) => '/musics/' + track.id + '.mp3'

const displayDuration = computed(() => {
  if (currentTrack.value && currentTrack.value.duration_ms > 0) {
    return currentTrack.value.duration_ms
  }
  return audioDuration.value
})

const attachTimeListener = () => {
  if (!audioElement) return
  timeUpdateHandler = () => {
    currentTime.value = audioElement.currentTime * 1000
    if (audioElement.duration && !isNaN(audioElement.duration)) {
      audioDuration.value = audioElement.duration * 1000
    }
  }
  audioElement.addEventListener('timeupdate', timeUpdateHandler)
  audioElement.addEventListener('ended', handleTrackEnded)
}

const detachTimeListener = () => {
  if (!audioElement) return
  if (timeUpdateHandler) audioElement.removeEventListener('timeupdate', timeUpdateHandler)
  audioElement.removeEventListener('ended', handleTrackEnded)
}

const handleTrackEnded = () => {
  nextTrack()
}

const togglePlay = () => {
  if (!currentTrack.value) return
  const file = getAudioFile(currentTrack.value)
  if (isPlaying.value) {
    volumeStore.pauseAudio(file)
    detachTimeListener()
    isPlaying.value = false
  } else {
    volumeStore.playAudio(file)
    audioElement = volumeStore.audioElements[file]
    attachTimeListener()
    isPlaying.value = true
  }
}

const switchTrack = (newTrack) => {
  if (currentTrack.value) {
    const oldFile = getAudioFile(currentTrack.value)
    volumeStore.pauseAudio(oldFile)
    volumeStore.resetAudio(oldFile)
    detachTimeListener()
  }
  currentTime.value = 0
  currentTrack.value = newTrack
  if (isPlaying.value && newTrack) {
    const newFile = getAudioFile(newTrack)
    volumeStore.playAudio(newFile)
    audioElement = volumeStore.audioElements[newFile]
    attachTimeListener()
  }
}

const previousTrack = () => {
  if (!currentTrack.value) return
  const idx = props.playlist.findIndex((t) => t.id === currentTrack.value.id)
  const prev = idx === 0 ? props.playlist[props.playlist.length - 1] : props.playlist[idx - 1]
  switchTrack(prev)
}

const nextTrack = () => {
  if (!currentTrack.value) return
  const idx = props.playlist.findIndex((t) => t.id === currentTrack.value.id)
  const next = idx === props.playlist.length - 1 ? props.playlist[0] : props.playlist[idx + 1]
  switchTrack(next)
}

function formatTime(ms) {
  if (ms == null || isNaN(ms)) return '0:00'
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`
}

watch(
  () => props.trackToggled,
  (newTrackId) => {
    if (!newTrackId || (currentTrack.value && newTrackId === currentTrack.value.id)) return
    const track = props.playlist.find((t) => t.id === newTrackId)
    if (track) {
      if (!isPlaying.value) isPlaying.value = true
      switchTrack(track)
    }
  }
)

onUnmounted(() => {
  detachTimeListener()
  if (currentTrack.value) {
    const file = getAudioFile(currentTrack.value)
    volumeStore.pauseAudio(file)
    volumeStore.resetAudio(file)
  }
})
</script>
