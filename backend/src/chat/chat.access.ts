import type { ConversationKind } from "@prisma/client";
import prisma from "../prisma/client";
import type { AuthPayload } from "../auth/auth.token";
import { isStaff } from "../auth/roles";

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
 * Single source of truth for chat permissions. Every handler that returns or
 * accepts messages has to go through here.
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
      // Team channel: any authenticated user. The member row exists only to
      // hold lastReadAt and is created lazily; it is not a requirement.
      canRead = true;
      break;

    case "DIRECT":
      // DELIBERATELY no exception for ADMIN or SUPERVISOR. A direct message is
      // private between two people and neither role is one of them. If auditing
      // is ever needed, it should be an explicit feature the user can see, not
      // a condition smuggled in here.
      canRead = isMember;
      break;

    case "TASK":
      // Looks at ConversationMember and not TaskParticipant because
      // TaskParticipant is Cascade and vanishes with the task; the history has
      // to stay readable after the task is deleted.
      canRead = isMember || isStaff(auth.role);
      break;
  }

  return {
    canRead,
    // Writing requires being able to read and the conversation not being closed
    // (task Done or deleted). Not even an admin writes in a closed one.
    canWrite: canRead && !conversation.closed,
    isMember,
  };
}
