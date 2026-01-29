// Mock data for Inventory and Orders

export interface InventoryItem {
  id: string;
  name: string;
  description: string;
  category: string;
  quantity: number;
  price: number;
  sku: string;
  status: "in_stock" | "low_stock" | "out_of_stock";
  createdAt: string;
  updatedAt: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  items: OrderItem[];
  total: number;
  status: "pending" | "processing" | "shipped" | "delivered" | "cancelled";
  createdAt: string;
  shippingAddress: string;
  paymentMethod: string;
}

export interface OrderItem {
  id: string;
  inventoryId: string;
  name: string;
  quantity: number;
  price: number;
  subtotal: number;
}

// Mock Inventory Data
export const mockInventory: InventoryItem[] = [
  {
    id: "1",
    name: "Laptop Pro 15",
    description: "High-performance laptop with 16GB RAM and 512GB SSD",
    category: "Electronics",
    quantity: 25,
    price: 1299.99,
    sku: "LAP-PRO-15-001",
    status: "in_stock",
    createdAt: "2024-01-15T10:00:00Z",
    updatedAt: "2024-01-28T14:30:00Z",
  },
  {
    id: "2",
    name: "Wireless Mouse",
    description: "Ergonomic wireless mouse with 2-year battery life",
    category: "Accessories",
    quantity: 150,
    price: 29.99,
    sku: "ACC-MOU-WL-001",
    status: "in_stock",
    createdAt: "2024-01-10T09:00:00Z",
    updatedAt: "2024-01-27T11:20:00Z",
  },
  {
    id: "3",
    name: "Mechanical Keyboard",
    description: "RGB mechanical keyboard with Cherry MX switches",
    category: "Accessories",
    quantity: 5,
    price: 149.99,
    sku: "ACC-KEY-MECH-001",
    status: "low_stock",
    createdAt: "2024-01-12T08:00:00Z",
    updatedAt: "2024-01-29T09:15:00Z",
  },
  {
    id: "4",
    name: '4K Monitor 27"',
    description: "27-inch 4K UHD monitor with HDR support",
    category: "Electronics",
    quantity: 0,
    price: 399.99,
    sku: "MON-4K-27-001",
    status: "out_of_stock",
    createdAt: "2024-01-08T10:00:00Z",
    updatedAt: "2024-01-25T16:45:00Z",
  },
  {
    id: "5",
    name: "USB-C Hub",
    description: "7-in-1 USB-C hub with HDMI, USB 3.0, and SD card reader",
    category: "Accessories",
    quantity: 45,
    price: 49.99,
    sku: "ACC-HUB-USB-C-001",
    status: "in_stock",
    createdAt: "2024-01-14T11:00:00Z",
    updatedAt: "2024-01-28T10:30:00Z",
  },
  {
    id: "6",
    name: "Webcam HD",
    description: "1080p HD webcam with built-in microphone",
    category: "Electronics",
    quantity: 8,
    price: 79.99,
    sku: "CAM-WEB-HD-001",
    status: "low_stock",
    createdAt: "2024-01-11T09:30:00Z",
    updatedAt: "2024-01-29T08:20:00Z",
  },
  {
    id: "7",
    name: "Desk Stand",
    description: "Adjustable laptop desk stand with ventilation",
    category: "Accessories",
    quantity: 30,
    price: 39.99,
    sku: "ACC-STD-DSK-001",
    status: "in_stock",
    createdAt: "2024-01-13T10:15:00Z",
    updatedAt: "2024-01-27T15:00:00Z",
  },
  {
    id: "8",
    name: "Noise-Cancelling Headphones",
    description: "Premium wireless headphones with active noise cancellation",
    category: "Electronics",
    quantity: 12,
    price: 249.99,
    sku: "AUD-HED-NC-001",
    status: "in_stock",
    createdAt: "2024-01-09T08:45:00Z",
    updatedAt: "2024-01-26T12:10:00Z",
  },
];

