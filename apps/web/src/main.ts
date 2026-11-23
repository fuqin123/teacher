import { createApp } from 'vue'
import { VueQueryPlugin } from '@tanstack/vue-query'
import App from './App.vue'
import { router } from './router'
import { pinia } from './pinia'
import { queryClient } from './queryClient'
import './styles/main.css'

const app = createApp(App)
app.use(pinia)
app.use(router)
app.use(VueQueryPlugin, { queryClient })
app.mount('#app')