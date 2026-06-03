<script setup>
import { computed } from 'vue'
import { useLocaleStore } from '@/stores/localeStore'
import ProfileHeader from './ProfileHeader.vue'
import EducationItem from './EducationItem.vue'
import cvData from '@/data/cv-data.json'
import WorkExperienceItem from './WorkExperienceItem.vue'

const localeStore = useLocaleStore()
const currentLocale = computed(() => localeStore.currentLocale)

const educationData = computed(() => {
  return cvData[currentLocale.value]?.education || []
})

const experienceData = computed(() => {
  return cvData[currentLocale.value]?.workExperience || []
})

const leadershipData = computed(() => {
  return cvData[currentLocale.value]?.leadership || []
})

const projectsData = computed(() => {
  return cvData[currentLocale.value]?.projects || []
})

const skills = computed(() => cvData[currentLocale.value]?.skills || '')
const interests = computed(() => cvData[currentLocale.value]?.interests || '')
</script>

<template>
  <div class="relative right-0 h-content-window overflow-hidden">
    <div class="w-full h-full bg-white overflow-auto p-2">
      <div>
        <ProfileHeader />
        <section class="mt-5">
          <h2 class="font-trebuchet-pixel underline">{{ $t('windows.cv.education') }}</h2>
          <EducationItem v-for="education in educationData" :key="education.id" :education="education" />
        </section>
        <div class="mt-3">
          <h2 class="font-trebuchet-pixel mt-5 underline">{{ $t('windows.cv.proExperience') }}</h2>
          <WorkExperienceItem v-for="(workExperience, index) in experienceData" :key="'work-' + index" :workExperience="workExperience" />
        </div>
        <div v-if="leadershipData.length" class="mt-3">
          <h2 class="font-trebuchet-pixel mt-5 underline">{{ $t('windows.cv.leadership') }}</h2>
          <WorkExperienceItem v-for="(item, index) in leadershipData" :key="'lead-' + index" :workExperience="item" />
        </div>
        <div v-if="projectsData.length" class="mt-3">
          <h2 class="font-trebuchet-pixel mt-5 underline">{{ $t('windows.cv.projects') }}</h2>
          <WorkExperienceItem v-for="(item, index) in projectsData" :key="'proj-' + index" :workExperience="item" />
        </div>
        <div v-if="skills" class="mt-3">
          <h2 class="font-trebuchet-pixel mt-5 underline">{{ $t('windows.cv.skills') }}</h2>
          <p class="font-trebuchet-pixel text-xs mt-2">{{ skills }}</p>
          <p v-if="interests" class="font-trebuchet-pixel text-xs mt-2"><span class="font-medium">{{ $t('windows.cv.interests') }}:</span> {{ interests }}</p>
        </div>
      </div>
    </div>
  </div>
  <a
    rel="noopener"
    :href="'pdf/CV_dhruv_ramasubban_' + localeStore.currentLocale + '.pdf'"
    :download="'CV_dhruv_ramasubban_' + localeStore.currentLocale + '.pdf'"
    class="absolute bottom-2 right-1 md:right-4 h-6 text-xxs border border-twilight-blue bg-button-submit rounded-sm leading-loose px-3 hover:shadow-button-submit-hover cursor-pointer active:bg-button-clicked"
  >
    {{ $t('buttons.downloadCV') }}
  </a>
</template>
