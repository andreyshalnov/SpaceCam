'use client'

import { useHashRoute } from './router'
import { Header } from './header'
import { Footer } from './footer'
import { Home } from './home'
import { SectionPage } from './catalog'
import { ProductPage } from './product-page'
import { About, Projects, Support, Where, PageHeader } from './static-pages'
import { SolutionsPage } from './solutions'
import { Login } from './login'
import { AdminPrices } from './admin-prices'
import { NewsPage } from './news'
import ProjectRegistry from './project-registry'
import { SECTIONS } from '@/data/site'
import productsData from '@/data/products.json'
import type { Product } from '@/data/site'

const products = productsData as unknown as Product[]
const sectionTitles = Object.fromEntries(SECTIONS.map((s) => [s.id, s.title]))

export default function SiteApp() {
  const route = useHashRoute()
  let content: React.ReactNode

  if (route.page === 'home') {
    content = <Home products={products} />
  } else if (route.page === 'section') {
    content = <SectionPage section={route.section} products={products} />
  } else if (route.page === 'product') {
    const p = products.find((x) => x.id === route.id)
    content = p ? (
      <ProductPage p={p} sectionTitle={sectionTitles[p.section] || 'Каталог'} />
    ) : (
      <NotFound />
    )
  } else if (route.page === 'about') {
    content = <About />
  } else if (route.page === 'projects') {
    content = <Projects />
  } else if (route.page === 'support') {
    content = <Support />
  } else if (route.page === 'where') {
    content = <Where />
  } else if (route.page === 'solutions') {
    content = <SolutionsPage products={products} />
  } else if (route.page === 'project-reg') {
    content = <ProjectRegistry />
  } else if (route.page === 'login') {
    content = <Login />
  } else if (route.page === 'admin-prices') {
    content = <AdminPrices />
  } else if (route.page === 'news') {
    content = <NewsPage PageHeader={PageHeader} />
  } else {
    content = <NotFound />
  }

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[60] focus:rounded focus:bg-[#a6ce39] focus:px-3 focus:py-2 focus:text-black"
      >
        Перейти к содержимому
      </a>
      <Header />
      <main id="main" className="flex-1">
        {content}
      </main>
      <Footer />
    </div>
  )
}

function NotFound() {
  return (
    <section className="bg-white py-24">
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
        <div className="text-6xl font-extrabold text-[#a6ce39]">404</div>
        <h1 className="mt-4 text-2xl font-bold text-[#111112]">Страница не найдена</h1>
        <p className="mt-2 text-sm text-[#707075]">Возможно, товар скрыт из каталога или ссылка устарела.</p>
        <a href="#/" className="mt-6 inline-flex items-center rounded-md bg-[#a6ce39] px-4 py-2 text-sm font-semibold text-black hover:bg-[#95bb31]">
          На главную
        </a>
      </div>
    </section>
  )
}
