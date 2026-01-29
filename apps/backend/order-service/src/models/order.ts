import mongoose, { Schema, Document } from "mongoose";

export interface IOrderItem {
  productId: string;
  quantity: number;
  price: number;
}

export interface IOrder extends Document {
  orderId: string;
  customerId: string;
  customerName?: string;
  customerEmail?: string;
  shippingAddress?: string;
  paymentMethod?: string;
  items: IOrderItem[];
  totalAmount: number;
  status: "pending" | "confirmed" | "shipped" | "failed" | "cancelled";
  inventoryStatus: "pending" | "reserved" | "confirmed" | "failed" | "released";
  createdAt: Date;
  updatedAt: Date;
}

const orderItemSchema = new Schema<IOrderItem>(
  {
    productId: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const orderSchema = new Schema<IOrder>(
  {
    orderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    customerId: {
      type: String,
      required: true,
      index: true,
    },
    items: {
      type: [orderItemSchema],
      required: true,
      validate: [
        (val: IOrderItem[]) => val.length > 0,
        "At least one item is required",
      ],
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    customerName: {
      type: String,
    },
    customerEmail: {
      type: String,
    },
    shippingAddress: {
      type: String,
    },
    paymentMethod: {
      type: String,
    },
    status: {
      type: String,
      required: true,
      enum: ["pending", "confirmed", "shipped", "failed", "cancelled"],
      default: "pending",
      index: true,
    },
    inventoryStatus: {
      type: String,
      required: true,
      enum: ["pending", "reserved", "confirmed", "failed", "released"],
      default: "pending",
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

// Compound index for common queries
orderSchema.index({ customerId: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ inventoryStatus: 1, createdAt: -1 });

export const Order = mongoose.model<IOrder>("Order", orderSchema);
