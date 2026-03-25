<template>
  <ContentCenter class="bg-color-load-blue radial-gradient-loading">
    <template #top>
      <div class="absolute bg-color-load-header-blue w-full md:h-32 h-1/6 top-0 down-stroke-white-2" />
    </template>

    <template #center>
      <div class="flex w-full">
        <div class="md:flex hidden justify-end items-center w-1/2">
          <div>
            <div class="flex justify-end w-full">
              <div class="w-2/3">
                <img src="/img/logo-portfolio-white.svg" :alt="$t('alt.logoLogin')" class="mb-3" />
              </div>
            </div>
            <div class="w-full flex justify-end">
              <div class="w-10/12 mr-12">
                <h2 class="text-white text-lg text-right">
                  {{ $t('message.toBegin') }}
                </h2>
              </div>
            </div>
          </div>
        </div>

        <div class="w-px h-96 line-loading-gradient mx-3 md:flex hidden"></div>
        <LoginForm />
      </div>
    </template>

    <template #bottom>
      <div class="absolute bg-color-load-header-blue w-full md:h-48 h-1/5 bottom-0 up-stroke-green-2">
        <div class="flex justify-center items-center h-full">
          <div class="app-container">
            <div class="flex justify-center items-center">
              <div class="flex text-white md:text-sm text-xs font-bold md:w-2/3">
                <h4>
                  {{ $t('message.explainer') }}
                </h4>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </ContentCenter>
</template>

<script setup>
import LoginForm from '@/components/Loading/LoginForm.vue'
import ContentCenter from '@/layouts/ContentCenter.vue'
</script>
