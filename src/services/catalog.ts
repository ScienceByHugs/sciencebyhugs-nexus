import { supabase } from './supabase'

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
  const { data, error } = await supabase
    .from('products')
    .select('id,name,product_type,price,description,image_url,storefront_status,featured,shipping_from,product_categories(name)')
    .eq('active', true)
    .order('name')

  if (error) throw error

  return (data ?? []).map(product => {
    const rawCategory = product.product_categories
    const category = Array.isArray(rawCategory)
      ? rawCategory[0] ?? null
      : rawCategory ?? null

    return {
      id: product.id,
      name: product.name,
      product_type: product.product_type,
      price: Number(product.price || 0),
      description: product.description,
      image_url: product.image_url,
      storefront_status: product.storefront_status,
      featured: Boolean(product.featured),
      shipping_from: product.shipping_from,
      product_categories: category?.name ? { name: String(category.name) } : null,
    } satisfies CatalogProduct
  })
}
