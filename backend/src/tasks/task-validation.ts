import { TaskState } from "@prisma/client";
import { z } from "zod";

/**
 * z.coerce.date() y no z.string().datetime(): el frontend manda lo que produce
 * <input type="datetime-local"> convertido con toISOString(), pero coercionar
 * tolera ademas las variantes sin offset sin romper.
 */
const dateInput = z.coerce.date();

const participantIds = z
  .array(z.number().int().positive())
  .min(1, "La tarea necesita al menos un participante")
  .max(50);

export const createTaskSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().min(1).max(2000),
    startsAt: dateInput,
    endsAt: dateInput,
    state: z.nativeEnum(TaskState).optional().default(TaskState.PENDING),
    participantIds,
  })
  .superRefine((value, context) => {
    if (value.endsAt <= value.startsAt) {
      context.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "La fecha de fin debe ser posterior a la de inicio",
      });
    }
  });

/**
 * Todos los campos son opcionales, asi que la comparacion endsAt > startsAt no
 * puede vivir aca (el body puede traer solo uno de los dos). Se valida en el
 * handler contra los valores ya persistidos.
 */
export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(3).max(120).optional(),
    description: z.string().trim().min(1).max(2000).optional(),
    startsAt: dateInput.optional(),
    endsAt: dateInput.optional(),
    state: z.nativeEnum(TaskState).optional(),
    participantIds: participantIds.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "No hay cambios para aplicar",
  });

export const changeTaskStateSchema = z.object({
  state: z.nativeEnum(TaskState),
});

/**
 * Booleano explicito y no un toggle que invierte: con broadcast por socket y
 * UI optimista, dos clicks o dos clientes dejarian el estado indeterminado.
 */
export const changeTaskPinSchema = z.object({
  pinned: z.boolean(),
});

export const createCommentSchema = z.object({
  body: z.string().trim().min(1, "El comentario no puede estar vacío").max(1000),
});
