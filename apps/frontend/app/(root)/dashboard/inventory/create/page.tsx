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
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ArrowLeft } from "lucide-react";
import {
  createInventoryBackendSchema,
  type CreateInventoryBackendSchemaType,
} from "@/schemas/inventory";
import { useCreateInventory } from "@/hooks/api/inventory";

export default function CreateInventoryPage() {
  const router = useRouter();
  const createInventory = useCreateInventory();

  const form = useForm<CreateInventoryBackendSchemaType>({
    resolver: zodResolver(createInventoryBackendSchema),
    defaultValues: {
      productId: "",
      productName: "",
      quantity: 0,
      price: 0,
    },
  });

  async function onSubmit(data: CreateInventoryBackendSchemaType) {
    await createInventory.mutateAsync(data, {
      onSuccess: () => {
        router.push("/dashboard/inventory");
      },
    });
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/inventory">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Create Inventory Item</h1>
          <p className="text-muted-foreground">
            Add a new item to your inventory
          </p>
        </div>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Item Details</CardTitle>
          <CardDescription>
            Enter the details for the new inventory item (backend inventory
            model)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <FieldGroup>
              <Controller
                name="productId"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="productId">Product ID</FieldLabel>
                    <Input
                      {...field}
                      id="productId"
                      placeholder="e.g., SKU-001"
                      aria-invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />

              <Controller
                name="productName"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="productName">Product Name</FieldLabel>
                    <Input
                      {...field}
                      id="productName"
                      placeholder="e.g., Laptop Pro 15"
                      aria-invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <Controller
                  name="quantity"
                  control={form.control}
                  render={({ field: { onChange, ...field }, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="quantity">Quantity</FieldLabel>
                      <Input
                        {...field}
                        onChange={(e) => onChange(Number(e.target.value))}
                        id="quantity"
                        type="number"
                        placeholder="0"
                        aria-invalid={fieldState.invalid}
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />

                <Controller
                  name="price"
                  control={form.control}
                  render={({ field: { onChange, ...field }, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="price">Price</FieldLabel>
                      <Input
                        {...field}
                        onChange={(e) => onChange(Number(e.target.value))}
                        id="price"
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        aria-invalid={fieldState.invalid}
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
              </div>

              <Field>
                <div className="flex gap-2">
                  <Button type="submit" disabled={createInventory.isPending}>
                    {createInventory.isPending ? "Creating..." : "Create Item"}
                  </Button>
                  <Button type="button" variant="outline" asChild>
                    <Link href="/inventory">Cancel</Link>
                  </Button>
                </div>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
