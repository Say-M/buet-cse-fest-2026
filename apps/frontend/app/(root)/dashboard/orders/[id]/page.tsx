"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft } from "lucide-react";
import { formatCurrency, formatDate, getStatusColor } from "@/lib/mock-data";
import {
  useCancelOrder,
  useGetOrderById,
  useShipOrder,
} from "@/hooks/api/orders";

export default function OrderViewPage() {
  const params = useParams();
  const orderId = params.id as string;
  const { data: order, isLoading, isError } = useGetOrderById(orderId);
  const shipOrder = useShipOrder();
  const cancelOrder = useCancelOrder();

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4 md:p-6">
        <div className="text-center text-muted-foreground">
          Loading order details...
        </div>
      </div>
    );
  }

  if (isError || !order) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4 md:p-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Order Not Found</h1>
          <p className="text-muted-foreground mb-4">
            The order you're looking for doesn't exist.
          </p>
          <Button asChild>
            <Link href="/dashboard/orders">Back to Orders</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/orders">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Order Details</h1>
          <p className="text-muted-foreground">
            View details for order {order.orderId}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Order Information</CardTitle>
            <CardDescription>Basic order details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-sm font-medium text-muted-foreground">
                Order ID
              </div>
              <div className="font-mono font-semibold">{order.orderId}</div>
            </div>
            <Separator />
            <div>
              <div className="text-sm font-medium text-muted-foreground">
                Status
              </div>
              <div className="mt-1">
                <Badge variant={getStatusColor(order.status) as any}>
                  {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                </Badge>
              </div>
            </div>
            <Separator />
            <div>
              <div className="text-sm font-medium text-muted-foreground">
                Order Date
              </div>
              <div>{formatDate(order.createdAt)}</div>
            </div>
            <Separator />
            <div>
              <div className="text-sm font-medium text-muted-foreground">
                Customer ID
              </div>
              <div className="font-mono text-sm">{order.customerId}</div>
            </div>
            <Separator />
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={shipOrder.isPending || cancelOrder.isPending}
                onClick={() => shipOrder.mutate(order.orderId)}
              >
                {shipOrder.isPending ? "Shipping..." : "Mark as Shipped"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={shipOrder.isPending || cancelOrder.isPending}
                onClick={() => cancelOrder.mutate(order.orderId)}
              >
                {cancelOrder.isPending ? "Cancelling..." : "Cancel Order"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Customer Information</CardTitle>
            <CardDescription>Customer details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-sm font-medium text-muted-foreground">
                Customer ID
              </div>
              <div className="font-mono text-sm">{order.customerId}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Order Items</CardTitle>
          <CardDescription>Items included in this order</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product ID</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.items.map((item) => (
                <TableRow key={item.productId}>
                  <TableCell className="font-mono text-sm">
                    {item.productId}
                  </TableCell>
                  <TableCell>{item.quantity}</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(item.unitPrice)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(item.unitPrice * item.quantity)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="mt-4 flex justify-end">
            <div className="space-y-2 text-right">
              <div className="text-sm text-muted-foreground">Total</div>
              <div className="text-2xl font-bold">
                {formatCurrency(order.totalAmount)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
