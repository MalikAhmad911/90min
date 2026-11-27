'use client'

import { useEffect } from 'react'
import { SW_URL } from '@/lib/notify/client'

/**
 * Registers the service worker for every visitor (not only those who enable
 * notifications) so the site is installable and has an offline page. The same
 * registration is reused by the notifications code.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return
    const register = () => {
      navigator.serviceWorker.register(SW_URL, { scope: '/' }).catch(() => {
        // Not fatal: the site works without it, just not offline/installable.
      })
    }
    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })
  }, [])
  return null
}
