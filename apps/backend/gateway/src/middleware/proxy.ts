/** @format */

import type { Context, Next } from "hono";

interface ProxyConfig {
  target: string;
  pathRewrite?: Record<string, string>;
  timeout?: number;
}

/**
 * Create a proxy middleware that forwards requests to a target service
 */
export function createProxyMiddleware(config: ProxyConfig) {
  return async (c: Context, next: Next) => {
    const startTime = Date.now();

    // Build target URL
    let targetPath = c.req.path;

    // Apply path rewrites
    if (config.pathRewrite) {
      for (const [pattern, replacement] of Object.entries(config.pathRewrite)) {
        targetPath = targetPath.replace(new RegExp(pattern), replacement);
      }
    }

    const targetUrl = `${config.target}${targetPath}`;
    const queryString = c.req.url.split("?")[1];
    const fullUrl = queryString ? `${targetUrl}?${queryString}` : targetUrl;

    try {
      // Forward the request
      const headers = new Headers();

      // Copy relevant headers
      const headersToForward = [
        "content-type",
        "authorization",
        "x-idempotency-key",
        "x-request-id",
        "accept",
      ];

      for (const header of headersToForward) {
        const value = c.req.header(header);
        if (value) {
          headers.set(header, value);
        }
      }

      // Add forwarding headers
      headers.set(
        "X-Forwarded-For",
        c.req.header("x-forwarded-for") ||
          c.req.header("x-real-ip") ||
          "unknown",
      );
      headers.set("X-Forwarded-Host", c.req.header("host") || "");
      headers.set(
        "X-Forwarded-Proto",
        c.req.header("x-forwarded-proto") || "http",
      );

      const fetchOptions: RequestInit = {
        method: c.req.method,
        headers,
        signal: AbortSignal.timeout(config.timeout || 30000),
      };

      // Include body for non-GET/HEAD requests
      if (!["GET", "HEAD"].includes(c.req.method)) {
        const contentType = c.req.header("content-type");
        if (contentType?.includes("application/json")) {
          fetchOptions.body = JSON.stringify(await c.req.json());
        } else {
          fetchOptions.body = await c.req.text();
        }
      }

      const response = await fetch(fullUrl, fetchOptions);

      // Copy response headers
      const responseHeaders: Record<string, string> = {};
      const headersToReturn = [
        "content-type",
        "x-circuit-state",
        "x-gremlin-delay-ms",
        "x-request-id",
      ];

      for (const header of headersToReturn) {
        const value = response.headers.get(header);
        if (value) {
          responseHeaders[header] = value;
        }
      }

      // Add gateway timing header
      responseHeaders["X-Gateway-Time-Ms"] = (
        Date.now() - startTime
      ).toString();

      // Return the proxied response
      const body = await response.text();

      return c.body(body, response.status as any, responseHeaders);
    } catch (error) {
      const elapsed = Date.now() - startTime;

      if (error instanceof Error && error.name === "TimeoutError") {
        return c.json(
          {
            error: "Gateway Timeout",
            message: "Upstream service timed out",
            service: new URL(config.target).hostname,
            elapsed,
          },
          504,
        );
      }

      console.error(`[Gateway] Proxy error to ${config.target}:`, error);

      return c.json(
        {
          error: "Bad Gateway",
          message: "Failed to reach upstream service",
          service: new URL(config.target).hostname,
          elapsed,
        },
        502,
      );
    }
  };
}
