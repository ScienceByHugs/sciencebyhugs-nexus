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
  return (data ?? []) as CatalogProduct[]
}
