import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SpaceCam — сетевое оборудование и IP-домофония | ПТК",
  description:
    "Коммутаторы с PoE, всепогодные узлы коммутации SC-Box и IP-домофония SpaceCam. Единая сеть для видеонаблюдения, СКУД и домофонии. Производство — Санкт-Петербург.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="antialiased">{children}</body>
    </html>
  );
}
