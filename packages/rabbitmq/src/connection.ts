import amqplib, {
  type Channel,
  type Connection,
  type ConsumeMessage,
} from "amqplib";
import type {
  RabbitMQConfig,
  RabbitMQClient,
  PublishOptions,
  ConsumeOptions,
  MessageHandler,
} from "./types";

const DEFAULT_CONFIG: Partial<RabbitMQConfig> = {
  exchange: "default.exchange",
  exchangeType: "topic",
  prefetch: 10,
};

export function createRabbitMQClient(config: RabbitMQConfig): RabbitMQClient {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  let connection: Connection | null = null;
  let channel: Channel | null = null;
  let isConnecting = false;

  async function connect(): Promise<void> {
    if (connection && channel) {
      return;
    }

    if (isConnecting) {
      // Wait for ongoing connection attempt
      await new Promise<void>((resolve) => {
        const checkInterval = setInterval(() => {
          if (!isConnecting) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
      });
      return;
    }

    isConnecting = true;

    try {
      connection = await amqplib.connect(mergedConfig.url);
      channel = await connection.createChannel();

      // Set prefetch for fair dispatch
      await channel.prefetch(mergedConfig.prefetch!);

      // Declare the exchange
      await channel.assertExchange(
        mergedConfig.exchange!,
        mergedConfig.exchangeType!,
        { durable: true },
      );

      // Handle connection close
      connection.on("close", () => {
        console.log("[RabbitMQ] Connection closed");
        connection = null;
        channel = null;
      });

      connection.on("error", (err) => {
        console.error("[RabbitMQ] Connection error:", err.message);
      });

      channel.on("close", () => {
        console.log("[RabbitMQ] Channel closed");
        channel = null;
      });

      channel.on("error", (err) => {
        console.error("[RabbitMQ] Channel error:", err.message);
      });

      console.log("[RabbitMQ] Connected successfully");
    } finally {
      isConnecting = false;
    }
  }

  async function disconnect(): Promise<void> {
    try {
      if (channel) {
        await channel.close();
        channel = null;
      }
      if (connection) {
        await connection.close();
        connection = null;
      }
      console.log("[RabbitMQ] Disconnected");
    } catch (err) {
      console.error("[RabbitMQ] Error during disconnect:", err);
    }
  }

  async function publish<T>(
    data: T,
    options: PublishOptions,
  ): Promise<boolean> {
    if (!channel) {
      throw new Error(
        "RabbitMQ channel not initialized. Call connect() first.",
      );
    }

    const message = Buffer.from(JSON.stringify(data));
    const publishOptions: amqplib.Options.Publish = {
      persistent: options.persistent ?? true,
      headers: options.headers,
      correlationId: options.correlationId,
      messageId: options.messageId,
      contentType: "application/json",
      timestamp: Date.now(),
    };

    return channel.publish(
      mergedConfig.exchange!,
      options.routingKey,
      message,
      publishOptions,
    );
  }

  async function consume<T>(
    options: ConsumeOptions,
    handler: MessageHandler<T>,
  ): Promise<string> {
    if (!channel) {
      throw new Error(
        "RabbitMQ channel not initialized. Call connect() first.",
      );
    }

    // Assert queue exists
    await channel.assertQueue(options.queue, { durable: true });

    // Bind queue to exchange with routing key
    if (options.routingKey) {
      await channel.bindQueue(
        options.queue,
        mergedConfig.exchange!,
        options.routingKey,
      );
    }

    const { consumerTag } = await channel.consume(
      options.queue,
      async (msg) => {
        if (!msg) return;

        try {
          const data = JSON.parse(msg.content.toString()) as T;
          await handler(data, msg);

          if (!options.noAck) {
            channel?.ack(msg);
          }
        } catch (err) {
          console.error("[RabbitMQ] Error processing message:", err);
          // Reject and don't requeue to avoid infinite loops
          if (!options.noAck) {
            channel?.nack(msg, false, false);
          }
        }
      },
      { noAck: options.noAck ?? false },
    );

    console.log(`[RabbitMQ] Started consuming from queue: ${options.queue}`);
    return consumerTag;
  }

  function ack(message: ConsumeMessage): void {
    if (!channel) {
      throw new Error("RabbitMQ channel not initialized");
    }
    channel.ack(message);
  }

  function nack(message: ConsumeMessage, requeue = false): void {
    if (!channel) {
      throw new Error("RabbitMQ channel not initialized");
    }
    channel.nack(message, false, requeue);
  }

  function isConnected(): boolean {
    return connection !== null && channel !== null;
  }

  return {
    get connection() {
      return connection;
    },
    get channel() {
      return channel;
    },
    connect,
    disconnect,
    publish,
    consume,
    ack,
    nack,
    isConnected,
  };
}

// Singleton instance for shared use
let sharedClient: RabbitMQClient | null = null;

export function getSharedClient(config?: RabbitMQConfig): RabbitMQClient {
  if (!sharedClient) {
    if (!config) {
      throw new Error("RabbitMQ config required for first initialization");
    }
    sharedClient = createRabbitMQClient(config);
  }
  return sharedClient;
}

export function resetSharedClient(): void {
  if (sharedClient) {
    sharedClient.disconnect();
    sharedClient = null;
  }
}
