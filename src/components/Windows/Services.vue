<template>
  <div class="relative right-0 h-content-window flex">
    <WindowLeftMenu :leftMenuType="props.leftMenuType" />
    
    <!-- Content of service detail -->
    <div v-if="goBackStore.currentActiveService" class="w-full h-full bg-white overflow-auto overflow-x-hidden pb-8 md:pb-5">
      <div class="m-4">
        <div class="w-full gap-4 mb-4">
          <div class="flex items-center gap-3 mb-2">
            <img :src="'/img/icons/' + goBackStore.currentActiveService.icon" alt="service icon" class="w-12 h-12" />
            <h2 class="text-xl md:text-2xl font-semibold">{{ getLocalizedServiceName(goBackStore.currentActiveService) }}</h2>
          </div>
          
          <div class="bg-blue-50 border-l-4 border-blue-500 p-4 mb-4">
            <p class="text-xs md:text-sm text-gray-700">
              {{ goBackStore.currentActiveService.description[localeStore.currentLocale] || goBackStore.currentActiveService.description['en'] }}
            </p>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div class="bg-gray-50 p-4 rounded">
              <h3 class="text-sm font-semibold text-gray-600 mb-2">{{ $t('windows.services.price') }}</h3>
              <p class="text-2xl font-bold text-blue-600">€{{ goBackStore.currentActiveService.price }}</p>
            </div>
            
            <div class="bg-gray-50 p-4 rounded">
              <h3 class="text-sm font-semibold text-gray-600 mb-2">{{ $t('windows.services.duration') }}</h3>
              <p class="text-lg font-semibold text-gray-800">
                {{ goBackStore.currentActiveService.duration[localeStore.currentLocale] || goBackStore.currentActiveService.duration['en'] }}
              </p>
            </div>
          </div>

          <div v-if="goBackStore.currentActiveService.features" class="mb-4">
            <h3 class="text-lg font-semibold mb-3">{{ $t('windows.services.features') }}</h3>
            <ul class="list-disc list-inside space-y-2">
              <li v-for="(feature, index) in (goBackStore.currentActiveService.features[localeStore.currentLocale] || goBackStore.currentActiveService.features['en'])" :key="index" class="text-xs md:text-sm text-gray-700">
                {{ feature }}
              </li>
            </ul>
          </div>

          <!-- Contact section -->
          <div class="mt-6 border-t-2 border-gray-200 pt-4">
            <div class="bg-gradient-to-r from-blue-50 to-blue-100 p-4 rounded-lg">
              <h3 class="text-base font-semibold mb-3 text-blue-900">
                {{ $t('windows.services.interested') }}
              </h3>
              <p class="text-xs md:text-sm text-gray-700 mb-3">
                {{ $t('windows.services.contactMessage') }}
              </p>
              <div class="flex flex-col sm:flex-row gap-3">
                <a :href="`mailto:${emailAddress}`" class="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                    <polyline points="22,6 12,13 2,6"></polyline>
                  </svg>
                  <span class="text-xs font-medium">{{ emailAddress }}</span>
                </a>
                <button @click="openContactWindow" class="flex items-center justify-center gap-2 bg-white hover:bg-gray-50 text-blue-600 border-2 border-blue-600 px-4 py-2 rounded transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                  </svg>
                  <span class="text-xs font-medium">{{ $t('windows.services.contactForm') }}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Content window for categories and services -->
    <div v-else class="flex flex-col w-full h-full bg-white overflow-auto pt-0.5">
      <div v-for="category in categories" :key="category.name" class="relative group mb-3">
        <h1 class="text-xs font-semibold px-3">{{ getLocalizedCategoryName(category) }}</h1>
        <div class="absolute left-[-12px] top-5 w-80 h-px bg-gradient-to-r from-blue-300 to-white"></div>

        <!-- Content for the services -->
        <div class="flex flex-wrap gap-2 pt-2 md:pt-3 pb-3 w-full">
          <div
            v-for="service in category.services"
            :key="service.name"
            @click="focusService(service)"
            @dblclick="toggleService(service)"
            class="flex items-center px-4 pb-2 gap-2.5 cursor-pointer service-card"
            :class="{ active: service.isFocus }"
          >
            <img :src="'/img/icons/' + service.icon" alt="service" class="w-10 h-10" :style="{ opacity: service.isFocus ? 0.5 : 1 }" />
            <p
              class="text-xs font-tahoma font-medium"
              :style="{
                backgroundColor: service.isFocus ? '#0B61FF' : 'transparent',
                color: service.isFocus ? 'white' : 'black'
              }"
            >
              {{ getLocalizedServiceName(service) }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, watch, onUnmounted, inject } from 'vue'
import { useLocaleStore } from '@/stores/localeStore'
import { useGoBackStore } from '@/stores/goBackStore'
import servicesData from '@/data/services-data.json'
import WindowLeftMenu from '@/components/Windows/WindowLeftMenu.vue'

const props = defineProps({
  leftMenuType: String
})

const emailAddress = import.meta.env.VITE_APP_ADMIN_EMAIL_ADDRESS || 'default@example.com';

// Locale management
const localeStore = useLocaleStore()
const goBackStore = useGoBackStore()

// Inject the openWindow and minimizeWindow functions from parent
const openWindow = inject('openWindow')
const minimizeWindow = inject('minimizeWindow')

onUnmounted(() => {
  goBackStore.currentActiveService = null
})

const categories = ref(
  servicesData.categories.map((category) => ({
    ...category,
    services: category.services.map((service) => ({ ...service, isFocus: false, isActive: false }))
  }))
)

const state = reactive({
  selectedService: null
})

const focusService = (service) => {
  if (service.isFocus) {
    return
  }

  service.isFocus = !service.isFocus

  categories.value.forEach((category) => {
    category.services.forEach((s) => {
      if (s.name !== service.name) {
        s.isFocus = false
      }
    })
  })
  state.selectedService = service
}

const toggleService = (service) => {
  // Before opening a service, close all others
  closeAllServices()

  // Then open the selected service
  service.isActive = true
  state.selectedService = service
  
  // Make sure the service is focused first
  focusService(service)
  
  goBackStore.currentActiveService = service
}

const closeAllServices = () => {
  categories.value.forEach((category) => {
    category.services.forEach((service) => {
      service.isActive = false
    })
  })
}

const getLocalizedCategoryName = (category) => {
  return category.name[localeStore.currentLocale] || category.name['en']
}

const getLocalizedServiceName = (service) => {
  return service.name[localeStore.currentLocale] || service.name['en']
}

const openContactWindow = () => {
  if (openWindow) {
    openWindow('contact')
  }
}


// Watch for changes in currentActiveService
watch(
  () => goBackStore.currentActiveService,
  (newService) => {
    if (!newService) {
      closeAllServices()
    }
  },
  { immediate: true }
)

// Unfocus the service when the user clicks outside the service card
globalThis.addEventListener('click', (e) => {
  if (!e.target.closest('.service-card') && state.selectedService) {
    state.selectedService.isFocus = false
    state.selectedService = null
  }
})
</script>
