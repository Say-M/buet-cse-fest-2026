import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import useApi from "../use-api";
import { toast } from "sonner";
import { AxiosError } from "axios";
import type { CreateInventoryBackendSchemaType } from "@/schemas/inventory";

// Types based on backend responses
export interface InventoryItem {
  productId: string;
  productName: string;
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  price: number;
  updatedAt: string;
}

export interface ReserveStockPayload {
  quantity: number;
}

export interface ReserveStockResponse {
  success: boolean;
  productId: string;
  reservedQuantity: number;
  remainingStock: number;
  message: string;
}

// Get all inventory items
export const useGetAllInventory = () => {
  const api = useApi();
  return useQuery<InventoryItem[]>({
    queryKey: ["inventory", "all"],
    queryFn: async () => {
      const { data } = await api.get("/inventory");
      return data;
    },
  });
};

// Get inventory by product ID
export const useGetInventoryByProductId = (productId: string) => {
  const api = useApi();
  return useQuery<InventoryItem>({
    queryKey: ["inventory", productId],
    queryFn: async () => {
      const { data } = await api.get(`/inventory/${productId}`);
      return data;
    },
    enabled: !!productId,
  });
};

// Create inventory item
export const useCreateInventory = () => {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateInventoryBackendSchemaType) => {
      const { data } = await api.post("/inventory", payload);
      return data;
    },
    onSuccess: (data) => {
      toast.success("Inventory item created successfully");
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (error: AxiosError<{ error: string }>) => {
      toast.error(
        error.response?.data?.error || "Failed to create inventory item",
      );
    },
  });
};

// Reserve stock for an order
export const useReserveStock = () => {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      productId,
      quantity,
    }: {
      productId: string;
      quantity: number;
    }) => {
      const { data } = await api.post<ReserveStockResponse>(
        `/inventory/${productId}/reserve`,
        { quantity },
      );
      return data;
    },
    onSuccess: (data, variables) => {
      if (data.success) {
        toast.success(data.message);
        queryClient.invalidateQueries({
          queryKey: ["inventory", variables.productId],
        });
        queryClient.invalidateQueries({ queryKey: ["inventory", "all"] });
      } else {
        toast.error(data.message);
      }
    },
    onError: (error: AxiosError<{ message: string }>) => {
      toast.error(error.response?.data?.message || "Failed to reserve stock");
    },
  });
};

// Release reserved stock
export const useReleaseStock = () => {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      productId,
      quantity,
    }: {
      productId: string;
      quantity: number;
    }) => {
      const { data } = await api.post<ReserveStockResponse>(
        `/inventory/${productId}/release`,
        { quantity },
      );
      return data;
    },
    onSuccess: (data, variables) => {
      if (data.success) {
        toast.success(data.message);
        queryClient.invalidateQueries({
          queryKey: ["inventory", variables.productId],
        });
        queryClient.invalidateQueries({ queryKey: ["inventory", "all"] });
      } else {
        toast.error(data.message);
      }
    },
    onError: (error: AxiosError<{ message: string }>) => {
      toast.error(error.response?.data?.message || "Failed to release stock");
    },
  });
};
