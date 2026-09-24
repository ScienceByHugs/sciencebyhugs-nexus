import type { CatalogProduct } from './catalog'

export type CartItem = {
  id: string
  product: string
  price: number
  quantity: number
  shippingFrom: string
}

export type CartTotals = {
  subtotal: number
  discount: number
  shipping: number
  tax: number
  total: number
}

const STORAGE_KEY = 'sbhNexusCart'

export const SHIPPING_RATES: Record<string, number> = {
  'Shipping - Emlin (L)': 70,
  'Shipping - Emlin (S)': 50,
  'Shipping - Emlin (US)': 20,
  'Shipping - Amazon': 3,
  'Shipping - Ella (US)': 20,
  'Shipping - Ella (CN)': 50,
  'Shipping Gigi': 16,
  'Shipping': 0,
}

export function loadCart(): CartItem[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveCart(cart: CartItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cart))
}

export function clearCart() {
  localStorage.removeItem(STORAGE_KEY)
}

export function addProduct(cart: CartItem[], product: CatalogProduct): CartItem[] {
  const next = cart.map(item => ({ ...item }))
  const existing = next.find(item => item.id === product.id)

  if (existing) {
    existing.quantity += 1
  } else {
    next.push({
      id: product.id,
      product: product.name,
      price: Number(product.price) || 0,
      quantity: 1,
      shippingFrom: product.shipping_from || '',
    })
  }

  saveCart(next)
  return next
}

export function changeQuantity(cart: CartItem[], id: string, delta: number): CartItem[] {
  const next = cart
    .map(item => item.id === id ? { ...item, quantity: item.quantity + delta } : { ...item })
    .filter(item => item.quantity > 0)

  saveCart(next)
  return next
}

export function calculateCart(cart: CartItem[], foundingMember: boolean): CartTotals {
  const subtotal = cart.reduce(
    (total, item) => total + Number(item.price || 0) * Number(item.quantity || 0),
    0,
  )

  const discount = 0
  const shippingSources = new Set(
    cart.map(item => item.shippingFrom?.trim()).filter(Boolean),
  )

  let shipping = 0

  shippingSources.forEach(source => {
    if (foundingMember && source.toLowerCase() === 'shipping gigi') return
    shipping += SHIPPING_RATES[source] || 0
  })

  const tax = subtotal * 0.08
  const total = subtotal - discount + shipping + tax

  return { subtotal, discount, shipping, tax, total }
}

export function cartQuantity(cart: CartItem[]) {
  return cart.reduce((total, item) => total + item.quantity, 0)
}
