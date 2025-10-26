import webpush from 'web-push'

// Configure VAPID details for web push
const vapidPublicKey = import.meta.env.VAPID_PUBLIC_KEY
const vapidPrivateKey = import.meta.env.VAPID_PRIVATE_KEY
const vapidSubject = import.meta.env.VAPID_SUBJECT

// Only configure if all VAPID keys are present
if (vapidPublicKey && vapidPrivateKey && vapidSubject) {
  webpush.setVapidDetails(
    vapidSubject,
    vapidPublicKey,
    vapidPrivateKey
  )
}

export interface PushSubscription {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
}

export interface PushPayload {
  title: string
  body: string
  url: string
}

/**
 * Send a push notification to a subscription
 */
export async function sendPushNotification(
  subscription: PushSubscription,
  payload: PushPayload
): Promise<{ success: boolean; error?: unknown }> {
  // Check if web push is configured
  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    console.warn('Web push not configured - skipping notification')
    return { success: false, error: 'Web push not configured' }
  }

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: subscription.keys
      },
      JSON.stringify(payload)
    )
    return { success: true }
  } catch (error) {
    console.error('Push notification error:', error)
    return { success: false, error }
  }
}
