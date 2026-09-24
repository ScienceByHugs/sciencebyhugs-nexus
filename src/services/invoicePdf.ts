import { supabase } from './supabase'

export async function getInvoicePdfLink(invoiceId: string) {
  const { data, error } = await supabase.functions.invoke('invoice-pdf-link', {
    body: { invoiceId },
  })

  if (error) throw error
  if (!data?.success || !data?.url) {
    throw new Error(data?.error || 'Invoice PDF is not available.')
  }

  return data as {
    success: true
    invoiceNumber: string
    url: string
    expiresIn: number
  }
}
