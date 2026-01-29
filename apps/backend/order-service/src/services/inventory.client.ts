import {
  CircuitBreaker,
  CircuitBreakerOpenError,
  CircuitBreakerTimeoutError,
  type CircuitState,
} from "../lib/circuit-breaker";

interface ReserveStockResponse {
  success: boolean;
  productId: string;
  reservedQuantity: number;
  remainingStock: number;
  message: string;
}

interface InventoryItem {
  productId: string;
  productName: string;
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  price: number;
}

export interface InventoryCheckResult {
  success: boolean;
  available: boolean;
  message: string;
  item?: InventoryItem;
}

export interface ReserveResult {
  success: boolean;
  message: string;
  circuitState: CircuitState;
}

const INVENTORY_SERVICE_URL =
  process.env.INVENTORY_SERVICE_URL || "http://localhost:3002";

// Create circuit breaker for inventory service
const inventoryCircuitBreaker = new CircuitBreaker("inventory-service", {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 2000, // 2 second timeout
  resetTimeout: 30000, // 30 seconds before trying again
});

/**
 * Check if a product has sufficient stock
 */
export async function checkInventory(
  productId: string,
  quantity: number,
): Promise<InventoryCheckResult> {
  try {
    const result = await inventoryCircuitBreaker.execute(async () => {
      const response = await fetch(
        `${INVENTORY_SERVICE_URL}/inventory/${productId}`,
      );

      if (!response.ok) {
        if (response.status === 404) {
          return {
            success: true,
            available: false,
            message: `Product ${productId} not found`,
          };
        }
        throw new Error(`Inventory service returned ${response.status}`);
      }

      const item: InventoryItem = await response.json();
      const available = item.availableQuantity >= quantity;

      return {
        success: true,
        available,
        message: available
          ? "Stock available"
          : `Insufficient stock. Available: ${item.availableQuantity}, Requested: ${quantity}`,
        item,
      };
    });

    return result;
  } catch (error) {
    if (error instanceof CircuitBreakerOpenError) {
      return {
        success: false,
        available: false,
        message: "Inventory service unavailable (circuit breaker open)",
      };
    }

    if (error instanceof CircuitBreakerTimeoutError) {
      return {
        success: false,
        available: false,
        message: "Inventory service timed out",
      };
    }

    return {
      success: false,
      available: false,
      message: `Failed to check inventory: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Reserve stock for an order (sync call with circuit breaker)
 */
export async function reserveStock(
  productId: string,
  quantity: number,
): Promise<ReserveResult> {
  const circuitState = inventoryCircuitBreaker.getState();

  try {
    await inventoryCircuitBreaker.execute(async () => {
      const response = await fetch(
        `${INVENTORY_SERVICE_URL}/inventory/${productId}/reserve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quantity }),
        },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.message || `Reserve failed with status ${response.status}`,
        );
      }

      const result: ReserveStockResponse = await response.json();
      if (!result.success) {
        throw new Error(result.message);
      }

      return result;
    });

    return {
      success: true,
      message: "Stock reserved successfully",
      circuitState: inventoryCircuitBreaker.getState(),
    };
  } catch (error) {
    if (error instanceof CircuitBreakerOpenError) {
      return {
        success: false,
        message:
          "Inventory service unavailable (circuit breaker open). Please try again later.",
        circuitState: "OPEN",
      };
    }

    if (error instanceof CircuitBreakerTimeoutError) {
      return {
        success: false,
        message: "Inventory service timed out. Please try again.",
        circuitState: inventoryCircuitBreaker.getState(),
      };
    }

    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Failed to reserve stock",
      circuitState: inventoryCircuitBreaker.getState(),
    };
  }
}

/**
 * Get circuit breaker state and statistics
 */
export function getCircuitBreakerStats() {
  return inventoryCircuitBreaker.getStats();
}

/**
 * Get current circuit breaker state
 */
export function getCircuitState(): CircuitState {
  return inventoryCircuitBreaker.getState();
}

/**
 * Health check for inventory service
 */
export async function checkInventoryServiceHealth(): Promise<{
  healthy: boolean;
  circuitState: CircuitState;
  error?: string;
}> {
  const circuitState = inventoryCircuitBreaker.getState();

  // If circuit is open, don't even try
  if (circuitState === "OPEN") {
    return {
      healthy: false,
      circuitState,
      error: "Circuit breaker is open",
    };
  }

  try {
    const response = await fetch(`${INVENTORY_SERVICE_URL}/health/live`, {
      signal: AbortSignal.timeout(2000),
    });

    return {
      healthy: response.ok,
      circuitState,
      error: response.ok
        ? undefined
        : `Health check returned ${response.status}`,
    };
  } catch (error) {
    return {
      healthy: false,
      circuitState,
      error: error instanceof Error ? error.message : "Health check failed",
    };
  }
}
