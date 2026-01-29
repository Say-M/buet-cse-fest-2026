import { z } from "zod";

export const loginSchema = z.object({
  email: z.email({ error: "Invalid email address" }),
  password: z.string({ error: "Password is required" }).min(6, {
    error: "Password must be at least 6 characters long",
  }),
});

export type LoginSchemaType = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    name: z.string({ error: "Name is required" }).min(2, {
      error: "Name must be at least 2 characters long",
    }),
    email: z.email({ error: "Invalid email address" }),
    password: z.string({ error: "Password is required" }).min(6, {
      error: "Password must be at least 6 characters long",
    }),
    confirmPassword: z
      .string({ error: "Confirm password is required" })
      .min(6, {
        error: "Confirm password must be at least 6 characters long",
      }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

export type RegisterSchemaType = z.infer<typeof registerSchema>;
