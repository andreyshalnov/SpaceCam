'use client'

import React from 'react'

// Классы повторяют shadcn-разметку исходного сайта (скомпилированный CSS переиспользуется как есть)

export const BTN_BASE =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:ring-[3px] focus-visible:ring-black/20 [&_svg]:pointer-events-none [&_svg:not([class*=\'size-\'])]:size-4 shrink-0'

export function Button({
  variant = 'default',
  className = '',
  children,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: 'default' | 'outline' | 'ghost' | 'darkOutline' | 'limeOutline' }) {
  const variants: Record<string, string> = {
    default: 'bg-[#a6ce39] text-black shadow-xs hover:bg-[#95bb31] font-semibold',
    outline: 'border border-[#e6e8de] bg-white text-[#111112] shadow-xs hover:bg-[#f4f6ec]',
    ghost: 'hover:bg-[#f4f6ec] text-[#111112]',
    darkOutline: 'border border-[#3f4a2a] bg-transparent text-white hover:bg-[#1c2110]',
    limeOutline: 'border border-black/30 bg-transparent text-black hover:bg-black/5 font-semibold',
  }
  return (
    <a className={`${BTN_BASE} ${variants[variant]} ${className}`} {...props}>
      {children}
    </a>
  )
}

export function Badge({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-md px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 gap-1 [&_svg]:size-3 [&_svg]:pointer-events-none ${className}`}
    >
      {children}
    </span>
  )
}

export function Card({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={`bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm ${className}`}>
      {children}
    </div>
  )
}
