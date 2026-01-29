# Frontend API Hooks

This directory contains React hooks for all backend API endpoints using React Query (`@tanstack/react-query`).

## Available Hooks

### Authentication (`hooks/api/auth.ts`)

#### `useLogin()`

Login to the system.

```typescript
const { mutate: login, isPending } = useLogin();
login({ email, password });
```

#### `useRegister()`

Register a new user.

```typescript
const { mutate: register, isPending } = useRegister();
register({ name, email, password, confirmPassword });
```

#### `useLogout()`

Logout from the system.

```typescript
const { mutate: logout } = useLogout();
logout();
```

#### `useGetProfile()`

Get current user's profile.

```typescript
const { data: profile, isLoading } = useGetProfile();
```

---

### Inventory Management (`hooks/api/inventory.ts`)

#### `useGetAllInventory()`

Get all inventory items.

```typescript
const { data: inventory, isLoading } = useGetAllInventory();
```

**Response Type:**

```typescript
interface InventoryItem {
  productId: string;
  productName: string;
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  updatedAt: string;
}
```

#### `useGetInventoryByProductId(productId: string)`

Get inventory by product ID.

```typescript
const { data: item, isLoading } = useGetInventoryByProductId("product-123");
```

#### `useCreateInventory()`

Create a new inventory item.

```typescript
const { mutate: createInventory } = useCreateInventory();
createInventory({
  productId: "product-123",
  productName: "Laptop Pro 15",
  quantity: 100,
});
```

#### `useReserveStock()`

Reserve stock for an order.

```typescript
const { mutate: reserveStock } = useReserveStock();
reserveStock({
  productId: "product-123",
  quantity: 5,
});
```

#### `useReleaseStock()`

Release reserved stock.

```typescript
const { mutate: releaseStock } = useReleaseStock();
releaseStock({
  productId: "product-123",
  quantity: 5,
});
```

---

### Order Management (`hooks/api/orders.ts`)

#### `useGetAllOrders(limit?: number, skip?: number)`

Get all orders with pagination.

```typescript
const { data: orders, isLoading } = useGetAllOrders(10, 0);
```

**Response Type:**

```typescript
interface Order {
  orderId: string;
  customerId: string;
  items: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
  }>;
  totalAmount: number;
  status: "pending" | "confirmed" | "shipped" | "delivered" | "cancelled";
  createdAt: string;
  updatedAt: string;
}
```

#### `useGetOrderById(orderId: string)`

Get order by ID.

```typescript
const { data: order, isLoading } = useGetOrderById("order-123");
```

#### `useCreateOrder()`

Create a new order with idempotency support.

```typescript
const { mutate: createOrder } = useCreateOrder();
createOrder({
  customerId: "customer-123",
  items: [{ productId: "product-123", quantity: 2, unitPrice: 1299.99 }],
  idempotencyKey: "uuid-here", // optional
});
```

**Response:**

```typescript
{
  orderId: string;
  status: "pending" | "confirmed" | "failed";
  message: string;
}
```

#### `useShipOrder()`

Mark an order as shipped.

```typescript
const { mutate: shipOrder } = useShipOrder();
shipOrder("order-123");
```

#### `useCancelOrder()`

Cancel an order and release reserved stock.

```typescript
const { mutate: cancelOrder } = useCancelOrder();
cancelOrder("order-123");
```

---

## Usage Examples

### Creating an Order Flow

```typescript
import { useCreateOrder, useReserveStock } from "@/hooks/api";

function CheckoutPage() {
  const { mutate: createOrder, isPending } = useCreateOrder();

  const handleCheckout = (cartItems) => {
    createOrder({
      customerId: user.id,
      items: cartItems.map(item => ({
        productId: item.id,
        quantity: item.quantity,
        unitPrice: item.price
      })),
      idempotencyKey: crypto.randomUUID()
    });
  };

  return (
    <button onClick={handleCheckout} disabled={isPending}>
      Place Order
    </button>
  );
}
```

### Managing Inventory

```typescript
import { useGetAllInventory, useCreateInventory } from "@/hooks/api";

function InventoryManager() {
  const { data: inventory, isLoading } = useGetAllInventory();
  const { mutate: createItem } = useCreateInventory();

  const handleCreate = () => {
    createItem({
      productId: "new-product",
      productName: "New Product",
      quantity: 100
    });
  };

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      {inventory?.map(item => (
        <div key={item.productId}>
          {item.productName} - {item.availableQuantity} available
        </div>
      ))}
      <button onClick={handleCreate}>Add New Item</button>
    </div>
  );
}
```

---

## Features

- ✅ **TypeScript**: Fully typed hooks and responses
- ✅ **React Query**: Built on `@tanstack/react-query` for caching and state management
- ✅ **Toast Notifications**: Automatic success/error notifications using `sonner`
- ✅ **Cache Invalidation**: Automatic cache updates after mutations
- ✅ **Error Handling**: Comprehensive error handling with user-friendly messages
- ✅ **Idempotency**: Support for idempotency keys in order creation
- ✅ **Authentication**: Automatic credential handling with `withCredentials`

---

## API Configuration

Configure the base URL in your environment variables:

```env
NEXT_PUBLIC_API_URL=http://localhost:3000/api
```

All API requests are automatically configured with:

- Base URL from environment variables
- Credentials included (`withCredentials: true`)
- Automatic cookie handling for authentication

---

## Error Handling

All hooks automatically handle errors and display toast notifications:

```typescript
const { mutate, error, isError } = useCreateOrder();

// Toast notification is automatically shown on error
// You can also manually check the error state:
if (isError) {
  console.error(error);
}
```

---

## Query Keys

The hooks use consistent query keys for caching:

- **Auth**: `["profile"]`
- **Inventory**: `["inventory", "all"]`, `["inventory", productId]`
- **Orders**: `["orders", "all", limit, skip]`, `["orders", orderId]`

You can use these keys to manually invalidate queries:

```typescript
import { useQueryClient } from "@tanstack/react-query";

const queryClient = useQueryClient();
queryClient.invalidateQueries({ queryKey: ["orders", "all"] });
```
