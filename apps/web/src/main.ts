import 'element-plus/es/components/button/style/css'
import 'element-plus/es/components/input/style/css'
import 'element-plus/es/components/progress/style/css'
import 'element-plus/es/components/skeleton/style/css'
import 'element-plus/es/components/tag/style/css'
import './styles.css'

import { ElButton, ElInput, ElProgress, ElSkeleton, ElTag } from 'element-plus'
import { createApp } from 'vue'

import App from './App.vue'

const app = createApp(App)

app.component('ElButton', ElButton)
app.component('ElInput', ElInput)
app.component('ElProgress', ElProgress)
app.component('ElSkeleton', ElSkeleton)
app.component('ElTag', ElTag)
app.mount('#app')
