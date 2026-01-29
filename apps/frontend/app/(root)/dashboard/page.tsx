"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Package, ShoppingCart } from "lucide-react";
import Link from "next/link";

export default function DashboardPage() {
  const router = useRouter();

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Welcome to the admin dashboard</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <Link href="/dashboard/inventory" className="cursor-pointer">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="size-5" />
                Inventory Management
              </CardTitle>
              <CardDescription>
                Manage your inventory items and stock levels
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full">
                View Inventory
              </Button>
            </CardContent>
          </Link>
        </Card>

        <Card>
          <Link href="/dashboard/orders" className="cursor-pointer">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="size-5" />
                Order Management
              </CardTitle>
              <CardDescription>
                View and manage all customer orders
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full">
                View Orders
              </Button>
            </CardContent>
          </Link>
        </Card>
      </div>
    </div>
  );
}
