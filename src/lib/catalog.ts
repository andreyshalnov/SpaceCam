import rawProducts from '@/data/products.json'
import rawMeta from '@/data/meta.json'

export type SectionId = 'intercom' | 'switches' | 'nodes'

export interface Spec { name: string; value: string }
export interface DocItem {
  name?: string
  type?: string
  url?: string
  public_path?: string | null
  size_kb?: number
  local_path?: string | null
}
export interface Product {
  id: string
  sku: string
  title: string
  section: SectionId
  subcategory: string
  description: string
  features: string[]
  specs: Spec[]
  price: number | null
  stock_qty: number
  stock_status: 'in_stock' | 'pre_order'
  images: string[]
  image_urls: string[]
  documents: DocItem[]
  layta_url: string | null
  status: 'found' | 'placeholder'
  flags: { isNew?: boolean; isHit?: boolean }
}

export interface SectionMeta { title: string; short: string; icon: string }

export interface SiteMeta {
  brand: string
  owner: string
  generated: string
  stock_date: string
  stock_note: string
  price_note: string
  sections: Record<SectionId, SectionMeta>
  subcats: Record<SectionId, Record<string, number>>
  certifications: { name: string; scope: string; type: string }[]
  certs_tu: string
  certs_decl: string
  warranty: string
  counts: {
    total: number
    by_section: Record<SectionId, number>
    found: number
    placeholder: number
  }
}

export const PRODUCTS = rawProducts as unknown as Product[]
export const META = rawMeta as unknown as SiteMeta

export const SECTION_IDS: SectionId[] = ['intercom', 'switches', 'nodes']

export const SECTION_ROUTE: Record<SectionId, string> = {
  intercom: '/intercom',
  switches: '/switches',
  nodes: '/nodes',
}

export const byId = (id: string) => PRODUCTS.find((p) => p.id === id)

export const fmtPrice = (v: number | null | undefined) =>
  v == null ? null : `${new Intl.NumberFormat('ru-RU').format(Math.round(v))} ₽`

export function inStockCount(p: Product) {
  return p.stock_status === 'in_stock' ? p.stock_qty : 0
}

export function relatedProducts(p: Product, n = 4): Product[] {
  const sameSub = PRODUCTS.filter(
    (x) => x.id !== p.id && x.section === p.section && x.subcategory === p.subcategory && x.images.length > 0
  )
  const sameSection = PRODUCTS.filter(
    (x) => x.id !== p.id && x.section === p.section && x.subcategory !== p.subcategory && x.images.length > 0
  )
  const rest = PRODUCTS.filter((x) => x.section !== p.section && x.images.length > 0)
  return [...sameSub, ...sameSection, ...rest].slice(0, n)
}

/** Кураторские флагманы для главной */
export const FEATURED_IDS = [
  'sc-l2-24gp-385-4g-a',
  'sc-8gp-120-2g-a',
  'sc-box-l2-4gp-120-2g-ups-a',
  'sc-int-v007-2-lwb',
]

export function featuredProducts(): Product[] {
  const list = FEATURED_IDS.map((id) => byId(id)).filter(Boolean) as Product[]
  if (list.length === 4) return list
  return PRODUCTS.filter((p) => p.images.length > 0).slice(0, 4)
}

/** Логотип-схема решения IP-домофонии (узлы графа) */
export const SOLUTION_NODES = [
  { title: 'Станции вызова', skus: 'SC-INT-D100 / D200 / D500', icon: 'cctv' },
  { title: 'Этажные узлы PoE', skus: 'SC-8GP-120 / SC-L2-8GP-120', icon: 'network' },
  { title: 'Агрегация', skus: 'SC-L2-24G-4G + SFP-оптика', icon: 'layers' },
  { title: 'Ядро и АРМ', skus: 'SC-L3-48G-6GX · мониторы V007/V010', icon: 'monitor' },
]
