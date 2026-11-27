import { DEVICE_ID_HEADER, getDeviceId } from '@/lib/device'
import { getPreferredTimeZone } from '@/lib/timezone'

/**
 * Browser-side Web Push plumbing shared by the notification components.
 * Browser-only; nothing here runs during server rendering.
 */

export const SW_URL = '/sw.js'

/** SWR key of the preferences endpoint, shared so components can revalidate it. */
export const PREFS_URL = '/api/push/prefs'

/** The VAPID public key is base64url; PushManager wants the raw bytes. */
export function urlBase64ToUint8Array(base64url: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4)
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export function vapidPublicKey(): string | null {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  return key && key.trim() ? key.trim() : null
}

/** 'ur' when the page is in Urdu, otherwise 'en' - the only locales the API accepts. */
export function pageLocale(): 'en' | 'ur' {
  const lang = typeof document !== 'undefined' ? document.documentElement.lang : ''
  return lang.toLowerCase().startsWith('ur') ? 'ur' : 'en'
}

/** The current subscription, if this browser has one for our worker. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration(SW_URL)
  return reg ? reg.pushManager.getSubscription() : null
}

/** fetch() with the device header and a JSON error surfaced as an Error. */
export async function deviceFetch<T = unknown>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      [DEVICE_ID_HEADER]: getDeviceId(),
      ...(init.headers ?? {}),
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message = (data as { error?: string }).error
    throw new Error(message || `Request failed (${res.status})`)
  }
  return data as T
}

/**
 * Registers the worker, subscribes and stores the subscription server-side.
 * Must be called from a user gesture: it may show the permission prompt.
 * Returns the resulting permission so the caller can show "denied".
 */
export async function enablePush(): Promise<NotificationPermission> {
  const key = vapidPublicKey()
  if (!key) throw new Error('Notifications are not configured on this site')

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission

  await navigator.serviceWorker.register(SW_URL, { scope: '/' })
  const reg = await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    }))

  const json = sub.toJSON()
  try {
    await deviceFetch('/api/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
        deviceId: getDeviceId(),
        timezone: getPreferredTimeZone(),
        locale: pageLocale(),
      }),
    })
  } catch (err) {
    // A browser subscription the server does not know about would look
    // "enabled" here but never receive anything; undo it so state stays honest.
    await sub.unsubscribe().catch(() => undefined)
    throw err
  }
  return permission
}

/** Unsubscribes the browser and removes the server record. */
export async function disablePush(): Promise<void> {
  const sub = await currentSubscription()
  if (!sub) return
  const endpoint = sub.endpoint
  await sub.unsubscribe()
  await deviceFetch('/api/push/subscribe', {
    method: 'DELETE',
    body: JSON.stringify({ endpoint }),
  })
}
