import { defineStore } from 'pinia'

const SESSION_KEY = 'portfolioSession'

export const useConnectionStore = defineStore('connection', {
  state: () => ({
    status: sessionStorage.getItem(SESSION_KEY) || 'restart'
  }),
  actions: {
    disconnect() {
      this.status = 'disconnected'
      sessionStorage.removeItem(SESSION_KEY)
    },
    restart() {
      this.status = 'restart'
      sessionStorage.removeItem(SESSION_KEY)
    },
    login() {
      this.status = 'loggedIn'
      sessionStorage.setItem(SESSION_KEY, 'loggedIn')
    }
  }
})
