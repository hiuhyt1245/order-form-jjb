<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { TAIWAN_ADDRESS_DATA } from '@/data/taiwanAddress.js'
import { useLiff } from '@/composables/useLiff.js'

// ─────────────────────────────────────────────
// 【設定區】填入你的 LIFF ID 與 GAS Web App 網址
// 本地預覽時可保持 LIFF_ID 為空字串（不啟用 LINE 驗證）
// ─────────────────────────────────────────────
const LIFF_ID = import.meta.env.VITE_LIFF_ID || ''
const GAS_API_URL = import.meta.env.VITE_GAS_API_URL || ''

// ── LIFF 初始化 ──────────────────────────────
const { loading, isFriend, userId, displayName, isAuthError, authErrorDesc, initLiff } = useLiff(LIFF_ID)

onMounted(() => initLiff())

// ── 表單 Ref ──────────────────────────────────
const formRef = ref(null)
const confirmDialogVisible = ref(false)
const submitting = ref(false)

// ── 訂單成功狀態 ───────────────────────────────
const isSuccess = ref(false)
const successOrderNo = ref('')

// ── 表單資料 ──────────────────────────────────
const form = ref({
  // userId 與 displayName 由 LIFF 初始化後注入
  userId: '',
  displayName: '',
  items: '',
  deliveryMethod: '自取',
  // 自取
  pickupName: '',
  pickupDate: '',
  pickupPhone: '',
  pickupNote: '',
  // 宅配
  ordererName: '',
  receiverName: '',
  receiverPhone: '',
  addressCity: '',
  addressDistrict: '',
  addressDetail: '',
  shippingDate: '',
  temperature: '常溫',
  deliveryNote: '',
})

// userId 與 displayName 改變時同步回 form（由 useLiff 管理）
watch(userId, (val) => { form.value.userId = val })
watch(displayName, (val) => { form.value.displayName = val })

// ── 地址下拉選項 ──────────────────────────────
const cityOptions = computed(() => TAIWAN_ADDRESS_DATA)

const districtOptions = computed(() => {
  const city = TAIWAN_ADDRESS_DATA.find((c) => c.name === form.value.addressCity)
  return city ? city.districts : []
})

const fullAddress = computed(() =>
  `${form.value.addressCity || ''}${form.value.addressDistrict || ''}${form.value.addressDetail || ''}`,
)

function handleCityChange() {
  form.value.addressDistrict = ''
}

function handleDeliveryChange() {
  formRef.value?.clearValidate()
}

