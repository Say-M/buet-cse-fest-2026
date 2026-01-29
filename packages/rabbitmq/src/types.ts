/** @format */

import type { Channel, Connection, ConsumeMessage } from "amqplib";

export interface RabbitMQConfig {
  url: string;
  exchange?: string;
  exchangeType?: "direct" | "topic" | "fanout" | "headers";
  prefetch?: number;
}

export interface PublishOptions {
  routingKey: string;
  persistent?: boolean;
  headers?: Record<string, string>;
  correlationId?: string;
  messageId?: string;
}

export interface ConsumeOptions {
  queue: string;
  routingKey?: string;
  noAck?: boolean;
}

export interface MessageHandler<T = unknown> {
  (message: T, raw: ConsumeMessage): Promise<void> | void;
}

export interface RabbitMQClient {
  connection: Connection | null;
  channel: Channel | null;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  publish<T>(data: T, options: PublishOptions): Promise<boolean>;
  consume<T>(
    options: ConsumeOptions,
    handler: MessageHandler<T>,
  ): Promise<string>;
  ack(message: ConsumeMessage): void;
  nack(message: ConsumeMessage, requeue?: boolean): void;
  isConnected(): boolean;
}

export interface OutboxEvent {
  eventId: string;
  eventType: string;
  payload: unknown;
  createdAt: Date;
}

export const EXCHANGES = {
  ORDERS: "orders.exchange",
} as const;

export const QUEUES = {
  INVENTORY_UPDATES: "inventory.updates",
  ORDER_EVENTS: "order.events",
  NOTIFICATIONS: "notifications_queue",
  PAYMENTS: "payments_queue",
  ANALYTICS: "analytics_queue",
} as const;

export const ROUTING_KEYS = {
  ORDER_CREATED: "order.created",
  ORDER_SHIPPED: "order.shipped",
  INVENTORY_RESERVE: "inventory.reserve",
  INVENTORY_RELEASE: "inventory.release",
} as const;
