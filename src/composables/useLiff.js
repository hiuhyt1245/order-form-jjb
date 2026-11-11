import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

/**
 * useLiff — 封裝 LINE LIFF 初始化邏輯
 *
 * @param {string} liffId  - 從環境變數或設定傳入的 LIFF ID（空字串 → 本地預覽模式）
 * @returns {{ loading, isFriend, userId, displayName, initLiff }}
 */
export function useLiff(liffId) {
  const loading = ref(false)
  const isFriend = ref(true)
  const userId = ref('')
  const displayName = ref('')

  async function initLiff() {
    // 若未設定 LIFF_ID，以本地預覽模式執行，不阻塞畫面
    if (!liffId) {
      console.log('[LIFF] 未設定 LIFF ID，以本地預覽模式執行')
      return
    }

    if (typeof liff === 'undefined') {
      console.warn('[LIFF] SDK 尚未載入，請確認 index.html 已引入 LIFF SDK')
      return
    }

    loading.value = true

    try {
      // 1. 防止無限 redirect 迴圈：檢查 URL 是否含有授權錯誤參數
      const urlParams = new URLSearchParams(window.location.search)
      if (urlParams.has('error') || urlParams.has('error_description')) {
        const errorDesc = urlParams.get('error_description') || '您已取消 LINE 帳號授權'
        await ElMessageBox.alert(
          `${errorDesc}。\n必須完成授權方可填寫訂購單。`,
          '授權未完成',
          { confirmButtonText: '關閉頁面', type: 'warning' },
        )
        // 在 LINE 內建瀏覽器關閉視窗，否則嘗試關閉分頁
        liff.isInClient() ? liff.closeWindow() : window.close()
        return
      }

      // 2. 初始化 LIFF
      await liff.init({ liffId })

      // 3. 未登入 → 導向 LINE 登入（帶回當前網址避免跳回首頁）
      if (!liff.isLoggedIn()) {
        liff.login({ redirectUri: window.location.href })
        return
      }

      // 4. 取得使用者 Profile
      const profile = await liff.getProfile()
      userId.value = profile.userId
      displayName.value = profile.displayName || ''

      // 5. 確認是否為官方帳號好友
      const friendship = await liff.getFriendship()
      isFriend.value = friendship.friendFlag

      console.log('[LIFF] 初始化成功', profile, '好友狀態:', friendship)
    } catch (err) {
      console.error('[LIFF] 初始化或驗證失敗:', err)
      ElMessage.error('LINE 驗證發生錯誤：' + (err.message || err))
    } finally {
      loading.value = false
    }
  }

  return { loading, isFriend, userId, displayName, initLiff }
}