// ── 電話驗證器 ────────────────────────────────
const phoneValidator = (_rule, value, callback) => {
  if (!value) return callback(new Error('請輸入聯絡電話'))
  if (/[-－\s]/.test(value)) return callback(new Error('格式錯誤：請勿加橫槓 (-)，分機請用 #'))
  const phoneRegex = /^(09\d{8}|0[2-8]\d{7,8})(#\d+)?$/
  if (!phoneRegex.test(value)) {
    callback(new Error('電話格式錯誤！請輸入正確的手機或市話（區碼+號碼）'))
  } else {
    callback()
  }
}

// ── 表單驗證規則 ──────────────────────────────
const rules = ref({
  items: [{ required: true, message: '請填寫訂購品項與數量', trigger: 'blur' }],
  deliveryMethod: [{ required: true, message: '請選擇取貨方式', trigger: 'change' }],
  // 自取
  pickupName: [{ required: true, message: '請填寫取貨人完整姓名', trigger: 'blur' }],
  pickupDate: [{ required: true, message: '請選擇自取日期', trigger: 'change' }],
  pickupPhone: [{ required: true, validator: phoneValidator, trigger: 'blur' }],
  // 宅配
  receiverName: [{ required: true, message: '請填寫收件人完整姓名', trigger: 'blur' }],
  receiverPhone: [{ required: true, validator: phoneValidator, trigger: 'blur' }],
  addressCity: [{ required: true, message: '請選擇縣市', trigger: 'change' }],
  addressDistrict: [{ required: true, message: '請選擇鄉鎮市區', trigger: 'change' }],
  addressDetail: [{ required: true, message: '請填寫詳細地址', trigger: 'blur' }],
})

// ── 送出流程 ──────────────────────────────────

/** Step 1：點擊「確認送出訂單」→ 驗證表單 → 開啟確認彈框 */
function submitForm() {
  if (!formRef.value) return
  formRef.value.validate((valid) => {
    if (valid) {
      confirmDialogVisible.value = true
    } else {
      ElMessage.warning('請檢查表單資料是否填寫完整')
    }
  })
}

/** Step 2：彈框內「確認送出」→ 呼叫 GAS Web App API */
async function handleFinalSubmit() {
  submitting.value = true
  try {
    if (!GAS_API_URL) {
      // 本地預覽模擬（未設定 API 網址）
      await new Promise((r) => setTimeout(r, 600))
      confirmDialogVisible.value = false
      // ElMessageBox.alert(
      //   '【本地測試模式】表單驗證成功！\n注意：尚未設定 GAS_API_URL，故未實際呼叫後端。',
      //   '測試提示',
      //   { confirmButtonText: '確定' },
      // )
      console.log('【本地測試模式】表單驗證成功！')
      isSuccess.value = true
      return
    }

    // 呼叫 GAS Web App（text/plain 避免 CORS preflight）
    const res = await fetch(GAS_API_URL, {
      method: 'POST',
      // GAS doPost 以 text/plain 接收，可避免 CORS OPTIONS preflight
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(form.value),
    })

    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const text = await res.text()
    let result
    try {
      result = JSON.parse(text)
    } catch {
      result = { status: 'success' }
    }

    if (result.status === 'success') {
      confirmDialogVisible.value = false
      successOrderNo.value = result.orderNo || ''
      isSuccess.value = true
      // 若在 LINE 內建瀏覽器，自動關閉視窗（已改為「再訂購一筆」切換畫面，暫時保留）
      // if (typeof liff !== 'undefined' && liff.isInClient()) {
      //   liff.closeWindow()
      // }
    } else {
      throw new Error(result.message || '後端回傳未知錯誤')
    }
  } catch (err) {
    console.error('[送出失敗]', err)
    ElMessage.error('送出失敗：' + (err.message || err))
  } finally {
    submitting.value = false
  }
}

/** Step 3：再訂購一筆 → 重置表單並切回訂單畫面 */
function resetAndReorder() {
  // 重置表單欄位（保留 userId / displayName）
  const { userId: uid, displayName: name } = form.value
  form.value = {
    userId: uid,
    displayName: name,
    items: '',
    deliveryMethod: '自取',
    pickupName: '',
    pickupDate: '',
    pickupPhone: '',
    pickupNote: '',
    ordererName: '',
    receiverName: '',
    receiverPhone: '',
    addressCity: '',
    addressDistrict: '',
    addressDetail: '',
    shippingDate: '',
    temperature: '常溫',
    deliveryNote: '',
  }
  // 清除驗證狀態
  formRef.value?.resetFields()
  // 重置成功狀態
  successOrderNo.value = ''
  isSuccess.value = false
}
</script>

<template>
  <div class="form-wrapper">
    <!-- 全頁讀取狀態（LIFF 驗證中） -->
    <div v-if="loading" v-loading="true" element-loading-text="驗證 LINE 帳號中..." class="loading-placeholder" />

    <!-- 授權錯誤畫面 -->
    <div v-else-if="isAuthError" class="auth-error-section">
      <div class="auth-error-icon">🔒</div>
      <h2 class="auth-error-title">授權未完成</h2>
      <p class="auth-error-desc">{{ authErrorDesc }}。<br>必須完成授權方可填寫訂購單。</p>
      <el-button class="retry-auth-btn" @click="liff.login({ redirectUri: window.location.href })">
        重新嘗試授權
      </el-button>
    </div>

    <!-- 未加入好友提示 -->
    <div v-else-if="!isFriend" class="notice-card">
      <h3>⚠️ 請先加入【覓棗晨】官方好友</h3>
      <p>為了確保您填單後能即時透過 LINE 收到訂單確認明細與出貨通知，請先點擊下方按鈕加入好友。</p>
      <a href="https://lin.ee/7dDsK7e" class="btn-friend">➕ 點我加官方帳號好友</a>
    </div>

    <!-- 主要表單畫面 -->
    <div v-else-if="!isSuccess">
      <!-- 標題區 -->
      <header class="header-section">
        <h1>覓棗晨 訂購單</h1>
        <p>請完整填寫以下資訊，<br>送出後系統將發送訂單明細至您的 LINE</p>
      </header>

      <!-- 表單 -->
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" size="large">
        <!-- 訂購品項 -->
        <el-form-item label="訂購品項與數量" prop="items" required>
          <el-input v-model="form.items" type="textarea" :rows="5" placeholder="填寫範例：&#10;5A 5斤裝*1盒" />
        </el-form-item>

        <!-- 取貨方式 -->
        <el-form-item label="取貨方式" prop="deliveryMethod" required>
          <el-radio-group v-model="form.deliveryMethod" @change="handleDeliveryChange">
            <el-radio value="自取" size="large">自取</el-radio>
            <el-radio value="宅配到府" size="large">宅配到府</el-radio>
          </el-radio-group>
        </el-form-item>

        <!-- ── 自取欄位 ── -->
        <template v-if="form.deliveryMethod === '自取'">
          <el-form-item label="取貨人姓名" prop="pickupName" required>
            <el-input v-model="form.pickupName" placeholder="請填寫完整姓名" />
          </el-form-item>

          <el-form-item label="自取日期" prop="pickupDate" required>
            <el-date-picker v-model="form.pickupDate" type="date" placeholder="請選擇日期" format="YYYY-MM-DD"
              value-format="YYYY-MM-DD" style="width: 100%" :editable="false" />
          </el-form-item>

          <el-form-item label="聯絡電話" prop="pickupPhone" required>
            <el-input v-model="form.pickupPhone" placeholder="請填寫聯絡電話" type="tel" />
          </el-form-item>

          <el-form-item label="備註" prop="pickupNote">
            <el-input v-model="form.pickupNote" type="textarea" :rows="3" placeholder="如有其他需求請備註" />
          </el-form-item>
        </template>

        <!-- ── 宅配欄位 ── -->
        <template v-if="form.deliveryMethod === '宅配到府'">
          <el-form-item label="訂貨人姓名" prop="ordererName">
            <el-input v-model="form.ordererName" placeholder="請填寫完整姓名" />
          </el-form-item>

          <el-form-item label="收件人姓名" prop="receiverName" required>
            <el-input v-model="form.receiverName" placeholder="請填寫完整姓名" />
          </el-form-item>

          <el-form-item label="收件人聯絡電話" prop="receiverPhone" required>
            <el-input v-model="form.receiverPhone" type="tel" placeholder="請填寫電話號碼" />
          </el-form-item>

          <!-- 收件人地址 -->
          <el-form-item label="收件人地址" prop="addressDetail" required>
            <div class="address-container">
              <div class="address-group">
                <!-- 縣市 -->
                <el-form-item prop="addressCity" style="margin-bottom: 0; width: 100%">
                  <el-select v-model="form.addressCity" placeholder="請選擇縣市" style="width: 100%"
                    @change="handleCityChange">
                    <el-option v-for="city in cityOptions" :key="city.name" :label="city.name" :value="city.name" />
                  </el-select>
                </el-form-item>

                <!-- 鄉鎮市區 -->
                <el-form-item prop="addressDistrict" style="margin-bottom: 0; width: 100%">
                  <el-select v-model="form.addressDistrict" placeholder="請選擇鄉鎮市區" :disabled="!form.addressCity"
                    style="width: 100%">
                    <el-option v-for="dist in districtOptions" :key="dist" :label="dist" :value="dist" />
                  </el-select>
                </el-form-item>
              </div>

              <!-- 詳細地址 -->
              <el-input v-model="form.addressDetail" type="textarea" :rows="2"
                placeholder="請填寫街道、路段、巷弄與門牌號碼&#10;（例如：中正路100號）" />
            </div>
          </el-form-item>

          <el-form-item label="期望出貨日期" prop="shippingDate">
            <el-date-picker v-model="form.shippingDate" type="date" placeholder="請選擇日期（可不填）" format="YYYY-MM-DD"
              value-format="YYYY-MM-DD" style="width: 100%" :editable="false" />
          </el-form-item>

          <el-form-item label="運送溫層" prop="temperature">
            <el-radio-group v-model="form.temperature">
              <el-radio value="常溫">常溫</el-radio>
              <el-radio value="冷藏">冷藏</el-radio>
            </el-radio-group>
          </el-form-item>

          <el-form-item label="備註" prop="deliveryNote">
            <el-input v-model="form.deliveryNote" type="textarea" :rows="3" placeholder="如有其他需求請備註" />
          </el-form-item>
        </template>

        <!-- 提交按鈕 -->
        <el-button class="submit-btn" :loading="submitting" @click="submitForm">
          {{ submitting ? '訂單送出中...' : '確認送出訂單' }}
        </el-button>
      </el-form>

      <!-- ── 訂單內容確認彈框 ── -->
      <el-dialog v-model="confirmDialogVisible" title="請確認訂單內容" class="confirm-dialog" align-center
        :close-on-click-modal="false" append-to-body>
        <div class="confirm-content">
          <div class="confirm-item">
            <div class="confirm-label">訂購品項與數量:</div>
            <div class="confirm-value">{{ form.items }}</div>
          </div>
          <div class="confirm-item">
            <div class="confirm-label">取貨方式:</div>
            <div class="confirm-value">{{ form.deliveryMethod }}</div>
          </div>

          <!-- 自取確認 -->
          <template v-if="form.deliveryMethod === '自取'">
            <div class="confirm-item">
              <div class="confirm-label">取貨人姓名:</div>
              <div class="confirm-value">{{ form.pickupName }}</div>
            </div>
            <div class="confirm-item">
              <div class="confirm-label">自取日期:</div>
              <div class="confirm-value">{{ form.pickupDate }}</div>
            </div>
            <div class="confirm-item">
              <div class="confirm-label">聯絡電話:</div>
              <div class="confirm-value">{{ form.pickupPhone }}</div>
            </div>
            <div class="confirm-item">
              <div class="confirm-label">備註:</div>
              <div class="confirm-value">{{ form.pickupNote || '無' }}</div>
            </div>
          </template>

          <!-- 宅配確認 -->
          <template v-if="form.deliveryMethod === '宅配到府'">
            <div class="confirm-item">
              <div class="confirm-label">訂貨人姓名:</div>
              <div class="confirm-value">{{ form.ordererName || '同收件人' }}</div>
            </div>
            <div class="confirm-item">
              <div class="confirm-label">收件人姓名:</div>
              <div class="confirm-value">{{ form.receiverName }}</div>
            </div>
            <div class="confirm-item">
              <div class="confirm-label">收件人聯絡電話:</div>
              <div class="confirm-value">{{ form.receiverPhone }}</div>
            </div>
            <div class="confirm-item">
              <div class="confirm-label">收件人地址:</div>
              <div class="confirm-value">{{ fullAddress }}</div>
            </div>
            <div class="confirm-item">
              <div class="confirm-label">期望出貨日期:</div>
              <div class="confirm-value">{{ form.shippingDate || '不指定' }}</div>
            </div>
            <div class="confirm-item">
              <div class="confirm-label">運送溫層:</div>
              <div class="confirm-value">{{ form.temperature }}</div>
            </div>
            <div class="confirm-item">
              <div class="confirm-label">備註:</div>
              <div class="confirm-value">{{ form.deliveryNote || '無' }}</div>
            </div>
          </template>
        </div>

        <template #footer>
          <div class="dialog-footer">
            <el-button v-show="!submitting" class="dialog-btn-cancel" @click="confirmDialogVisible = false">
              返回修改
            </el-button>
            <el-button class="dialog-btn-confirm" :loading="submitting" @click="handleFinalSubmit">
              {{ submitting ? '訂單送出中...' : '確認送出' }}
            </el-button>
          </div>
        </template>
      </el-dialog>
    </div>

    <!-- 訂單成功畫面 -->
    <div v-else class="success-section">
      <div class="success-icon">🎉</div>
      <h2 class="success-title">送出成功！</h2>
      <p v-if="successOrderNo" class="success-order-no">訂單編號：#{{ successOrderNo }}</p>
      <p class="success-msg">訂單已成功送出！<br>明細已發送至您的 LINE。</p>
      <el-button class="reorder-btn" @click="resetAndReorder">再訂購一筆</el-button>
    </div>
  </div>
</template>

<style lang="scss">
// ─────────────────────────────────────────────
// 全域根元素樣式（放此處避免 scoped 失效）
// ─────────────────────────────────────────────
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html {
  font-size: 20px;
  /* 恢復標準基準值 (1rem = 16px)，避免 UI 元件爆開 */
  -webkit-text-size-adjust: 100%;
  /* 防止 iOS Safari 自動放大字體 */
  text-size-adjust: 100%;
}

body {
  background-color: #ffffff;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  color: #333333;
  font-size: 1rem;
}

// ─── Element Plus 覆寫 ───────────────────────
.el-form {
  border: 2px solid #a2cca4;
  box-shadow: 0 4px 24px rgba(162, 204, 164, 0.15);
  margin: 16px;
  padding: 0 0 30px !important;
  border-radius: 12px;
}

.el-form-item {
  background: #ffffff !important;
  padding: 20px !important;
  border-radius: 12px;
  margin-bottom: 20px !important;
}

.el-form-item__label {
  font-size: 1rem !important;
  font-weight: 600 !important;
  color: #333333 !important;
  margin-bottom: 0.25rem !important;
  line-height: 1.4 !important;
}

// 必填星號移至標籤後方
.el-form-item.is-required:not(.is-no-asterisk)>.el-form-item__label::after {
  content: '*';
  color: #f56c6c;
  margin-left: 2px;
}

.el-form-item.is-required:not(.is-no-asterisk)>.el-form-item__label::before {
  display: none !important;
}

.el-input {
  min-height: 56px !important;
  height: 56px !important;
}

.el-input__wrapper,
.el-select__wrapper,
.el-date-editor.el-input__wrapper {
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  min-height: 56px !important;
  height: 56px !important;
  background-color: #ffffff !important;
  border: 1px solid #dcdfe6;
  box-shadow: none !important;
  border-radius: 8px;
  display: flex !important;
  align-items: center !important;
  transition: border-color 0.2s;
}

.el-input__wrapper:hover,
.el-select__wrapper:hover,
.el-date-editor.el-input__wrapper:hover,
.el-input__wrapper.is-focus,
.el-select__wrapper.is-focus,
.el-date-editor.el-input__wrapper.is-focus {
  border-color: #febc2c !important;
  box-shadow: 0 0 0 1px #febc2c !important;
}

.el-form-item.is-error .el-input__wrapper,
.el-form-item.is-error .el-select__wrapper,
.el-form-item.is-error .el-textarea__inner,
.el-form-item.is-error .el-date-editor.el-input__wrapper {
  border-color: #f56c6c !important;
  box-shadow: 0 0 0 1px #f56c6c !important;
}

.el-form-item__error {
  font-size: 0.5rem !important;
  padding-top: 4px;
}

.el-textarea__inner {
  padding: 12px !important;
  border-radius: 8px;
  border: 1px solid #dcdfe6;
  box-shadow: none !important;
  outline: none !important;
  transition: border-color 0.2s;

  &:hover,
  &:focus {
    border-color: #febc2c !important;
    box-shadow: 0 0 0 1px #febc2c !important;
    outline: none !important;
  }
}

.el-input__inner::placeholder,
.el-textarea__inner::placeholder,
.el-date-editor input::placeholder,
.el-select__placeholder.is-transparent,
.el-select__placeholder.is-transparent span {
  white-space: pre-line;
  line-height: 1.4;
  font-size: 0.85rem !important;
  color: #999999 !important;
}

.el-input__inner,
.el-textarea__inner,
.el-input__wrapper input,
.el-date-editor input,
.el-select__selected-item,
.el-select__selected-item span {
  font-size: 0.85rem !important;
  color: #333333 !important;
  line-height: 1.4;
}

.el-select-dropdown__item {
  font-size: 0.85rem !important;
  height: 40px !important;
  line-height: 40px !important;
}

.el-radio {
  margin-right: 24px;
  margin-bottom: 10px;
}

.el-radio__label {
  font-size: 0.85rem !important;
  color: #333333 !important;
  font-weight: 500;
}

.el-radio__input.is-checked .el-radio__inner {
  border-color: #febc2c !important;
  background: #febc2c !important;
}

.el-radio__input.is-checked+.el-radio__label {
  color: #333333 !important;
  font-weight: 600;
}

// ─── 確認彈框 ────────────────────────────────
.confirm-dialog {
  max-width: 580px !important;
  width: 90% !important;
  border-radius: 16px !important;
  overflow: hidden;
  margin: 0 auto;

  .el-dialog__header {
    padding: 20px 24px 14px !important;
    margin-right: 0 !important;
    border-bottom: 1px solid #ebeef5;
    text-align: center;
  }

  .el-dialog__headerbtn {
    font-size: 1.1rem !important;
    top: 18px !important;
    right: 20px !important;
  }

  .el-dialog__title {
    font-size: 1.2rem !important;
    font-weight: 700 !important;
    color: #a2cca4 !important;
  }

  .el-dialog__body {
    padding: 20px 24px !important;
    max-height: 60vh;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .el-dialog__footer {
    padding: 16px 24px 20px !important;
    border-top: 1px solid #ebeef5;
  }
}

@media screen and (max-width: 768px) {
  body {
    padding: 12px 8px 40px;
  }

  .address-group {
    flex-direction: column;
    gap: 1.25rem;
  }
}
</style>

<style lang="scss" scoped>
.form-wrapper {
  max-width: 800px;
  margin: 0 auto;
  background: transparent;
  border-radius: 16px;
  padding: 0 0 10px;
}

.loading-placeholder {
  min-height: 200px;
}

// ─── Header ──────────────────────────────────
.header-section {
  text-align: center;
  background: #a2cca4;
  padding: 24px 20px;
  margin: 0 0 20px;

  h1 {
    font-size: 1.8rem;
    color: #333333;
    margin-bottom: 8px;
    font-weight: 700;
  }

  p {
    font-size: 0.55rem;
    color: #ffffff;
  }
}

// ─── 未加入好友提示 ───────────────────────────
.notice-card {
  text-align: center;
  background: #ffffff;
  padding: 40px 20px;
  border-radius: 16px;

  h3 {
    color: #febc2c;
    margin-bottom: 12px;
    font-size: 1.3rem;
  }

  p {
    color: #666666;
    margin-bottom: 20px;
    line-height: 1.6;
    font-size: 1rem;
  }

  .btn-friend {
    display: inline-block;
    background-color: #a2cca4;
    color: #333333;
    padding: 14px 28px;
    border-radius: 8px;
    text-decoration: none;
    font-weight: bold;
    font-size: 1.1rem;
  }
}

// ─── 地址容器 ─────────────────────────────────
.address-container {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  width: 100%;

  .el-form-item {
    background: transparent !important;
    padding: 0 !important;
    box-shadow: none !important;
    margin-bottom: 0 !important;
  }
}

.address-group {
  display: flex;
  gap: 1.25rem;
  width: 100%;

  .el-select {
    width: 100%;
    flex: 1;
  }
}

// ─── 提交按鈕 ─────────────────────────────────
.submit-btn {
  display: block;
  width: 80%;
  margin: 16px auto 0;
  height: 60px;
  font-size: 1rem !important;
  font-weight: 600;
  border-radius: 12px;
  background-color: #febc2c !important;
  border-color: #febc2c !important;
  color: #333333 !important;
  box-shadow: 0 4px 16px rgba(254, 188, 44, 0.3);
  transition: all 0.3s;

  &:hover {
    background-color: #f5b222 !important;
    opacity: 0.95;
  }
}

// ─── 確認彈框內容 ─────────────────────────────
.confirm-content {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.confirm-item {
  display: flex;
  flex-direction: column;
  border-bottom: 1px dashed #e8e8e8;
  padding-bottom: 12px;

  &:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }
}

.confirm-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: #febc2c;
  margin-bottom: 4px;
}

.confirm-value {
  font-size: 1.05rem;
  font-weight: 500;
  color: #333333;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

// ─── 彈框底部按鈕 ─────────────────────────────
.dialog-footer {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.dialog-btn-cancel {
  flex: 1;
  height: 52px !important;
  font-size: 1rem !important;
  border-radius: 10px !important;
  color: #666666 !important;
  border: 1px solid #dcdfe6 !important;
  background: #ffffff !important;

  &:hover {
    background-color: #f5f5f5 !important;
    color: #333333 !important;
  }
}

.dialog-btn-confirm {
  flex: 1;
  height: 52px !important;
  font-size: 1rem !important;
  font-weight: 600 !important;
  border-radius: 10px !important;
  background-color: #febc2c !important;
  border-color: #febc2c !important;
  color: #333333 !important;
  box-shadow: 0 4px 12px rgba(254, 188, 44, 0.3) !important;

  &:hover {
    background-color: #f5b222 !important;
    border-color: #f5b222 !important;
  }
}

// ─── 授權錯誤畫面 ─────────────────────────────
.auth-error-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 80vh;
  padding: 40px 24px;
  text-align: center;

  .auth-error-icon {
    font-size: 4rem;
    margin-bottom: 16px;
  }

  .auth-error-title {
    font-size: 1.6rem;
    font-weight: 700;
    color: #f56c6c;
    margin-bottom: 16px;
  }

  .auth-error-desc {
    font-size: 0.95rem;
    color: #555555;
    line-height: 1.8;
    margin-bottom: 32px;
    white-space: pre-line;
  }

  .retry-auth-btn {
    height: 56px;
    padding: 0 40px;
    font-size: 1rem !important;
    font-weight: 600;
    border-radius: 12px;
    background-color: #febc2c !important;
    border-color: #febc2c !important;
    color: #333333 !important;
    box-shadow: 0 4px 16px rgba(254, 188, 44, 0.3);
    transition: all 0.3s;

    &:hover {
      background-color: #f5b222 !important;
      opacity: 0.95;
    }
  }
}

// ─── 訂單成功畫面 ─────────────────────────────
.success-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  padding: 40px 24px;
  text-align: center;

  .success-icon {
    font-size: 4rem;
    margin-bottom: 16px;
  }

  .success-title {
    font-size: 1.6rem;
    font-weight: 700;
    color: #a2cca4;
    margin-bottom: 16px;
  }

  .success-order-no {
    font-size: 0.9rem;
    font-weight: 600;
    color: #febc2c;
    background: #fffbf0;
    border: 1px solid #febc2c;
    border-radius: 8px;
    padding: 8px 20px;
    margin-bottom: 16px;
  }

  .success-msg {
    font-size: 0.95rem;
    color: #555555;
    line-height: 1.8;
    margin-bottom: 32px;
  }

  .reorder-btn {
    height: 56px;
    padding: 0 40px;
    font-size: 1rem !important;
    font-weight: 600;
    border-radius: 12px;
    background-color: #febc2c !important;
    border-color: #febc2c !important;
    color: #333333 !important;
    box-shadow: 0 4px 16px rgba(254, 188, 44, 0.3);
    transition: all 0.3s;

    &:hover {
      background-color: #f5b222 !important;
      opacity: 0.95;
    }
  }
}
</style>
