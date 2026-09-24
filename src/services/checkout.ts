import { supabase } from './supabase'
import type { CartItem } from './cart'

export type CheckoutOrderResult = {
  success: boolean
  orderId: string
  orderNumber: string
  totals: {
    subtotal: number
    discount: number
    shipping: number
    tax: number
    total: number
  }
}

export async function createCheckoutOrder(
  cart: CartItem[],
  options: {
    policyAcknowledged: boolean
    contactMethod?: string
    customerNotes?: string
  },
): Promise<CheckoutOrderResult> {
  const { data, error } = await supabase.functions.invoke('create-checkout-order', {
    method: 'POST',
    body: {
      items: cart.map(item => ({
        productId: item.id,
        quantity: item.quantity,
      })),
      policyAcknowledged: options.policyAcknowledged,
      contactMethod: options.contactMethod || null,
      customerNotes: options.customerNotes || null,
    },
  })

  if (error) {
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : error.message || 'Could not start checkout.',
    )
  }

  if (!data?.success || !data?.orderId) {
    throw new Error(data?.error || 'Could not start checkout.')
  }

  return data as CheckoutOrderResult
}
