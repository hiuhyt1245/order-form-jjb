<script setup>
import { computed } from 'vue'
import zhTw from 'element-plus/dist/locale/zh-tw.mjs'
import OrderForm from '@/components/OrderForm.vue'

const locale = computed(() => zhTw)
</script>

<template>
  <el-config-provider :locale="locale">
    <OrderForm />
  </el-config-provider>
</template>
