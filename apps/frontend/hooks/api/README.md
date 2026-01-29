# API Hooks

React Query hooks for backend APIs.

## Hooks

### Auth

- `useLogin()` / `useRegister()` / `useLogout()`
- `useGetProfile()`

### Orders

- `useGetAllOrders(limit?, skip?)`
- `useGetOrderById(orderId)`
- `useCreateOrder()` / `useShipOrder()` / `useCancelOrder()`

### Inventory

- `useGetAllInventory()`
- `useGetInventoryByProductId(productId)`
- `useCreateInventory()` / `useReserveStock()` / `useReleaseStock()`

## Example

```typescript
const { data: orders } = useGetAllOrders();
const { mutate: createOrder } = useCreateOrder();

createOrder({
  customerId: "123",
  items: [{ productId: "abc", quantity: 2, unitPrice: 99.99 }],
});
```
