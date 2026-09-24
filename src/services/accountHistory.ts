import { supabase } from './supabase'

export type NexusHistoryItem = {
  id: string
  product_name: string
  quantity: number
  unit_price: number
  line_total: number
}

export type NexusInvoiceSummary = {
  id: string
  invoice_number: string
  status: string
  pdf_status: string | null
  send_status: string | null
  sent_at: string | null
  created_at: string
}

export type NexusPaymentSummary = {
  id: string
  provider: string | null
  amount: number
  status: string
  submitted_at: string | null
  verified_at: string | null
  paid_at: string | null
}

export type NexusOrderHistory = {
  id: string
  order_number: string | null
  status: string
  subtotal: number
  discount_total: number
  shipping_total: number
  tax_total: number
  total: number
  payment_status: string | null
  payment_method: string | null
  paid_at: string | null
  created_at: string
  items: NexusHistoryItem[]
  invoice: NexusInvoiceSummary | null
  payment: NexusPaymentSummary | null
}

export async function getMyOrderHistory(customerId: string): Promise<NexusOrderHistory[]> {
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('id,order_number,status,subtotal,discount_total,shipping_total,tax_total,total,payment_status,payment_method,paid_at,created_at')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })

  if (ordersError) throw ordersError
  if (!orders?.length) return []

  const orderIds = orders.map(order => order.id)

  const [
    { data: items, error: itemsError },
    { data: invoices, error: invoicesError },
    { data: payments, error: paymentsError },
  ] = await Promise.all([
    supabase
      .from('order_items')
      .select('id,order_id,product_name,quantity,unit_price,line_total')
      .in('order_id', orderIds)
      .order('created_at', { ascending: true }),
    supabase
      .from('invoices')
      .select('id,order_id,invoice_number,status,pdf_status,send_status,sent_at,created_at')
      .in('order_id', orderIds)
      .order('created_at', { ascending: false }),
    supabase
      .from('payments')
      .select('id,order_id,provider,amount,status,submitted_at,verified_at,paid_at')
      .in('order_id', orderIds),
  ])

  if (itemsError) throw itemsError
  if (invoicesError) throw invoicesError
  if (paymentsError) throw paymentsError

  return orders.map(order => {
    const invoice = invoices?.find(candidate => candidate.order_id === order.id) || null
    const payment = payments?.find(candidate => candidate.order_id === order.id) || null

    return {
      ...order,
      subtotal: Number(order.subtotal || 0),
      discount_total: Number(order.discount_total || 0),
      shipping_total: Number(order.shipping_total || 0),
      tax_total: Number(order.tax_total || 0),
      total: Number(order.total || 0),
      items: (items || [])
        .filter(item => item.order_id === order.id)
        .map(item => ({
          id: item.id,
          product_name: item.product_name,
          quantity: item.quantity,
          unit_price: Number(item.unit_price || 0),
          line_total: Number(item.line_total || 0),
        })),
      invoice: invoice
        ? {
            id: invoice.id,
            invoice_number: invoice.invoice_number,
            status: invoice.status,
            pdf_status: invoice.pdf_status,
            send_status: invoice.send_status,
            sent_at: invoice.sent_at,
            created_at: invoice.created_at,
          }
        : null,
      payment: payment
        ? {
            id: payment.id,
            provider: payment.provider,
            amount: Number(payment.amount || 0),
            status: payment.status,
            submitted_at: payment.submitted_at,
            verified_at: payment.verified_at,
            paid_at: payment.paid_at,
          }
        : null,
    }
  }) as NexusOrderHistory[]
}
