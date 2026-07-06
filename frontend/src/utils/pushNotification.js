import postApi from '@/api/postApi.js'

let registerPushNotificationPromise = null

export const registerPushNotification = async () => {
  if (registerPushNotificationPromise) {
    return registerPushNotificationPromise
  }

  registerPushNotificationPromise = (async () => {
    try {
      const result = await postApi.subscribeWebPush()
      if (!result) {
        console.info('Web push registration skipped.')
        return null
      }
      console.info('Web push registration completed.')
      return result
    } catch (error) {
      console.error('Web push registration failed:', error)
      throw error
    } finally {
      registerPushNotificationPromise = null
    }
  })()

  return registerPushNotificationPromise
}