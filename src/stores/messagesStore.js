import { defineStore } from 'pinia'

const STORAGE_KEY = 'portfolioContactInbox'

export const useMessagesStore = defineStore('messages', {
  state: () => ({
    inbox: []
  }),
  actions: {
    loadInbox() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        this.inbox = raw ? JSON.parse(raw) : []
      } catch {
        this.inbox = []
      }
    },
    saveMessage({ email, subject, message, delivery }) {
      this.loadInbox()
      const entry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        email,
        subject,
        message,
        delivery,
        receivedAt: new Date().toISOString()
      }
      this.inbox.unshift(entry)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.inbox.slice(0, 100)))
      return entry
    }
  }
})
