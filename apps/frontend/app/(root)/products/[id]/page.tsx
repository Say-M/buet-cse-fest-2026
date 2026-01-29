"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import {
  getInventoryById,
  mockInventory,
  formatCurrency,
  formatDate,
  getStatusColor,
} from "@/lib/mock-data";
import { useCart } from "@/contexts/cart.context";
import {
  ShoppingCart,
  ArrowLeft,
  Plus,
  Minus,
  Package,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { ProductCard } from "@/components/product-card";

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params.id as string;
  const product = getInventoryById(productId);
  const { addItem } = useCart();
  const [quantity, setQuantity] = useState(1);

  if (!product) {
    return (
      <div className="container mx-auto px-4 py-12 md:px-6">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Package className="mb-4 size-16 text-muted-foreground" />
          <h1 className="mb-2 text-2xl font-bold">Product Not Found</h1>
          <p className="mb-6 text-muted-foreground">
            The product you're looking for doesn't exist.
          </p>
          <Button asChild>
            <Link href="/products">Browse Products</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Get related products (same category, excluding current product)
  const relatedProducts = mockInventory
    .filter(
      (item) =>
        item.category === product.category &&
        item.id !== product.id &&
        item.status !== "out_of_stock",
    )
    .slice(0, 4);

  const handleAddToCart = () => {
    if (quantity > product.quantity) {
      toast.error(`Only ${product.quantity} items available in stock`);
      return;
    }
    addItem(product, quantity);
    toast.success(`${product.name} added to cart`);
  };

  const handleQuantityChange = (newQuantity: number) => {
    if (newQuantity < 1) {
      setQuantity(1);
      return;
    }
    if (newQuantity > product.quantity) {
      toast.error(`Only ${product.quantity} items available in stock`);
      setQuantity(product.quantity);
      return;
    }
    setQuantity(newQuantity);
  };

  return (
    <div className="container mx-auto px-4 py-8 md:px-6">
      {/* Back Button */}
      <Button variant="ghost" size="sm" asChild className="mb-6">
        <Link href="/products">
          <ArrowLeft className="mr-2 size-4" />
          Back to Products
        </Link>
      </Button>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Product Image Section */}
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div className="aspect-square flex items-center justify-center bg-muted p-12">
              <Package className="size-32 text-muted-foreground" />
            </div>
          </Card>
        </div>

        {/* Product Details Section */}
        <div className="space-y-6">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Badge variant="outline">{product.category}</Badge>
              <Badge variant={getStatusColor(product.status) as any}>
                {product.status === "in_stock"
                  ? "In Stock"
                  : product.status === "low_stock"
                    ? "Low Stock"
                    : "Out of Stock"}
              </Badge>
            </div>
            <h1 className="mb-2 text-4xl font-bold">{product.name}</h1>
            <p className="text-2xl font-bold text-primary">
              {formatCurrency(product.price)}
            </p>
          </div>

          <Separator />

          <div className="space-y-4">
            <div>
              <h3 className="mb-2 text-lg font-semibold">Description</h3>
              <p className="text-muted-foreground">{product.description}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">SKU</p>
                <p className="font-mono text-sm">{product.sku}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Availability
                </p>
                <div className="flex items-center gap-2">
                  {product.status === "in_stock" ? (
                    <>
                      <CheckCircle2 className="size-4 text-green-600" />
                      <span className="text-sm">
                        {product.quantity} in stock
                      </span>
                    </>
                  ) : product.status === "low_stock" ? (
                    <>
                      <AlertCircle className="size-4 text-yellow-600" />
                      <span className="text-sm">
                        Only {product.quantity} left
                      </span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="size-4 text-red-600" />
                      <span className="text-sm">Out of stock</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Add to Cart Section */}
          {product.status !== "out_of_stock" ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <label className="text-sm font-medium">Quantity:</label>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleQuantityChange(quantity - 1)}
                    disabled={quantity <= 1}
                  >
                    <Minus className="size-4" />
                  </Button>
                  <Input
                    type="number"
                    value={quantity}
                    onChange={(e) =>
                      handleQuantityChange(parseInt(e.target.value) || 1)
                    }
                    className="w-20 text-center"
                    min={1}
                    max={product.quantity}
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleQuantityChange(quantity + 1)}
                    disabled={quantity >= product.quantity}
                  >
                    <Plus className="size-4" />
                  </Button>
                </div>
              </div>
              <Button
                onClick={handleAddToCart}
                className="w-full"
                size="lg"
                disabled={product.quantity === 0}
              >
                <ShoppingCart className="mr-2 size-5" />
                Add to Cart
              </Button>
            </div>
          ) : (
            <Button className="w-full" size="lg" disabled>
              Out of Stock
            </Button>
          )}

          <div className="rounded-lg border bg-muted/50 p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 size-5 text-green-600" />
              <div className="space-y-1 text-sm">
                <p className="font-medium">Free Shipping</p>
                <p className="text-muted-foreground">
                  Free shipping on orders over $100
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Related Products Section */}
      {relatedProducts.length > 0 && (
        <div className="mt-16">
          <h2 className="mb-6 text-2xl font-bold">Related Products</h2>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {relatedProducts.map((relatedProduct) => (
              <ProductCard
                key={relatedProduct.id}
                product={relatedProduct}
                showAddToCart={false}
                descriptionLines={2}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
