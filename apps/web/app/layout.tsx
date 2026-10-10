import type { Metadata, Viewport } from "next";
import "./styles.css";

export const metadata: Metadata = { title: "小河", description: "Life River Voice Web" };
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#edf4f1"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hant"><body>{children}</body></html>;
}
