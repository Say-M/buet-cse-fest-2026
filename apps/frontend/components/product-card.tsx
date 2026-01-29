"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart } from "lucide-react";
import { useCart } from "@/contexts/cart.context";
import {
  formatCurrency,
  getStatusColor,
  type InventoryItem,
} from "@/lib/mock-data";
import { cn } from "@/lib/utils";

interface ProductCardProps {
  product: InventoryItem;
  showAddToCart?: boolean;
  showQuantityBadge?: boolean;
  showStatusBadge?: boolean;
  descriptionLines?: number;
  className?: string;
  onAddToCart?: () => void;
}

export function ProductCard({
  product,
  showAddToCart = true,
  showQuantityBadge = false,
  showStatusBadge = true,
  descriptionLines = 3,
  className,
  onAddToCart,
}: ProductCardProps) {
  const { addItem } = useCart();

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onAddToCart) {
      onAddToCart();
    } else {
      addItem(product, 1);
    }
  };

  const getStatusBadgeVariant = () => {
    if (product.status === "in_stock") return "default";
    if (product.status === "low_stock") return "secondary";
    return "destructive";
  };

  const getStatusText = () => {
    if (product.status === "in_stock") return "In Stock";
    if (product.status === "low_stock") return "Low Stock";
    return "Out of Stock";
  };

  return (
    <Card
      className={cn(
        "flex flex-col cursor-pointer transition-shadow hover:shadow-lg",
        className,
      )}
      asChild
    >
      <Link href={`/products/${product.id}`}>
        <CardHeader>
          <CardTitle className="line-clamp-1">{product.name}</CardTitle>
          <CardDescription>{product.category}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-4">
          <p
            className={cn(
              "text-sm text-muted-foreground",
              descriptionLines === 1 && "line-clamp-1",
              descriptionLines === 2 && "line-clamp-2",
              descriptionLines === 3 && "line-clamp-3",
              descriptionLines === 4 && "line-clamp-4",
            )}
          >
            {product.description}
          </p>
          <div className="mt-auto space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold">
                {formatCurrency(product.price)}
              </div>
              <div className="flex flex-col items-end gap-1">
                {showStatusBadge && (
                  <Badge variant={getStatusBadgeVariant()}>
                    {getStatusText()}
                  </Badge>
                )}
                {showQuantityBadge && (
                  <Badge
                    variant={product.quantity > 10 ? "default" : "secondary"}
                  >
                    {product.quantity} in stock
                  </Badge>
                )}
              </div>
            </div>
            {showAddToCart && (
              <Button
                onClick={handleAddToCart}
                disabled={product.quantity === 0}
                className="w-full"
              >
                <ShoppingCart className="mr-2 size-4" />
                Add to Cart
              </Button>
            )}
          </div>
        </CardContent>
      </Link>
    </Card>
  );
}
