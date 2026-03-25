<template>
  <div class="relative right-0 h-content-window flex overflow-y-auto bg-white pb-14">
    <div v-if="loading" class="w-full h-full flex items-center text-center justify-center text-sm">{{ $t('common.loading') }}</div>
    <div v-else class="w-full font-trebuchet-pixel">
      <div class="w-full h-full overflow-x-hidden">
        <div>
          <div class="flex items-center gap-5 p-1.5">
            <img v-if="playlist.images" src="/img/icons/music/logo_spotify.svg" :alt="$t('windows.music.playlistCoverAlt')" class="w-24" />
            <div>
              <h2 class="text-xl font-bold">{{ playlist.name }}</h2>
              <p class="text-xs mb-1">{{ $t('windows.music.description') }}</p>
              <Button :href="playlist.external_urls.spotify" :blank="true">
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="18" viewBox="0 0 24 24">
                  <path
                    fill="#000000"
                    d="M17.9 10.9C14.7 9 9.35 8.8 6.3 9.75c-.5.15-1-.15-1.15-.6c-.15-.5.15-1 .6-1.15c3.55-1.05 9.4-.85 13.1 1.35c.45.25.6.85.35 1.3c-.25.35-.85.5-1.3.25m-.1 2.8c-.25.35-.7.5-1.05.25c-2.7-1.65-6.8-2.15-9.95-1.15c-.4.1-.85-.1-.95-.5s.1-.85.5-.95c3.65-1.1 8.15-.55 11.25 1.35c.3.15.45.65.2 1m-1.2 2.75c-.2.3-.55.4-.85.2c-2.35-1.45-5.3-1.75-8.8-.95c-.35.1-.65-.15-.75-.45c-.1-.35.15-.65.45-.75c3.8-.85 7.1-.5 9.7 1.1c.35.15.4.55.25.85M12 2A10 10 0 0 0 2 12a10 10 0 0 0 10 10a10 10 0 0 0 10-10A10 10 0 0 0 12 2"
                  />
                </svg>
                <span class="ml-1.5">{{ $t('windows.music.visitOnSpotify') }}</span>
              </Button>
            </div>
          </div>
          <div>
            <div class="grid grid-cols-12 items-center pl-1.5">
              <div class="col-span-7 sm:col-span-5 flex items-center gap-1">
                <div class="pl-2 w-8">
                  <p class="text-xs">#</p>
                </div>
                <div class="flex flex-col max-w-48">
                  <p class="text-xs font-trebuchet-pixel">{{ $t('windows.music.title') }}</p>
                </div>
              </div>
              <div class="col-span-3 overflow-hidden px-1 hidden md:block">
                <p class="text-xs font-trebuchet-pixel">{{ $t('windows.music.album') }}</p>
              </div>
              <div class="col-span-1 px-1">
                <p class="text-xs font-trebuchet-pixel truncate">{{ $t('windows.music.addedThe') }}</p>
              </div>
              <div class="col-span-1 px-1">
                <p class="text-xs font-trebuchet-pixel">{{ $t('windows.music.duration') }}</p>
              </div>
              <div class="col-span-2 px-1">
                <p class="text-xs font-trebuchet-pixel">{{ $t('windows.music.link') }}</p>
              </div>
            </div>
            <div class="w-full h-px bg-gray-300 mb-2 mt-1"></div>
          </div>
          <div class="pb-3">
            <div v-for="(track, index) in playlist.tracks.items" :key="track.id">
              <div class="grid grid-cols-12 items-center pl-1.5">
                <div class="col-span-7 sm:col-span-5 flex items-center gap-1">
                  <div class="pl-2 w-8">
                    <p class="text-xs font-trebuchet-pixel">{{ index + 1 }}</p>
                  </div>
                  <div @click="playTrack(track.id)" class="flex items-center gap-2 cursor-pointer hover:underline">
                    <img :src="track.album.images[0].url" :alt="$t('windows.music.albumCover') + ' ' + track.name" class="w-12 rounded-sm" />
                    <div class="flex flex-col max-w-48">
                      <p class="text-sm font-trebuchet-pixel">{{ track.name }}</p>
                      <p class="text-xs font-trebuchet-pixel">{{ track.artists[0].name }}</p>
                    </div>
                  </div>
                </div>
                <div class="col-span-3 overflow-hidden px-1 hidden sm:block">
                  <p class="text-xs text-left font-trebuchet-pixel truncate">
                    {{ track.album.name }}
                  </p>
                </div>
                <div class="col-span-1 px-1">
                  <p class="text-xs font-trebuchet-pixel truncate">
                    {{
                      isMoreThanOneMonth(track.added_at)
                        ? formatDate(new Date(track.added_at))
                        : formatDistanceToNow(new Date(track.added_at), {
                            locale: localeMap[localeStore.currentLocale]
                          })
                    }}
                  </p>
                </div>
                <div class="col-span-1 px-1">
                  <p class="text-xs font-trebuchet-pixel">{{ formatDuration(track.duration_ms) }} min</p>
                </div>
                <div class="col-span-2 px-1 flex gap-1">
                  <Button v-if="track.album.external_urls.spotify" :href="track.album.external_urls.spotify" :blank="true" layout="small">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24">
                      <path
                        fill="#000000"
                        d="M17.9 10.9C14.7 9 9.35 8.8 6.3 9.75c-.5.15-1-.15-1.15-.6c-.15-.5.15-1 .6-1.15c3.55-1.05 9.4-.85 13.1 1.35c.45.25.6.85.35 1.3c-.25.35-.85.5-1.3.25m-.1 2.8c-.25.35-.7.5-1.05.25c-2.7-1.65-6.8-2.15-9.95-1.15c-.4.1-.85-.1-.95-.5s.1-.85.5-.95c3.65-1.1 8.15-.55 11.25 1.35c.3.15.45.65.2 1m-1.2 2.75c-.2.3-.55.4-.85.2c-2.35-1.45-5.3-1.75-8.8-.95c-.35.1-.65-.15-.75-.45c-.1-.35.15-.65.45-.75c3.8-.85 7.1-.5 9.7 1.1c.35.15.4.55.25.85M12 2A10 10 0 0 0 2 12a10 10 0 0 0 10 10a10 10 0 0 0 10-10A10 10 0 0 0 12 2"
                      />
                    </svg>
                  </Button>
                </div>
              </div>
              <div v-if="index < playlist.tracks.items.length - 1" class="w-11/12 h-px bg-gradient-to-r from-blue-300 to-white my-2"></div>
            </div>
          </div>
          <div v-if="loading" />
          <Player v-else :playlist="playlist.tracks.items" :trackToggled="selectedTrack" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { formatDistanceToNow, format } from 'date-fns'
