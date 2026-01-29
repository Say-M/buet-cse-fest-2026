"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type InventoryItem } from "@/lib/mock-data";
import { ProductCard } from "@/components/product-card";
import { Search } from "lucide-react";
import { useGetAllInventory } from "@/hooks/api/inventory";

export default function ProductsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const { data: inventory, isLoading, isError } = useGetAllInventory();

  const products: InventoryItem[] =
    inventory?.map<InventoryItem>((item) => ({
      id: item.productId,
      name: item.productName,
      description: "No description available.",
      category: "General",
      quantity: item.availableQuantity,
      price: item.price,
      sku: item.productId,
      status:
        item.availableQuantity === 0
          ? "out_of_stock"
          : item.availableQuantity <= 5
            ? "low_stock"
            : "in_stock",
      createdAt: item.updatedAt,
      updatedAt: item.updatedAt,
    })) ?? [];

  const categories = Array.from(new Set(products.map((item) => item.category)));
  const availableProducts = products.filter(
    (item) => item.status !== "out_of_stock",
  );

  const filteredProducts = availableProducts.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      selectedCategory === "all" || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="container mx-auto px-4 py-12 md:px-6">
      <div className="mb-8">
        <h1 className="mb-4 text-4xl font-bold">Products</h1>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={selectedCategory === "all" ? "default" : "outline"}
              onClick={() => setSelectedCategory("all")}
            >
              All
            </Button>
            {categories.map((category) => (
              <Button
                key={category}
                variant={selectedCategory === category ? "default" : "outline"}
                onClick={() => setSelectedCategory(category)}
              >
                {category}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="py-12 text-center">
          <p className="text-muted-foreground">Loading products...</p>
        </div>
      ) : isError ? (
        <div className="py-12 text-center">
          <p className="text-destructive">
            Failed to load products. Please try again.
          </p>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-muted-foreground">No products found.</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
