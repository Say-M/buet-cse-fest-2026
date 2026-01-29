"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { type InventoryItem } from "@/lib/mock-data";
import { toast } from "sonner";

export interface CartItem extends InventoryItem {
  cartQuantity: number;
}

interface CartContextType {
  items: CartItem[];
  addItem: (item: InventoryItem, quantity?: number) => void;
  removeItem: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  clearCart: () => void;
  getTotalPrice: () => number;
  getTotalItems: () => number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const addItem = useCallback((item: InventoryItem, quantity: number = 1) => {
    setItems((prevItems) => {
      const existingItem = prevItems.find((i) => i.id === item.id);

      if (existingItem) {
        const newQuantity = existingItem.cartQuantity + quantity;
        if (newQuantity > item.quantity) {
          toast.error(`Only ${item.quantity} items available in stock`);
          return prevItems;
        }
        return prevItems.map((i) =>
          i.id === item.id ? { ...i, cartQuantity: newQuantity } : i,
        );
      }

      if (quantity > item.quantity) {
        toast.error(`Only ${item.quantity} items available in stock`);
        return prevItems;
      }

      toast.success(`${item.name} added to cart`);
      return [...prevItems, { ...item, cartQuantity: quantity }];
    });
  }, []);

  const removeItem = useCallback((itemId: string) => {
    setItems((prevItems) => {
      const item = prevItems.find((i) => i.id === itemId);
      if (item) {
        toast.success(`${item.name} removed from cart`);
      }
      return prevItems.filter((i) => i.id !== itemId);
    });
  }, []);

  const updateQuantity = useCallback((itemId: string, quantity: number) => {
    setItems((prevItems) => {
      const item = prevItems.find((i) => i.id === itemId);
      if (!item) return prevItems;

      if (quantity > item.quantity) {
        toast.error(`Only ${item.quantity} items available in stock`);
        return prevItems;
      }

      if (quantity <= 0) {
        return prevItems.filter((i) => i.id !== itemId);
      }

      return prevItems.map((i) =>
        i.id === itemId ? { ...i, cartQuantity: quantity } : i,
      );
    });
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    toast.success("Cart cleared");
  }, []);

  const getTotalPrice = useCallback(() => {
    return items.reduce(
      (total, item) => total + item.price * item.cartQuantity,
      0,
    );
  }, [items]);

  const getTotalItems = useCallback(() => {
    return items.reduce((total, item) => total + item.cartQuantity, 0);
  }, [items]);

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        getTotalPrice,
        getTotalItems,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
