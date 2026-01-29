"use client";

import { useContext, useState, useEffect } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { AuthContext } from "@/contexts/auth.context";
import { formatCurrency, formatDate } from "@/lib/mock-data";
import { Eye, Loader2, Edit, LogOut } from "lucide-react";
import { useGetAllOrders } from "@/hooks/api/orders";
import { useGetProfile, useLogout, useUpdateProfile } from "@/hooks/api/auth";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const updateProfileSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").optional(),
  email: z.string().email("Invalid email address").optional(),
});

type UpdateProfileFormData = z.infer<typeof updateProfileSchema>;

export default function ProfilePage() {
  const { user, setUser } = useContext(AuthContext);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const { data: profileData, isLoading: isLoadingProfile, refetch: refetchProfile } = useGetProfile();
  const { mutate: logout } = useLogout();
  const { mutate: updateProfile, isPending: isUpdating } = useUpdateProfile();
  
  // Get customer ID from user or profile
  const customerId = user?._id || user?.id || profileData?.data?.user?._id || profileData?.data?.user?.id || user?.email || "";
  
  const { data: ordersData, isLoading: isLoadingOrders, isError: isOrdersError, refetch: refetchOrders } = useGetAllOrders(100, 0);
  const allOrders = ordersData ?? [];
  const userOrders = allOrders.filter((o) => o.customerId === customerId);

  // Use profile data if available, otherwise fall back to context user
  const displayUser = profileData?.data?.user || user;

  const form = useForm<UpdateProfileFormData>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      name: displayUser?.name || "",
      email: displayUser?.email || "",
    },
  });

  // Update form when user data changes
  useEffect(() => {
    if (displayUser) {
      form.reset({
        name: displayUser?.name || "",
        email: displayUser?.email || "",
      });
    }
  }, [displayUser, form]);

  const handleUpdateProfile = (data: UpdateProfileFormData) => {
    updateProfile(data, {
      onSuccess: () => {
        setIsEditDialogOpen(false);
        refetchProfile();
      },
    });
  };

  const getStatusBadgeVariant = (status: string) => {
    if (status === "delivered" || status === "confirmed") return "default";
    if (status === "shipped") return "secondary";
    if (status === "cancelled" || status === "failed") return "destructive";
    return "outline";
  };

  return (
    <div className="container mx-auto px-4 py-12 md:px-6">
      <div className="mb-8">
        <h1 className="text-4xl font-bold">My Profile</h1>
        <p className="text-muted-foreground">Manage your account and orders</p>
      </div>

      <div className="grid gap-8 md:grid-cols-3">
        {/* Profile Info */}
        <div className="md:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoadingProfile ? (
                <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading...
                </div>
              ) : (
                <>
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">
                      Name
                    </div>
                    <div className="font-medium">{displayUser?.name || "N/A"}</div>
                  </div>
                  <Separator />
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">
                      Email
                    </div>
                    <div>{displayUser?.email || "N/A"}</div>
                  </div>
                  {displayUser?.role && (
                    <>
                      <Separator />
                      <div>
                        <div className="text-sm font-medium text-muted-foreground">
                          Role
                        </div>
                        <Badge variant="outline">{displayUser?.role}</Badge>
                      </div>
                    </>
                  )}
                  <Separator />
                  <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="w-full">
                        <Edit className="mr-2 size-4" />
                        Edit Profile
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Edit Profile</DialogTitle>
                        <DialogDescription>
                          Update your profile information
                        </DialogDescription>
                      </DialogHeader>
                      <form onSubmit={form.handleSubmit(handleUpdateProfile)}>
                        <FieldGroup>
                          <Controller
                            name="name"
                            control={form.control}
                            render={({ field, fieldState }) => (
                              <Field data-invalid={fieldState.invalid}>
                                <FieldLabel htmlFor="name">Name</FieldLabel>
                                <Input
                                  {...field}
                                  id="name"
                                  placeholder="Your name"
                                  aria-invalid={fieldState.invalid}
                                />
                                {fieldState.invalid && (
                                  <FieldError errors={[fieldState.error]} />
                                )}
                              </Field>
                            )}
                          />
                          <Controller
                            name="email"
                            control={form.control}
                            render={({ field, fieldState }) => (
                              <Field data-invalid={fieldState.invalid}>
                                <FieldLabel htmlFor="email">Email</FieldLabel>
                                <Input
                                  {...field}
                                  id="email"
                                  type="email"
                                  placeholder="your@email.com"
                                  aria-invalid={fieldState.invalid}
                                />
                                {fieldState.invalid && (
                                  <FieldError errors={[fieldState.error]} />
                                )}
                              </Field>
                            )}
                          />
                          <div className="flex gap-2">
                            <Button
                              type="submit"
                              disabled={isUpdating}
                              className="flex-1"
                            >
                              {isUpdating ? (
                                <>
                                  <Loader2 className="mr-2 size-4 animate-spin" />
                                  Saving...
                                </>
                              ) : (
                                "Save Changes"
                              )}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setIsEditDialogOpen(false)}
                            >
                              Cancel
                            </Button>
                          </div>
                        </FieldGroup>
                      </form>
                    </DialogContent>
                  </Dialog>
                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={() => logout()}
                  >
                    <LogOut className="mr-2 size-4" />
                    Logout
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Orders */}
        <div className="md:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>My Orders</CardTitle>
              <CardDescription>Track and manage your orders</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingOrders ? (
                <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading orders...
                </div>
              ) : isOrdersError ? (
                <div className="py-12 text-center">
                  <p className="text-muted-foreground mb-4">
                    Failed to load your orders.
                  </p>
                  <Button variant="outline" onClick={() => refetchOrders()}>
                    Retry
                  </Button>
                </div>
              ) : userOrders.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-muted-foreground mb-4">
                    You haven't placed any orders yet.
                  </p>
                  <Button asChild>
                    <Link href="/products">Start Shopping</Link>
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order ID</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {userOrders.map((order) => (
                      <TableRow key={order.orderId}>
                        <TableCell className="font-mono font-medium text-sm">
                          {order.orderId}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(order.createdAt)}
                        </TableCell>
                        <TableCell>{order.items.length} item(s)</TableCell>
                        <TableCell className="font-medium">
                          {formatCurrency(order.totalAmount)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadgeVariant(order.status)}>
                            {order.status.charAt(0).toUpperCase() +
                              order.status.slice(1)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/profile/orders/${order.orderId}`}>
                              <Eye className="size-4" />
                              View
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
