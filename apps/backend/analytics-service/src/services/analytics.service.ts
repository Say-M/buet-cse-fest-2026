/** @format */

class AnalyticsService {
  private metrics = {
    totalOrders: 0,
    totalShipped: 0,
    totalRevenue: 0,
    productSales: new Map<string, number>(),
  };

  recordOrderCreated(orderId: string, totalAmount: number, items?: Array<{ productId: string; quantity: number; price?: number }>): void {
    this.metrics.totalOrders++;
    this.metrics.totalRevenue += totalAmount;

    // Track product sales
    if (items) {
      for (const item of items) {
        const current = this.metrics.productSales.get(item.productId) || 0;
        this.metrics.productSales.set(item.productId, current + item.quantity);
      }
    }

    console.log(`[Analytics] 📊 Order created: ${orderId} - Total: $${totalAmount}`);
  }

  recordOrderShipped(orderId: string): void {
    this.metrics.totalShipped++;
    console.log(`[Analytics] 📦 Order shipped: ${orderId}`);
  }

  getMetrics() {
    const averageOrderValue =
      this.metrics.totalOrders > 0
        ? this.metrics.totalRevenue / this.metrics.totalOrders
        : 0;

    const topProducts = Array.from(this.metrics.productSales.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([productId, quantity]) => ({ productId, quantity }));

    return {
      totalOrders: this.metrics.totalOrders,
      totalShipped: this.metrics.totalShipped,
      totalRevenue: parseFloat(this.metrics.totalRevenue.toFixed(2)),
      averageOrderValue: parseFloat(averageOrderValue.toFixed(2)),
      topProducts,
      timestamp: new Date().toISOString(),
    };
  }

  reset(): void {
    this.metrics = {
      totalOrders: 0,
      totalShipped: 0,
      totalRevenue: 0,
      productSales: new Map(),
    };
  }
}

export const analyticsService = new AnalyticsService();
