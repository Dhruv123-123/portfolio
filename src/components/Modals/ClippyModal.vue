<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const isVisible = ref(false)
const isDismissed = ref(false)

const DELAY_MS = 20000 // 20 seconds delay
const STORAGE_KEY = 'clippyDismissed'

let timeoutId = null

onMounted(() => {
	// Check if user has already dismissed the modal
	const dismissed = localStorage.getItem(STORAGE_KEY)
	if (dismissed) {
		isDismissed.value = true
		return
	}

	// Show modal after delay
	timeoutId = setTimeout(() => {
		isVisible.value = true
	}, DELAY_MS)
})

onUnmounted(() => {
	if (timeoutId) {
		clearTimeout(timeoutId)
	}
})

const closeModal = () => {
	isVisible.value = false
}

const dismissForever = () => {
	localStorage.setItem(STORAGE_KEY, 'true')
	isDismissed.value = true
	isVisible.value = false
}

</script>

<template>
	<Transition name="clippy">
		<div v-if="isVisible && !isDismissed" class="fixed bottom-16 right-4 z-fmax flex items-end gap-2">
			<!-- Speech bubble -->
			<div class="relative max-w-56">
				<!-- Bubble content -->
				<div
					class="relative bg-gradient-to-b from-light-yellow to-amber-100 border border-black rounded p-3 shadow-md">
					<!-- Close button -->
					<button
						class="modal-close cursor-pointer"
						:title="t('clippy.close')" @click="closeModal">
					</button>

					<!-- Content -->
					<div class="pr-3">
						<p class="text-sm font-bold text-black mb-2">{{ t('clippy.greeting') }}</p>
						<p class="text-xs text-black mb-3">{{ t('clippy.message') }}</p>

						<!-- Buttons -->
						<div class="flex flex-col gap-2">
							<a	href="https://github.com/UnMugViolet/portfolio" 
								target="_blank"
								class="bg-button-submit hover:shadow-button-submit-hover active:bg-button-clicked border border-twilight-blue rounded px-3 py-1 text-xs text-black flex items-center justify-center gap-2 cursor-pointer shadow-sm">
								<span>⭐</span>
								<span>{{ t('clippy.starRepo') }}</span>
							</a>
							<a  href="https://buymeacoffee.com/unmugviolet"
								target="_blank"
								class="bg-button-submit hover:shadow-button-submit-hover active:bg-button-clicked border border-twilight-blue rounded px-3 py-1 text-xs text-black flex items-center justify-center gap-2 cursor-pointer shadow-sm">
								<span>☕</span>
								<span>{{ t('clippy.buyMeCoffee') }}</span>
							</a>
						</div>

						<!-- Don't show again -->
						<button class="text-xxs text-gray-500 hover:text-gray-700 mt-3 underline cursor-pointer"
							@click="dismissForever">
							{{ t('clippy.dontShowAgain') }}
						</button>
					</div>
				</div>

				<!-- Bubble tail pointing right -->
				<div
					class="absolute bottom-5 -right-2.5 w-0 h-0 border-l-[10px] border-l-black border-t-8 border-t-transparent border-b-8 border-b-transparent">
				</div>
				<div
					class="absolute bottom-5 -right-2 w-0 h-0 border-l-[9px] border-l-light-yellow border-t-[7px] border-t-transparent border-b-[7px] border-b-transparent">
				</div>
			</div>

			<!-- Clippy image -->
			<img src="/videos/clippy.gif" alt="Clippy" class="w-20 md:w-24 h-auto cursor-pointer" :title="t('clippy.clippyAlt')"
				@click="closeModal" />
		</div>
	</Transition>
</template>

<style scoped>
.clippy-enter-active {
	animation: clippy-bounce-in 0.5s ease-out;
}

.clippy-leave-active {
	animation: clippy-fade-out 0.3s ease-in;
}

.modal-close {
  outline: none;
  position: absolute;
  right: 6px;
  top: 6px;
  width: 14px;
  height: 14px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 3px;
  background-color: transparent;
}

.modal-close::before {
  content: '';
  position: absolute;
  left: 5px;
  top: 2px;
  transform: rotate(45deg);
  height: 8px;
  width: 2px;
  background-color: rgba(170, 170, 170);
}

.modal-close:hover {
  background-color: #ffa90c;
  border-color: white;
  box-shadow: 1px 1px rgba(0, 0, 0, 0.1);
}

.modal-close:hover::before,
.modal-close:hover::after {
  background-color: white;
}

.modal-close::after {
  content: '';
  position: absolute;
  left: 5px;
  top: 2px;
  transform: rotate(-45deg);
  height: 8px;
  width: 2px;
  background-color: rgba(170, 170, 170);
}

@keyframes clippy-bounce-in {
	0% {
		opacity: 0;
		transform: translateY(20px) scale(0.8);
	}

	50% {
		transform: translateY(-5px) scale(1.02);
	}

	100% {
		opacity: 1;
		transform: translateY(0) scale(1);
	}
}

@keyframes clippy-fade-out {
	from {
		opacity: 1;
		transform: translateY(0);
	}

	to {
		opacity: 0;
		transform: translateY(10px);
	}
}
</style>
