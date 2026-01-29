"use client";

import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useCart } from "@/contexts/cart.context";
import { useNotifications } from "@/contexts/notifications.context";
import { formatCurrency } from "@/lib/mock-data";
import { orderCreateSchema, type OrderCreateSchemaType } from "@/schemas/order";
import { ArrowLeft } from "lucide-react";
import { useContext } from "react";
import { AuthContext } from "@/contexts/auth.context";
import { useCreateOrder } from "@/hooks/api/orders";

export default function CheckoutPage() {
  const router = useRouter();
  const { items, getTotalPrice, clearCart } = useCart();
  const { addNotification } = useNotifications();
  const { user } = useContext(AuthContext);
  const createOrder = useCreateOrder();

  const form = useForm<OrderCreateSchemaType>({
    resolver: zodResolver(orderCreateSchema),
    defaultValues: {
      customerName: user?.name ?? "",
      customerEmail: user?.email ?? "",
      shippingAddress: "",
      paymentMethod: "credit_card",
      items: items.map((item) => ({
        inventoryId: item.id,
        quantity: item.cartQuantity,
      })),
    },
  });

  if (items.length === 0) {
    return (
      <div className="container mx-auto px-4 py-12 md:px-6">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <h2 className="mb-2 text-2xl font-bold">Your cart is empty</h2>
          <p className="mb-6 text-muted-foreground">
            Add items to your cart before checkout.
          </p>
          <Button asChild>
            <Link href="/products">Browse Products</Link>
          </Button>
        </div>
      </div>
    );
  }

  async function onSubmit(data: OrderCreateSchemaType) {
    if (!user?._id) {
      addNotification({
        title: "Authentication required",
        message: "Please log in before placing an order.",
        type: "error",
      });
      router.push("/auth/login");
      return;
    }

    try {
      const idempotencyKey = crypto.randomUUID();
      await createOrder.mutateAsync({
        customerId: user._id,
        customerName: data.customerName,
        customerEmail: data.customerEmail,
        shippingAddress: data.shippingAddress,
        paymentMethod: data.paymentMethod,
        items: items.map((item) => ({
          productId: item.id,
          quantity: item.cartQuantity,
          unitPrice: item.price,
        })),
        idempotencyKey,
      });

      addNotification({
        title: "Order Placed",
        message: `Your order has been placed successfully. Order total: ${formatCurrency(
          getTotalPrice(),
        )}`,
        type: "success",
      });
      clearCart();
      router.push("/profile");
    } catch (error) {
      addNotification({
        title: "Order Failed",
        message: "Failed to place your order. Please try again.",
        type: "error",
      });
    }
  }

  return (
    <div className="container mx-auto px-4 py-12 md:px-6">
      <div className="mb-8">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/cart">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <h1 className="mt-4 text-4xl font-bold">Checkout</h1>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Shipping Information</CardTitle>
              <CardDescription>
                Enter your shipping and payment details
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={form.handleSubmit(onSubmit)}>
                <FieldGroup>
                  <Controller
                    name="customerName"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="customerName">
                          Full Name
                        </FieldLabel>
                        <Input
                          {...field}
                          id="customerName"
                          placeholder="John Doe"
                          aria-invalid={fieldState.invalid}
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />

                  <Controller
                    name="customerEmail"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="customerEmail">Email</FieldLabel>
                        <Input
                          {...field}
                          id="customerEmail"
                          type="email"
                          placeholder="john@example.com"
                          aria-invalid={fieldState.invalid}
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />

                  <Controller
                    name="shippingAddress"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="shippingAddress">
                          Shipping Address
                        </FieldLabel>
                        <Textarea
                          {...field}
                          id="shippingAddress"
                          placeholder="123 Main St, City, State 12345"
                          aria-invalid={fieldState.invalid}
                          rows={3}
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />

                  <Controller
                    name="paymentMethod"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="paymentMethod">
                          Payment Method
                        </FieldLabel>
                        <select
                          {...field}
                          id="paymentMethod"
                          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          <option value="credit_card">Credit Card</option>
                          <option value="debit_card">Debit Card</option>
                          <option value="paypal">PayPal</option>
                          <option value="bank_transfer">Bank Transfer</option>
                        </select>
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />

                  <Field>
                    <Button
                      type="submit"
                      className="w-full"
                      size="lg"
                      disabled={createOrder.isPending}
                    >
                      {createOrder.isPending ? "Placing Order..." : "Place Order"}
                    </Button>
                  </Field>
                </FieldGroup>
              </form>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle>Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                {items.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span>
                      {item.name} x{item.cartQuantity}
                    </span>
                    <span>
                      {formatCurrency(item.price * item.cartQuantity)}
                    </span>
                  </div>
                ))}
              </div>
              <Separator />
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Subtotal</span>
                  <span>{formatCurrency(getTotalPrice())}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Shipping</span>
                  <span>Free</span>
                </div>
                <Separator />
                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span>{formatCurrency(getTotalPrice())}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