import { enUS } from 'date-fns/locale'
import { useLocaleStore } from '@/stores/localeStore'
import Button from '@/components/Buttons/Button.vue'
import Player from '@/components/Windows/Music/Player.vue'
import playlistData from '@/data/playlist-data.json'

const localeStore = useLocaleStore()

const selectedTrack = ref('')
const loading = ref(true)
const playlist = ref({})

onMounted(async () => {
  await InitPlaylist()
  loading.value = false
})

// Map the localeStore.currentLocale to the correct locale object for date-fns
const localeMap = {
  en: enUS
}

async function InitPlaylist() {
  await new Promise((resolve) => setTimeout(resolve, 1000))
  playlist.value = playlistData
}

const isMoreThanOneMonth = (dateString) => {
  const date = new Date(dateString)
  const now = new Date()
  const oneMonthAgo = new Date(now.setMonth(now.getMonth() - 1))
  return date < oneMonthAgo
}

const formatDuration = (durationMs) => {
  if (!durationMs || durationMs <= 0) return '--:--'
  const minutes = Math.floor(durationMs / 60000)
  const seconds = ((durationMs % 60000) / 1000).toFixed(0)
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`
}

function playTrack(id) {
  selectedTrack.value = id
}

function formatDate(date) {
  return format(date, 'MMM dd, yyyy', { locale: localeMap[localeStore.currentLocale] })
}
</script>