// Mock Orders Data
export const mockOrders: Order[] = [
  {
    id: "1",
    orderNumber: "ORD-2024-001",
    customerName: "John Doe",
    customerEmail: "john.doe@example.com",
    items: [
      {
        id: "1",
        inventoryId: "1",
        name: "Laptop Pro 15",
        quantity: 1,
        price: 1299.99,
        subtotal: 1299.99,
      },
      {
        id: "2",
        inventoryId: "2",
        name: "Wireless Mouse",
        quantity: 2,
        price: 29.99,
        subtotal: 59.98,
      },
    ],
    total: 1359.97,
    status: "processing",
    createdAt: "2024-01-28T10:30:00Z",
    shippingAddress: "123 Main St, City, State 12345",
    paymentMethod: "Credit Card",
  },
  {
    id: "2",
    orderNumber: "ORD-2024-002",
    customerName: "Jane Smith",
    customerEmail: "jane.smith@example.com",
    items: [
      {
        id: "3",
        inventoryId: "3",
        name: "Mechanical Keyboard",
        quantity: 1,
        price: 149.99,
        subtotal: 149.99,
      },
      {
        id: "4",
        inventoryId: "5",
        name: "USB-C Hub",
        quantity: 1,
        price: 49.99,
        subtotal: 49.99,
      },
    ],
    total: 199.98,
    status: "shipped",
    createdAt: "2024-01-27T14:20:00Z",
    shippingAddress: "456 Oak Ave, City, State 67890",
    paymentMethod: "PayPal",
  },
  {
    id: "3",
    orderNumber: "ORD-2024-003",
    customerName: "Bob Johnson",
    customerEmail: "bob.johnson@example.com",
    items: [
      {
        id: "5",
        inventoryId: "8",
        name: "Noise-Cancelling Headphones",
        quantity: 1,
        price: 249.99,
        subtotal: 249.99,
      },
    ],
    total: 249.99,
    status: "delivered",
    createdAt: "2024-01-25T09:15:00Z",
    shippingAddress: "789 Pine Rd, City, State 54321",
    paymentMethod: "Credit Card",
  },
  {
    id: "4",
    orderNumber: "ORD-2024-004",
    customerName: "Alice Williams",
    customerEmail: "alice.williams@example.com",
    items: [
      {
        id: "6",
        inventoryId: "6",
        name: "Webcam HD",
        quantity: 2,
        price: 79.99,
        subtotal: 159.98,
      },
      {
        id: "7",
        inventoryId: "7",
        name: "Desk Stand",
        quantity: 1,
        price: 39.99,
        subtotal: 39.99,
      },
    ],
    total: 199.97,
    status: "pending",
    createdAt: "2024-01-29T11:00:00Z",
    shippingAddress: "321 Elm St, City, State 98765",
    paymentMethod: "Credit Card",
  },
  {
    id: "5",
    orderNumber: "ORD-2024-005",
    customerName: "Charlie Brown",
    customerEmail: "charlie.brown@example.com",
    items: [
      {
        id: "8",
        inventoryId: "2",
        name: "Wireless Mouse",
        quantity: 5,
        price: 29.99,
        subtotal: 149.95,
      },
    ],
    total: 149.95,
    status: "cancelled",
    createdAt: "2024-01-24T16:45:00Z",
    shippingAddress: "654 Maple Dr, City, State 11223",
    paymentMethod: "Credit Card",
  },
];

// Helper functions
export function getInventoryById(id: string): InventoryItem | undefined {
  return mockInventory.find((item) => item.id === id);
}

export function getOrderById(id: string): Order | undefined {
  return mockOrders.find((order) => order.id === id);
}

export function getStatusColor(status: string): string {
  switch (status) {
    case "in_stock":
    case "delivered":
      return "default";
    case "low_stock":
    case "processing":
      return "secondary";
    case "out_of_stock":
    case "cancelled":
      return "destructive";
    case "pending":
      return "outline";
    case "shipped":
      return "default";
    default:
      return "outline";
  }
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
