import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../config'

export type CatalogProduct = {
  id: string
  name: string
  product_type: string | null
  price: number
  description: string | null
  image_url: string | null
  storefront_status: string | null
  featured: boolean
  shipping_from: string | null
  product_categories: { name: string } | null
}

export async function fetchCatalog(): Promise<CatalogProduct[]> {
  const fields = [
    'id',
    'name',
    'product_type',
    'price',
    'description',
    'image_url',
    'storefront_status',
    'featured',
    'shipping_from',
    'product_categories(name)',
  ].join(',')

  const url =
    `${SUPABASE_URL}/rest/v1/products?select=${encodeURIComponent(fields)}&active=eq.true&order=name.asc`

  const response = await fetch(url, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Catalog request failed (${response.status})`)
  }

  return response.json()
}
