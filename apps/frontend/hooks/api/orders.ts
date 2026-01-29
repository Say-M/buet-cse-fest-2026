import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import useApi from "../use-api";
import { toast } from "sonner";
import { AxiosError } from "axios";

// Types based on backend responses
export interface OrderItem {
  productId: string;
  quantity: number;
}

export interface Order {
  orderId: string;
  customerId: string;
  items: OrderItem[];
  totalAmount: number;
  status: "pending" | "confirmed" | "shipped" | "delivered" | "cancelled";
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrderPayload {
  customerId: string;
  items: OrderItem[];
  idempotencyKey?: string;
  customerName?: string;
  customerEmail?: string;
  shippingAddress?: string;
  paymentMethod?: string;
}

export interface CreateOrderResponse {
  orderId: string;
  status: "pending" | "confirmed" | "failed";
  message: string;
}

export interface OrderActionResponse {
  orderId: string;
  status: string;
  message: string;
}

// Get all orders
export const useGetAllOrders = (limit: number = 10, skip: number = 0) => {
  const api = useApi();
  return useQuery<Order[]>({
    queryKey: ["orders", "all", limit, skip],
    queryFn: async () => {
      const { data } = await api.get(`/orders?limit=${limit}&skip=${skip}`);
      return data;
    },
  });
};

// Get order by ID
export const useGetOrderById = (orderId: string) => {
  const api = useApi();
  return useQuery<Order>({
    queryKey: ["orders", orderId],
    queryFn: async () => {
      const { data } = await api.get(`/orders/${orderId}`);
      return data;
    },
    enabled: !!orderId,
  });
};

// Create order
export const useCreateOrder = () => {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateOrderPayload) => {
      const headers: Record<string, string> = {};
      if (payload.idempotencyKey) {
        headers["X-Idempotency-Key"] = payload.idempotencyKey;
      }
      const { data } = await api.post<CreateOrderResponse>("/orders", payload, {
        headers,
      });
      return data;
    },
    onSuccess: (data) => {
      if (data.status !== "failed") {
        toast.success(data.message);
        queryClient.invalidateQueries({ queryKey: ["orders"] });
      } else {
        toast.error(data.message);
      }
    },
    onError: (error: AxiosError<{ message: string }>) => {
      toast.error(error.response?.data?.message || "Failed to create order");
    },
  });
};

// Ship order
export const useShipOrder = () => {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderId: string) => {
      const { data } = await api.post<OrderActionResponse>(
        `/orders/${orderId}/ship`,
      );
      return data;
    },
    onSuccess: (data, orderId) => {
      if (data.status !== "failed") {
        toast.success(data.message);
        queryClient.invalidateQueries({ queryKey: ["orders", orderId] });
        queryClient.invalidateQueries({ queryKey: ["orders", "all"] });
      } else {
        toast.error(data.message);
      }
    },
    onError: (error: AxiosError<{ message: string }>) => {
      toast.error(error.response?.data?.message || "Failed to ship order");
    },
  });
};

// Cancel order
export const useCancelOrder = () => {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderId: string) => {
      const { data } = await api.post<OrderActionResponse>(
        `/orders/${orderId}/cancel`,
      );
      return data;
    },
    onSuccess: (data, orderId) => {
      if (data.status !== "failed") {
        toast.success(data.message);
        queryClient.invalidateQueries({ queryKey: ["orders", orderId] });
        queryClient.invalidateQueries({ queryKey: ["orders", "all"] });
      } else {
        toast.error(data.message);
      }
    },
    onError: (error: AxiosError<{ message: string }>) => {
      toast.error(error.response?.data?.message || "Failed to cancel order");
    },
  });
};
