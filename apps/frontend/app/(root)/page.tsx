"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { mockInventory } from "@/lib/mock-data";
import { ProductCard } from "@/components/product-card";

export default function Home() {
  const featuredProducts = mockInventory
    .filter((item) => item.status === "in_stock")
    .slice(0, 6);

  return (
    <div className="container mx-auto px-4 py-12 md:px-6">
      {/* Hero Section */}
      <section className="mb-16 text-center">
        <h1 className="mb-4 text-4xl font-bold tracking-tight md:text-5xl">
          Welcome to Our Store
        </h1>
        <p className="mb-8 text-lg text-muted-foreground md:text-xl">
          Discover amazing products at unbeatable prices
        </p>
        <Button asChild size="lg">
          <Link href="/products">Shop Now</Link>
        </Button>
      </section>

      {/* Featured Products */}
      <section>
        <h2 className="mb-8 text-3xl font-bold">Featured Products</h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {featuredProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              showQuantityBadge={true}
              showStatusBadge={false}
              descriptionLines={2}
            />
          ))}
        </div>
        <div className="mt-8 text-center">
          <Button variant="outline" asChild>
            <Link href="/products">View All Products</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
