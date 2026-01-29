/** @format */

import {
  createRabbitMQClient,
  QUEUES,
  ROUTING_KEYS,
  EXCHANGES,
  type RabbitMQClient,
} from "@repo/rabbitmq";
import { stats } from "../app";

interface OrderEvent {
  eventId: string;
  eventType: string;
  payload: {
    orderId: string;
    customerId?: string;
    totalAmount?: number;
    items?: Array<{
      productId: string;
      quantity: number;
      price: number;
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
        queue: QUEUES.PAYMENTS,
        routingKey: ROUTING_KEYS.ORDER_CREATED,
        noAck: false,
      },
      async (event, raw) => {
        console.log(`[Payment] Received ORDER_CREATED event`, {
          eventId: event.eventId,
          orderId: event.payload.orderId,
        });

        await handleOrderCreated(event);
      },
    );

    console.log("[Payment] Started consuming order events");
  } catch (error) {
    console.error("[Payment] Failed to start consumer:", error);
    throw error;
  }
}

async function handleOrderCreated(event: OrderEvent): Promise<void> {
  const { orderId, totalAmount } = event.payload;

  // Simulate payment processing (500-1000ms delay)
  const delay = Math.floor(Math.random() * 500) + 500;
  await new Promise((resolve) => setTimeout(resolve, delay));

  // Always succeed for demo
  console.log(
    `[Payment] 💳 Payment processed for order ${orderId}: $${totalAmount || 0} - SUCCESS`,
  );

  stats.totalPayments++;
  stats.successfulPayments++;
  stats.totalAmount += totalAmount || 0;
}

export async function stopOrderConsumer(): Promise<void> {
  if (rabbitClient) {
    await rabbitClient.disconnect();
    rabbitClient = null;
    console.log("[Payment] Consumer stopped");
  }
}

export function isConsumerConnected(): boolean {
  return rabbitClient?.isConnected() ?? false;
}
