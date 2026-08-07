import type { ConversationKind } from "@prisma/client";
import prisma from "../prisma/client";
import type { AuthPayload } from "../auth/auth.token";

export type ConversationAcl = {
  id: number;
  kind: ConversationKind;
  taskId: number | null;
  closed: boolean;
};

export const CONVERSATION_ACL_SELECT = {
  id: true,
  kind: true,
  taskId: true,
  closed: true,
} as const;

export type Access = {
  canRead: boolean;
  canWrite: boolean;
  isMember: boolean;
};

/**
 * Unica fuente de verdad de los permisos de chat. Todo handler que devuelva o
 * acepte mensajes tiene que pasar por aca.
 */
export async function conversationAccess(
  auth: AuthPayload,
  conversation: ConversationAcl
): Promise<Access> {
  const isMember = Boolean(
    await prisma.conversationMember.findUnique({
      where: {
        conversationId_employeeId: {
          conversationId: conversation.id,
          employeeId: auth.employeeId,
        },
      },
      select: { employeeId: true },
    })
  );

  let canRead = false;

  switch (conversation.kind) {
    case "GENERAL":
      // Canal del equipo: cualquier autenticado. La fila de miembro existe solo
      // para guardar lastReadAt y se crea perezosamente; no es requisito.
      canRead = true;
      break;

    case "DIRECT":
      // A PROPOSITO sin `|| auth.role === "ADMIN"`. Un mensaje directo es
      // privado entre dos personas y el admin no es una de ellas. Si alguna vez
      // hiciera falta auditoria, que sea una funcion explicita y visible para
      // el usuario, no una condicion colada en esta linea.
      canRead = isMember;
      break;

    case "TASK":
      // Se mira ConversationMember y no TaskParticipant porque TaskParticipant
      // es Cascade y desaparece con la tarea; el historial tiene que seguir
      // siendo legible despues de que la borren.
      canRead = isMember || auth.role === "ADMIN";
      break;
  }

  return {
    canRead,
    // Escribir exige poder leer y que la conversacion no este cerrada (tarea
    // Terminada o eliminada). El admin tampoco escribe en una cerrada.
    canWrite: canRead && !conversation.closed,
    isMember,
  };
}
