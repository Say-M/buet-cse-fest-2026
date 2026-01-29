"use client";

import { useContext } from "react";
import { AuthContext } from "@/contexts/auth.context";

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { user } = useContext(AuthContext);
  return <>{!user && children}</>;
}
