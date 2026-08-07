import { z } from "zod";

export const createDirectSchema = z.object({
  employeeId: z.number().int().positive(),
});

export const sendMessageSchema = z.object({
  body: z.string().trim().min(1, "El mensaje no puede estar vacío").max(2000),
});

export const messagesQuerySchema = z.object({
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(30),
});
