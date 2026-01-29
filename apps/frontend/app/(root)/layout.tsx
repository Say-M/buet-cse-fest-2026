"use client";

import { PublicHeader } from "@/components/public-header";
import { PublicFooter } from "@/components/public-footer";
import { usePathname } from "next/navigation";

export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-screen flex-col">
      {!pathname?.includes("/dashboard") && <PublicHeader />}
      <main className="flex-1">{children}</main>
      {!pathname?.includes("/dashboard") && <PublicFooter />}
    </div>
  );
}
