import type { CartItem } from './cart'
import type { NexusProfile } from './auth'

const LEGACY_API_URL =
  'https://script.google.com/macros/s/AKfycbzinsZm0UTX4puZdr8yiy6FzzRMZuIUbPiYsyU_XT20avvmhbC_z_7Qfrqk7C7h2qCuYQ/exec'

type PaymentMethod = 'paypal' | 'venmo' | 'zelle'

type LegacyResponse = {
  success?: boolean
  invoiceNumber?: string
  error?: string
}

function profileToLegacyCustomer(profile: NexusProfile) {
  return {
    first: profile.first_name || '',
    last: profile.last_name || '',
    email: profile.email || '',
    phone: profile.phone || '',
    customerId: profile.customer_number || '',
    membership: profile.memberships?.name || '',
    accountStatus: profile.account_status || 'Active',
  }
}

export function createLegacyPayNowOrder(
  cart: CartItem[],
  profile: NexusProfile,
  paymentMethod: PaymentMethod,
): Promise<LegacyResponse> {
  return new Promise((resolve, reject) => {
    if (!profile.email) {
      reject(new Error('Your customer profile is missing an email address.'))
      return
    }

    const callback = `__nexusOrder_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const script = document.createElement('script')

    const cleanup = () => {
      delete (window as unknown as Record<string, unknown>)[callback]
      script.remove()
    }

    ;(window as unknown as Record<string, unknown>)[callback] = (response: LegacyResponse) => {
      cleanup()
      if (!response?.success) {
        reject(new Error(response?.error || 'The order service could not create your order.'))
        return
      }
      resolve(response)
    }

    const payload = encodeURIComponent(JSON.stringify({
      cart,
      customer: profileToLegacyCustomer(profile),
      paymentMethod,
    }))

    script.src =
      LEGACY_API_URL +
      '?api=createPayNowOrder' +
      '&data=' + payload +
      '&callback=' + encodeURIComponent(callback) +
      '&t=' + Date.now()

    script.onerror = () => {
      cleanup()
      reject(new Error('Nexus could not connect to the order service.'))
    }

    document.body.appendChild(script)
  })
}
