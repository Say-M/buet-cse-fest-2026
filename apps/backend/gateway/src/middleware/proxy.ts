import type { Context, Next } from "hono";

interface ProxyConfig {
  target: string;
  pathRewrite?: Record<string, string>;
  timeout?: number;
}

function splitSetCookieHeader(value: string): string[] {
  // Some runtimes collapse multiple Set-Cookie headers into a single comma-separated string.
  // We must split on commas that are NOT within an Expires=... attribute (which itself contains a comma).
  const parts: string[] = [];
  let start = 0;
  let inExpires = false;

  for (let i = 0; i < value.length; i++) {
    const ch = value[i];

    // Detect "Expires=" (case-insensitive) to avoid splitting on its comma
    if (!inExpires && (ch === "E" || ch === "e")) {
      const maybe = value.slice(i, i + 8);
      if (maybe.toLowerCase() === "expires=") {
        inExpires = true;
        i += 7; // jump to end of "Expires="
        continue;
      }
    }

    if (inExpires) {
      if (ch === ";") inExpires = false;
      continue;
    }

    if (ch === ",") {
      const piece = value.slice(start, i).trim();
      if (piece) parts.push(piece);
      start = i + 1;
    }
  }

  const last = value.slice(start).trim();
  if (last) parts.push(last);
  return parts;
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
        "cookie",
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

      console.log({ fullUrl, fetchOptions });

      const response = await fetch(fullUrl, fetchOptions);

      const status = response.status;
      console.log({ status });

      // Build response headers (preserve multi-value Set-Cookie)
      const outgoingHeaders = new Headers();
      const headersToReturn = [
        "content-type",
        "x-circuit-state",
        "x-gremlin-delay-ms",
        "x-request-id",
      ] as const;

      for (const header of headersToReturn) {
        const value = response.headers.get(header);
        if (value) outgoingHeaders.set(header, value);
      }

      // Forward Set-Cookie so browser stores cookies for the gateway domain
      const getSetCookie = (response.headers as any).getSetCookie as
        | (() => string[])
        | undefined;
      const setCookies = getSetCookie?.() ?? [];
      if (setCookies.length > 0) {
        for (const cookie of setCookies)
          outgoingHeaders.append("set-cookie", cookie);
      } else {
        const single = response.headers.get("set-cookie");
        if (single) {
          // If collapsed, re-split and re-emit as multiple Set-Cookie headers
          const cookies = splitSetCookieHeader(single);
          if (cookies.length <= 1) {
            outgoingHeaders.append("set-cookie", single);
          } else {
            for (const cookie of cookies)
              outgoingHeaders.append("set-cookie", cookie);
          }
        }
      }

      // Add gateway timing header
      outgoingHeaders.set(
        "X-Gateway-Time-Ms",
        (Date.now() - startTime).toString(),
      );

      // Return the proxied response
      const body = await response.text();
      return new Response(body, {
        status: response.status,
        headers: outgoingHeaders,
      });
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
