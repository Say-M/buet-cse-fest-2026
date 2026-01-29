import { z } from "zod";
import { ContentfulStatusCode } from "hono/utils/http-status";

export const responseSchema = z.object({
  status: z.number(),
  message: z.string(),
  timestamp: z.iso.datetime(),
  error: z.any().optional(),
  data: z.record(z.string(), z.any()).optional(),
  pagination: z
    .object({
      total: z.number(),
      page: z.number(),
      limit: z.number(),
    })
    .optional(),
});

export type ResponseType = z.infer<typeof responseSchema> & {
  status: ContentfulStatusCode;
};
