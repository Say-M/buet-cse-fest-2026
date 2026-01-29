export {
  createRabbitMQClient,
  getSharedClient,
  resetSharedClient,
} from "./connection";

export type {
  RabbitMQConfig,
  RabbitMQClient,
  PublishOptions,
  ConsumeOptions,
  MessageHandler,
  OutboxEvent,
} from "./types";

export { EXCHANGES, QUEUES, ROUTING_KEYS } from "./types";
