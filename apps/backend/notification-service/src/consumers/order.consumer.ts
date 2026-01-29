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
    customerEmail?: string;
    customerName?: string;
    totalAmount?: number;
    items?: Array<{
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
        queue: QUEUES.NOTIFICATIONS,
        routingKey: ROUTING_KEYS.ORDER_CREATED,
        noAck: false,
      },
      async (event, raw) => {
        console.log(`[Notification] Received ORDER_CREATED event`, {
          eventId: event.eventId,
          orderId: event.payload.orderId,
        });

        await handleOrderCreated(event);
      },
    );

    // Consume order shipped events
    await rabbitClient.consume<OrderEvent>(
      {
        queue: QUEUES.NOTIFICATIONS,
        routingKey: ROUTING_KEYS.ORDER_SHIPPED,
        noAck: false,
      },
      async (event, raw) => {
        console.log(`[Notification] Received ORDER_SHIPPED event`, {
          eventId: event.eventId,
          orderId: event.payload.orderId,
        });

        await handleOrderShipped(event);
      },
    );

    console.log("[Notification] Started consuming order events");
  } catch (error) {
    console.error("[Notification] Failed to start consumer:", error);
    throw error;
  }
}

async function handleOrderCreated(event: OrderEvent): Promise<void> {
  const { orderId, customerEmail, customerName } = event.payload;

  // Simulate sending email notification
  console.log(
    `[Notification] 📧 Email sent to ${customerEmail || "customer@example.com"} for order ${orderId}`,
  );
  console.log(
    `[Notification] Subject: Order Confirmation - ${orderId}`,
  );
  console.log(
    `[Notification] Body: Dear ${customerName || "Customer"}, your order has been confirmed!`,
  );

  stats.totalNotifications++;
  stats.emailsSent++;
}

async function handleOrderShipped(event: OrderEvent): Promise<void> {
  const { orderId, customerEmail, customerName } = event.payload;

  // Simulate sending shipping notification
  console.log(
    `[Notification] 📦 Shipping notification sent to ${customerEmail || "customer@example.com"} for order ${orderId}`,
  );
  console.log(
    `[Notification] Subject: Order Shipped - ${orderId}`,
  );
  console.log(
    `[Notification] Body: Dear ${customerName || "Customer"}, your order has been shipped!`,
  );

  stats.totalNotifications++;
  stats.emailsSent++;
}

export async function stopOrderConsumer(): Promise<void> {
  if (rabbitClient) {
    await rabbitClient.disconnect();
    rabbitClient = null;
    console.log("[Notification] Consumer stopped");
  }
}

export function isConsumerConnected(): boolean {
  return rabbitClient?.isConnected() ?? false;
}
