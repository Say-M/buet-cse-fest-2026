/** @format */

import {
  createRabbitMQClient,
  QUEUES,
  ROUTING_KEYS,
  EXCHANGES,
  type RabbitMQClient,
} from "@repo/rabbitmq";
import { inventoryService } from "../services/inventory.service";

interface OrderEvent {
  eventId: string;
  eventType: string;
  payload: {
    orderId: string;
    items: Array<{
      productId: string;
      quantity: number;
    }>;
  };
  createdAt: string;
}

let rabbitClient: RabbitMQClient | null = null;

export async function startOrderConsumer(): Promise<void> {
  const rabbitmqUrl = process.env.RABBITMQ_URL || "amqp://localhost:5672";

  rabbitClient = createRabbitMQClient({
    url: rabbitmqUrl,
    exchange: EXCHANGES.ORDERS,
    exchangeType: "topic",
  });

  try {
    await rabbitClient.connect();

    // Consume order created events
    await rabbitClient.consume<OrderEvent>(
      {
        queue: QUEUES.INVENTORY_UPDATES,
        routingKey: ROUTING_KEYS.ORDER_CREATED,
        noAck: false,
      },
      async (event, raw) => {
        console.log(`[OrderConsumer] Received event: ${event.eventType}`, {
          eventId: event.eventId,
          orderId: event.payload.orderId,
        });

        await handleOrderCreated(event);
      },
    );

    // Consume order shipped events
    await rabbitClient.consume<OrderEvent>(
      {
        queue: QUEUES.INVENTORY_UPDATES,
        routingKey: ROUTING_KEYS.ORDER_SHIPPED,
        noAck: false,
      },
      async (event, raw) => {
        console.log(`[OrderConsumer] Received event: ${event.eventType}`, {
          eventId: event.eventId,
          orderId: event.payload.orderId,
        });

        await handleOrderShipped(event);
      },
    );

    console.log("[OrderConsumer] Started consuming order events");
  } catch (error) {
    console.error("[OrderConsumer] Failed to start consumer:", error);
    throw error;
  }
}

async function handleOrderCreated(event: OrderEvent): Promise<void> {
  const { processed } = await inventoryService.processEventIdempotently(
    event.eventId,
    async () => {
      // Reserve stock for each item in the order
      for (const item of event.payload.items) {
        const result = await inventoryService.reserveStock(
          item.productId,
          item.quantity,
        );

        if (!result.success) {
          console.error(
            `[OrderConsumer] Failed to reserve stock for ${item.productId}:`,
            result.message,
          );
          // In a real system, you might want to:
          // 1. Publish a compensation event
          // 2. Rollback previous reservations
          // 3. Notify the order service
        } else {
          console.log(
            `[OrderConsumer] Reserved ${item.quantity} units of ${item.productId}`,
          );
        }
      }

      return { orderId: event.payload.orderId, status: "reserved" };
    },
  );

  if (!processed) {
    console.log(`[OrderConsumer] Event ${event.eventId} was already processed`);
  }
}

async function handleOrderShipped(event: OrderEvent): Promise<void> {
  const { processed } = await inventoryService.processEventIdempotently(
    event.eventId,
    async () => {
      // Confirm stock deduction for each item
      for (const item of event.payload.items) {
        const result = await inventoryService.confirmStockDeduction(
          item.productId,
          item.quantity,
        );

        if (!result.success) {
          console.error(
            `[OrderConsumer] Failed to confirm deduction for ${item.productId}:`,
            result.message,
          );
        } else {
          console.log(
            `[OrderConsumer] Confirmed deduction of ${item.quantity} units from ${item.productId}`,
          );
        }
      }

      return { orderId: event.payload.orderId, status: "deducted" };
    },
  );

  if (!processed) {
    console.log(`[OrderConsumer] Event ${event.eventId} was already processed`);
  }
}

export async function stopOrderConsumer(): Promise<void> {
  if (rabbitClient) {
    await rabbitClient.disconnect();
    rabbitClient = null;
    console.log("[OrderConsumer] Stopped");
  }
}

export function isConsumerConnected(): boolean {
  return rabbitClient?.isConnected() ?? false;
}
