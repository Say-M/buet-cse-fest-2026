import {
  createRabbitMQClient,
  QUEUES,
  ROUTING_KEYS,
  EXCHANGES,
  type RabbitMQClient,
} from "@repo/rabbitmq";
import { analyticsService } from "../services/analytics.service";

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
      price?: number;
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
        queue: QUEUES.ANALYTICS,
        routingKey: ROUTING_KEYS.ORDER_CREATED,
        noAck: false,
      },
      async (event, raw) => {
        console.log(`[Analytics] Received ORDER_CREATED event`, {
          eventId: event.eventId,
          orderId: event.payload.orderId,
        });

        await handleOrderCreated(event);
      },
    );

    // Consume order shipped events
    await rabbitClient.consume<OrderEvent>(
      {
        queue: QUEUES.ANALYTICS,
        routingKey: ROUTING_KEYS.ORDER_SHIPPED,
        noAck: false,
      },
      async (event, raw) => {
        console.log(`[Analytics] Received ORDER_SHIPPED event`, {
          eventId: event.eventId,
          orderId: event.payload.orderId,
        });

        await handleOrderShipped(event);
      },
    );

    console.log("[Analytics] Started consuming order events");
  } catch (error) {
    console.error("[Analytics] Failed to start consumer:", error);
    throw error;
  }
}

async function handleOrderCreated(event: OrderEvent): Promise<void> {
  const { orderId, totalAmount, items } = event.payload;

  analyticsService.recordOrderCreated(
    orderId,
    totalAmount || 0,
    items,
  );
}

async function handleOrderShipped(event: OrderEvent): Promise<void> {
  const { orderId } = event.payload;

  analyticsService.recordOrderShipped(orderId);
}

export async function stopOrderConsumer(): Promise<void> {
  if (rabbitClient) {
    await rabbitClient.disconnect();
    rabbitClient = null;
    console.log("[Analytics] Consumer stopped");
  }
}

export function isConsumerConnected(): boolean {
  return rabbitClient?.isConnected() ?? false;
}
