import { defineStore } from 'pinia'

/** Shared state across the three Blackbox tools. */
export const useBlackboxStore = defineStore('blackbox', {
  state: () => ({
    tab: 'graph', // graph | replay | timeline | about
    selectedId: null, // accident id focused in graph/timeline
    compareId: null,
    query: '',
    replayId: null,
    replayTime: null, // seek request in seconds from t0
    highlightFactor: null,
    storyId: null, // record shown in story mode overlay (null = closed)
    sound: false,
    crt: false,
    atlasPlayRequest: 0, // timestamp: the atlas should start playing the century
    atlasRequiemRequest: 0,
    replayAutoplay: 0, // timestamp: the replay should start playing in cinematic mode
    layersRequest: 0 // timestamp: the replay should open its Layers popover (FlightGear, sound)
  }),
  actions: {
    openTimeline(id) {
      this.selectedId = id
      this.tab = 'timeline'
    },
    openFlightGear(id) {
      this.replayId = id
      this.replayTime = null
      this.tab = 'replay'
      this.layersRequest = Date.now()
    },
    openReplay(id, t = null) {
      this.replayId = id
      this.replayTime = t
      this.tab = 'replay'
    },
    openAtlas(id = null) {
      if (id) this.selectedId = id
      this.tab = 'atlas'
    },
    openStory(id) {
      this.selectedId = id
      this.storyId = id
    },
    openGraph(id = null, query = null) {
      if (id) this.selectedId = id
      if (query !== null) this.query = query
      this.tab = 'graph'
    }
  }
})
