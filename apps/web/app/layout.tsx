import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = { title: "小河", description: "Life River Voice Web" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hant"><body>{children}</body></html>;
}
