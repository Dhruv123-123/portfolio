import { defineStore } from 'pinia'
import { useI18n } from 'vue-i18n'

export const useLocaleStore = defineStore('locale', {
  state: () => ({
    currentLocale: 'en'
  }),
  actions: {
    setLocale(newLocale) {
      const locale = newLocale === 'en' ? 'en' : 'en'
      this.currentLocale = locale
      localStorage.setItem('currentLocale', locale)
      const { locale: i18nLocale } = useI18n()
      i18nLocale.value = locale
    }
  }
})
