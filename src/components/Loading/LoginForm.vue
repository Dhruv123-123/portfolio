<script setup>
import { useConnectionStore } from '@/stores/connectionStore'

const connectionStore = useConnectionStore()

const handleLogin = () => {
  connectionStore.login()
}
</script>

<template>
  <div class="flex items-center">
    <div @click="handleLogin" class="absolute h-28 md:w-7/12 w-screen">
      <router-link to="/office" class="h-full w-full rounded-xl bg-color-login-blue flex items-center py-2.5 px-6 stroke-white-1 cursor-pointer">
        <div class="w-full flex items-center text-white gap-4 relative outline-none justify-center">
          <div>
            <h2 class="text-xl md:text-2xl">Dhruv</h2>
          </div>
        </div>
      </router-link>
    </div>
  </div>
</template>
