/** @format */

import { Hono } from "hono";
import { stats } from "../app";

const payment = new Hono();

// Mock payment processing endpoint
payment.post("/process", async (c) => {
  const body = await c.req.json();
  const { orderId, amount } = body;

  // Simulate payment processing delay (500-1000ms)
  const delay = Math.floor(Math.random() * 500) + 500;
  await new Promise((resolve) => setTimeout(resolve, delay));

  // Always succeed for demo
  console.log(`[Payment] Payment processed for order ${orderId}: $${amount} - SUCCESS`);

  stats.totalPayments++;
  stats.successfulPayments++;
  stats.totalAmount += amount || 0;

  return c.json({
    success: true,
    orderId,
    transactionId: `TXN-${Date.now()}`,
    amount,
    status: "SUCCESS",
    timestamp: new Date().toISOString(),
  });
});

export default payment;
