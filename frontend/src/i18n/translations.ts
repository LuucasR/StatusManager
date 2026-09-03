/**
 * Translation catalogues.
 *
 * English is the source language: `en` is the complete catalogue and its keys
 * define the contract. `es` is typed against it, so forgetting a key there is a
 * compile error rather than a blank label at runtime.
 *
 * Keys are namespaced by area (`status.`, `role.`, `nav.`) so the catalogue
 * stays scannable as it grows.
 */
export const en = {
  // --- Activity statuses. Mirrors STATUS_META in the backend.
  // "Away" is a justified, audited absence; "Disconnected" means nobody is
  // there and nothing is recorded. They are not synonyms.
  "status.AVAILABLE": "Available",
  "status.WORKING": "Working",
  "status.BREAK": "Break",
  "status.LUNCH": "Lunch",
  "status.MEETING": "Meeting",
  "status.OFFLINE": "Away",
  "status.DISCONNECTED": "Disconnected",
  // Set by the end-of-day check, never chosen. Distinct from Disconnected on
  // purpose: this one is audited.
  "status.AUTO_DISCONNECTED": "Auto-disconnected",

  // --- Roles
  "role.EMPLOYEE": "Employee",
  "role.TASK_MANAGER": "Task manager",
  "role.SUPERVISOR": "Supervisor",
  "role.ADMIN": "Administrator",
  "role.EMPLOYEE.help":
    "Sees the board, their own history and chats. Only moves the tasks they take part in.",
  "role.TASK_MANAGER.help":
    "Also creates, edits, deletes and moves any task. Does not see the team's history or the chats of tasks they are not part of: to follow their own task, they have to add themselves as a participant.",
  "role.SUPERVISOR.help":
    "Also manages tasks, sees the team's history and reports, and requests activity confirmation.",
  "role.ADMIN.help":
    "Everything above plus creating accounts, changing roles, approving sign-ups and changing other people's status.",

  // --- Task states
  "taskState.PENDING": "Pending",
  "taskState.IN_PROGRESS": "In progress",
  "taskState.DONE": "Done",
  "taskState.PENDING.empty": "Nothing pending right now",
  "taskState.IN_PROGRESS.empty": "Nobody has started a task",
  "taskState.DONE.empty": "Nothing finished yet",

  // --- Chat
  "chat.kind.GENERAL": "Team",
  "chat.kind.TASK": "Tasks",
  "chat.kind.DIRECT": "Direct",
  "chat.closed.taskDeleted": "The task was deleted. The history stays read only.",
  "chat.closed.taskDone":
    "The chat closed when the task moved to Done. Move it to another state to write again.",

  // --- Period filter
  "period.label": "Period",
  "period.all": "All history",
  "period.today": "Today",
  "period.last7": "Last 7 days",
  "period.last30": "Last 30 days",
  "period.custom": "Custom range",
  "period.from": "From",
  "period.to": "To",

  // --- Shell
  "nav.dashboard": "Dashboard",
  "nav.tasks": "Tasks",
  "nav.summary": "Summary",
  "nav.logout": "Log out",

  // --- Settings control
  "settings.language": "Language",
  "settings.appearance": "Appearance",
  "settings.theme.light": "Light mode",
  "settings.theme.dark": "Dark mode",
  "settings.open": "Settings",

  // --- API errors, keyed by the `code` every backend response carries.
  // Matching on the code and never on the wording is what lets the backend
  // reword a message without breaking the UI.

  "error.SESSION_EXPIRED": "Your session expired. Sign in again.",
  "error.AUTH_REQUIRED": "Sign-in required",
  "error.PASSWORD_CHANGE_REQUIRED":
    "You have to change your password to continue",
  "error.ADMIN_ONLY": "Administrators only",
  "error.STAFF_ONLY": "Supervisors and administrators only",
  "error.TASK_MANAGEMENT_REQUIRED": "You need task management permissions",
  "error.RATE_LIMITED": "Too many attempts. Try again in a few minutes.",
  "error.INVALID_SIGN_IN_INPUT": "Invalid sign-in details",
  "error.INVALID_CREDENTIALS": "Invalid credentials",
  "error.INVALID_EMAIL": "Enter a valid email address",
  "error.EMAIL_TAKEN": "That email is already registered",
  "error.REGISTRATION_PENDING": "Request pending approval",
  "error.PASSWORD_RESET_REQUESTED":
    "If an active account exists for that email, an administrator will review the request.",
  "error.CURRENT_PASSWORD_MISMATCH": "The current password does not match",
  "error.PASSWORD_UPDATED": "Password updated",
  "error.INVALID_REQUEST_DECISION": "Invalid request or decision",
  "error.REQUEST_ALREADY_RESOLVED":
    "That request does not exist or was already resolved",
  "error.REQUEST_REJECTED": "Request rejected",
  "error.TEMPORARY_PASSWORD_ISSUED":
    "Temporary password generated. Read it out to the employee: it will not be shown again.",
  "error.ACCOUNT_DUPLICATE": "Could not create the account: duplicate details",
  "error.INVALID_EMPLOYEE": "Invalid employee",
  "error.EMPLOYEE_NOT_FOUND": "Employee not found",
  "error.EMPLOYEE_INACTIVE": "That employee does not exist or is inactive",
  "error.EMPLOYEE_OFFLINE": "That employee is not connected.",
  "error.INVALID_ROLE": "Invalid role",
  "error.CANNOT_CHANGE_OWN_ROLE": "You cannot change your own role",
  "error.LAST_ADMIN_ROLE": "You cannot remove the last active administrator",
  "error.CANNOT_DELETE_SELF": "You cannot delete your own administrator account",
  "error.LAST_ADMIN_DELETE": "You cannot delete the last active administrator",
  "error.INVALID_DATE_RANGE": "Invalid date range",
  "error.NO_PENDING_CONFIRMATION": "There is no pending confirmation.",
  "error.INVALID_ID": "Invalid identifier",
  "error.INVALID_VALUE": "Invalid value",
  "error.TASK_NOT_FOUND": "Task not found",
  "error.INVALID_PARTICIPANT":
    "One of the participants does not exist or is inactive",
  "error.INVALID_DATE_ORDER": "The end date must be after the start date",
  "error.MOVE_NOT_ALLOWED": "Only participants can move this task",
  "error.PIN_NOT_ALLOWED": "Only participants can pin this task",
  "error.COMMENT_NOT_ALLOWED": "Only participants can comment on this task",
  "error.COMMENT_NOT_FOUND": "Comment not found",
  "error.COMMENT_DELETE_NOT_ALLOWED":
    "Only the author or an administrator can delete the comment",
  "error.CONVERSATION_NOT_FOUND": "Conversation not found",
  "error.CONVERSATION_FORBIDDEN": "You do not have access to this conversation",
  "error.CHAT_CLOSED_DONE": "The chat is closed because the task is done",
  "error.CHAT_CLOSED_DELETED":
    "The task was deleted. The history stays read only",
  "error.SELF_CHAT": "You cannot open a chat with yourself",
  "error.INVALID_PAGINATION": "Invalid pagination parameters",
  "error.MESSAGE_NOT_FOUND": "Message not found",
  "error.MESSAGE_DELETE_NOT_ALLOWED":
    "Only the author or an administrator can delete the message",
  "error.NOTIFICATION_NOT_FOUND": "Notification not found",
  "error.NOT_FOUND": "That record does not exist",
  "error.DUPLICATE_VALUE": "A record with those details already exists",
  "error.RELATED_RECORD_MISSING": "The related record does not exist",
  "error.INTERNAL_ERROR": "Something went wrong",
  "error.UNKNOWN": "The operation could not be completed",

  // --- Shared labels and actions
  "common.close": "Close",
  "common.cancel": "Cancel",
  "common.all": "All",
  "common.employee": "Employee",
  "common.employeeNumber": "Employee number",
  "common.password": "Password",
  "common.email": "Email",
  "common.name": "Name",
  "common.status": "Status",
  "common.task": "Task",
  "common.duration": "Duration",
  "common.role": "Role",
  "common.saving": "Saving…",
  "common.sending": "Sending…",

  // --- Sign in / sign up / password
  "auth.brandTagline1": "Your working day,",
  "auth.brandTagline2": "in real time.",
  "auth.heroCopy":
    "Log your activity, stay in touch with your team and reach your history from any device.",
  "auth.welcome": "Welcome",
  "auth.signInHint": "Sign in with the details your administrator gave you.",
  "auth.forgotPassword": "Forgot your password?",
  "auth.signIn": "Sign in",
  "auth.signingIn": "Signing in…",
  "auth.noAccount": "No account yet?",
  "auth.requestAccess": "Request access",
  "auth.backToSignIn": "Back to sign in",
  "register.eyebrow": "NEW ACCOUNT",
  "register.title": "Request your access",
  "register.subtitle": "An administrator will review and approve the request.",
  "register.passwordHint": "At least 8 characters",
  "register.submit": "Send request",
  "forgot.eyebrow": "RECOVER ACCESS",
  "forgot.subtitle":
    "Enter your account email. An administrator will generate a temporary password and pass it to you; you will choose a new one when you sign in.",
  "changePassword.eyebrow": "SECURITY",
  "changePassword.title": "Choose a new password",
  "changePassword.subtitle":
    "You are using a temporary password. Change it to continue.",
  "changePassword.current": "Temporary password",
  "changePassword.new": "New password",
  "changePassword.repeat": "Repeat new password",
  "changePassword.lengthHint": "Between 8 and 72 characters",
  "changePassword.submit": "Save and continue",
  "changePassword.mismatch": "The passwords do not match",

  // --- Register page
  "register.fullName": "Full name",
  "register.submitted":
    "Request sent. Your employee number is {number}. You will be able to sign in once an administrator approves your account.",
  "register.backHome": "Back to start",

  // --- Chat, notifications, PDF preview
  "chat.backToList": "Back to the list",
  "chat.taskDeleted": "Task deleted",
  "chat.teamChannel": "Team channel",
  "chat.reconnecting": "Reconnecting…",
  "chat.conversationCount": "{count} conversations",
  "chat.newDirect": "New direct message",
  "chat.newMessage": "New message",
  "chat.close": "Close chat",
  "chat.noMessages": "No messages",
  "chat.composerPlaceholder": "Write a message…",
  "chat.send": "Send message",
  "chat.newCount.one": "{count} new message",
  "chat.newCount.many": "{count} new messages",
  "chat.searchEmployee": "Search…",
  "notifications.empty": "You have no notifications",
  "pdf.previewTitle": "Preview",
  "pdf.failed": "The PDF could not be generated",

  // --- PDF actions
  "pdf.download": "Download PDF",

  // --- Task board, task dialogs, admin dialogs
  "board.dropInto": "Drop in {state}",
  "board.noParticipants": "No participants",
  "board.archivesToday": "Archived today",
  "board.archivesTomorrow": "Archived tomorrow",
  "board.archivesInDays": "Archived in {days}d",
  "board.participants": "Participants",
  "board.searchEmployee": "Search employee…",
  "taskSelect.loading": "Loading your tasks…",
  "taskSelect.noTask": "No task — other work",
  "taskSelect.empty":
    "You have no tasks assigned on the board. Say what you are working on in the comment.",
  "taskSelect.help": "Only your unfinished tasks that are still on the board.",
  "taskDetail.cannotComment": "Only participants can write in this task.",
  "taskDetail.unpin": "Unpin",
  "taskDetail.pin": "Pin — never archived after 14 days",
  "taskDetail.cannotPin": "Only participants can pin this task",
  "taskForm.edit": "Edit task",
  "taskForm.create": "New task",
  "taskForm.title": "Title",
  "taskForm.description": "What is the task about?",
  "taskForm.save": "Save changes",
  "taskForm.submit": "Create task",
  "taskForm.titleTooShort": "The title needs at least 3 characters",
  "taskForm.descriptionRequired": "Explain what the task is about",
  "taskForm.datesRequired": "Set the start and end date and time",
  "taskForm.participantsRequired": "Pick at least one participant",
  "account.newTitle": "New account",
  "account.create": "Create account",
  "account.creating": "Creating…",
  "account.initialPassword": "Initial password",
  "account.passwordHint":
    "At least 8 characters. You have to pass it on yourself: the app does not send email.",
  "account.nameRequired": "Enter the full name",
  "account.emailRequired": "Enter an email",
  "account.passwordTooShort": "The password needs at least 8 characters",
  "role.changeTitle": "Change role",
  "role.save": "Save role",

  // --- Task report dialog and tasks page
  "taskReport.title": "Task report",
  "taskReport.note":
    "The report includes archived tasks, which no longer appear on the board.",
  "taskReport.participant": "Participant",
  "taskReport.last90": "Last 90 days",
  "taskReport.preview": "Preview",
  "taskReport.filename": "task-report.pdf",
  "tasksPage.eyebrow": "TASK BOARD",
  "tasksPage.title": "Team tasks",
  "tasksPage.subtitle":
    "Drag a card between columns, or use the card menu to move it. Tasks are archived 14 days after their end date unless you pin them.",
  "tasksPage.unpinWarning":
    "This task is already more than 14 days past its end date. If you unpin it, it will disappear from the board. Continue?",

  // --- Summary page
  "summary.eyebrow": "YOUR ACTIVITY",
  "summary.title": "Summary",
  "summary.timeLogged": "Time logged",
  "summary.timeLoggedNote":
    "Sum of the segments recorded inside the period. It excludes Disconnected periods and time with no status set.",
  "summary.byStatus": "By status",
  "summary.empty": "No activity recorded in this period.",
  "summary.tasksWorked": "Tasks worked on",
  "summary.noTasks": "You did not declare any task in this period.",
  "summary.segments.one": "{count} segment",
  "summary.segments.many": "{count} segments",
  "summary.untitledTask": "Untitled task",
  "summary.deleted": "Deleted",
  "summary.asOfNote":
    "Participants and state are the task's current ones, not those at the time you worked on it.",
  "summary.taskDeleted":
    "The task was deleted. Only the record of the time you booked against it and its title remain.",

  // --- Dashboard page
  "dashboard.eyebrow": "MY DAY",
  "dashboard.greeting": "Hi, {name}",
  "dashboard.securityEyebrow": "SECURITY",
  "dashboard.passwordRequests": "Password change requests",
  "dashboard.pendingCount": "{count} pending",
  "dashboard.noPendingRequests": "No pending requests.",
  "dashboard.accept": "Accept",
  "dashboard.reject": "Reject",
  "dashboard.approveSignUp": "Approve sign-up",
  "dashboard.confirmReject": "Reject this sign-up request?",
  "dashboard.adminPanel": "ADMIN PANEL",
  "dashboard.supervisorPanel": "SUPERVISOR PANEL",
  "dashboard.teamPanel": "TEAM",
  "dashboard.liveTeam": "Team, live",
  "dashboard.viewPdfReport": "View PDF report",
  "dashboard.recentActivity": "RECENT ACTIVITY",
  "dashboard.yourHistory": "Your history",
  "dashboard.previewPdf": "Preview PDF",
  "dashboard.historyTruncated":
    "This period has more records than fit in the table. The most recent ones are shown; the summary does count the whole period.",
  "dashboard.noDetail": "No detail",
  "dashboard.noComment": "No comment",
  "dashboard.start": "Start",
  "dashboard.detail": "Detail",
  "dashboard.date": "Date",
  "dashboard.actions": "Actions",
  "dashboard.updateStatusOf": "Update {name}'s status",
  "dashboard.updateStatus": "Update status",
  "dashboard.newStatus": "New status",
  "dashboard.detailRequired": "Write at least 3 characters",
  "dashboard.detailOptional": "You can add a comment",
  "dashboard.noTaskChosen":
    "You chose to work without a task from the board: say what you are on.",
  "dashboard.configureReport": "Configure PDF report",
  "dashboard.reportPreviewTitle": "Report preview",
  "dashboard.reportPreviewFrameTitle": "PDF report preview",
  "dashboard.temporaryPassword": "Temporary password",
  "dashboard.temporaryPasswordNote":
    "Pass it to {name}. It is not stored anywhere and will not be shown again. When they sign in, they will have to choose a new one.",
  "dashboard.copied": "Got it",

  // --- Working-task rule errors
  "error.TASK_NOT_ASSIGNABLE":
    "That task is not one of yours, is already done, or has left the board",
  "error.TASK_OR_COMMENT_REQUIRED":
    "Pick the task you are going to work on, or write a comment of at least 3 characters if it is other work",

  // --- Relative days
  "date.today": "Today",
  "date.yesterday": "Yesterday",

  // --- Strings missed by the first translation pass
  "common.edit": "Edit",
  "common.delete": "Delete",
  "common.viewDetail": "View detail",
  "common.description": "Description",
  "board.pin": "Pin card",
  "board.unpin": "Unpin",
  "board.pinnedTooltip": "Pinned — never archived",
  "board.pinnedLabel": "Pinned",
  "board.cardActions": "Actions for {title}",
  "board.statusLabel": "State: {state}",
  "board.moveTo": "Move to {state}",
  "board.commentCount": "{count} comments",
  "board.newTask": "New task",
  "board.confirmDelete": "Delete the task \"{title}\"? Its comments go with it.",
  "taskDetail.conversation": "Conversation ({count})",
  "taskDetail.privateThread":
    "The conversation is private to the participants. You can manage the task, but to follow the thread you have to add yourself as a participant.",
  "summary.subtitle":
    "Where your time went during the period, and the details of every task you worked on.",
  "dashboard.tagline":
    "Keep your activity up to date so the team stays in the loop.",
  "dashboard.changeStatus": "Change status",
  "dashboard.changeRole": "Change role",
  "dashboard.deleteAccount": "Delete account",
  "dashboard.requestConfirmation": "Request confirmation",
  "dashboard.confirmDeleteAccount":
    "Permanently delete {name}'s account? Their whole activity history goes with it.",
  "dashboard.confirmApprovePassword": "Approve the password change for {name}?",
  "dashboard.confirmRejectPassword": "Reject the password change for {name}?",
  "dashboard.personalReportFilename": "my-activity-log.pdf",
  "dashboard.confirmationTitle": "Activity confirmation",
  "dashboard.confirmationBody":
    "An administrator is asking you to confirm your current activity.",
  "dashboard.confirmationCountdown": "Time left: {seconds}s",
  "dashboard.changeActivity": "Change activity",
  "dashboard.stillOnIt": "Yes, still on it",
  "account.created":
    "Account created: {name} · employee #{number}. Pass them the number and the password.",
  "chat.messages": "Messages",
  "chat.messagesUnread": "Messages, {count} unread",

  // --- Remaining dialog and list strings
  "role.appliesImmediately":
    "It applies immediately: their next request already uses the new role, with no need to sign in again.",
  "account.autoNumberNote":
    "The employee number is assigned automatically and the account starts active: there is nothing to approve.",
  "chat.noConversations": "You have no conversations yet.",
  "chat.emptyThread": "No messages yet.",
  "notifications.title": "Notifications",
  "notifications.markAllRead": "Mark all as read",
  "common.loadMore": "Load more",

  // --- Single-word labels the scanner used to miss
  "common.start": "Start",
  "common.pending": "Pending",
  "common.saveChange": "Save change",
  "dashboard.currentStatus": "Current status",
  "dashboard.commentRequired": "Comment required",
  "dashboard.commentOptional": "Comment optional",
  "dashboard.reportFilename": "activity-report.pdf",
  "board.participantsLabel": "Members",
  "tasksPage.pdfReport": "PDF report",
  "notifications.unreadLabel": "Notifications, {count} unread",

  // --- Workday calendar errors
  "error.INVALID_DATE": "The date must be a real YYYY-MM-DD day",

  // --- Working calendar (admin)
  "nav.workday": "Calendar",
  "workday.eyebrow": "ADMINISTRATION",
  "workday.title": "Working calendar",
  "workday.subtitle":
    "What counts as a working day, and the hours the app uses to pause and resume the board.",
  "workday.settings": "Schedule",
  "workday.enabled": "Automation on",
  "workday.enabledHelp":
    "Master switch. With it off, nothing is paused, resumed or checked.",
  "workday.weekdays": "Working days",
  "workday.startTime": "Day starts",
  "workday.endTime": "Day ends",
  "workday.timezone": "Timezone",
  "workday.delay": "Wait before asking (min)",
  "workday.delayHelp":
    "How long after the day ends before anyone still marked as working is asked whether they still are.",
  "workday.timeout": "Time to answer (s)",
  "workday.timeoutHelp":
    "Whoever does not answer in this window is disconnected, and their tasks go back to Pending.",
  "workday.recheck": "Ask again every (min)",
  "workday.recheckHelp":
    "Out of hours the question keeps coming back this often, all night and through weekends and holidays, until the person stops being marked as working.",
  "workday.saved": "Schedule saved",
  "workday.calendar": "Exceptions",
  "workday.calendarHelp":
    "A date here overrides the weekly pattern: it closes a working day, opens a weekend, or gives that one day different hours.",
  "workday.previousMonth": "Previous month",
  "workday.nextMonth": "Next month",
  "workday.today": "Today",
  "workday.closed": "Closed",
  "workday.open": "Working day",
  "workday.editDay": "Edit {date}",
  "workday.isWorking": "It is a working day",
  "workday.customHours": "Different hours that day",
  "workday.label": "Note",
  "workday.labelPlaceholder": "Public holiday",
  "workday.clearDay": "Back to the weekly pattern",
  "workday.followsPattern": "Follows the weekly pattern",
  "weekday.0": "Sun",
  "weekday.1": "Mon",
  "weekday.2": "Tue",
  "weekday.3": "Wed",
  "weekday.4": "Thu",
  "weekday.5": "Fri",
  "weekday.6": "Sat",
  "board.pausedOvernight": "Paused overnight",

  // --- Expired activity check
  "dashboard.confirmationExpired":
    "The activity check expired. You were marked as disconnected.",

  // --- Employee notes
  "dashboard.taskDeletedSuffix": "{title} (deleted)",
  "dashboard.workingOn": "On: {task}",

  // --- Conversation state chips
  "chat.deleted": "Deleted",
  "chat.closed": "Closed",

  // --- Read-only calendar
  "workday.readOnly":
    "These are the hours the app works to. Only an administrator can change them.",

  // --- Route vs record 404
  "error.ROUTE_NOT_FOUND":
    "That endpoint does not exist. The app may be newer than the server it is talking to.",
} as const;

export type TranslationKey = keyof typeof en;

const es: Record<TranslationKey, string> = {
  "status.AVAILABLE": "Disponible",
  "status.WORKING": "Trabajando",
  "status.BREAK": "Descanso",
  "status.LUNCH": "Almuerzo",
  "status.MEETING": "Reunión",
  "status.OFFLINE": "Ausente",
  "status.DISCONNECTED": "Desconectado",
  "status.AUTO_DISCONNECTED": "Desconectado por la app",

  "role.EMPLOYEE": "Empleado",
  "role.TASK_MANAGER": "Gestor de tareas",
  "role.SUPERVISOR": "Supervisor",
  "role.ADMIN": "Administrador",
  "role.EMPLOYEE.help":
    "Ve la pizarra, su historial y chatea. Solo mueve las tareas donde participa.",
  "role.TASK_MANAGER.help":
    "Además crea, edita, borra y mueve cualquier tarea. No ve el historial del equipo ni los chats de las tareas donde no participa: para seguir su propia tarea, tiene que agregarse como participante.",
  "role.SUPERVISOR.help":
    "Además gestiona tareas, ve el historial y los reportes del equipo, y pide confirmación de actividad.",
  "role.ADMIN.help":
    "Todo lo anterior más crear cuentas, cambiar roles, aprobar altas y cambiar el estado de otros.",

  "taskState.PENDING": "Pendiente",
  "taskState.IN_PROGRESS": "En curso",
  "taskState.DONE": "Terminada",
  "taskState.PENDING.empty": "Nada pendiente por ahora",
  "taskState.IN_PROGRESS.empty": "Nadie arrancó ninguna tarea",
  "taskState.DONE.empty": "Todavía no terminaron ninguna",

  "chat.kind.GENERAL": "Equipo",
  "chat.kind.TASK": "Tareas",
  "chat.kind.DIRECT": "Directos",
  "chat.closed.taskDeleted":
    "La tarea fue eliminada. El historial queda como solo lectura.",
  "chat.closed.taskDone":
    "El chat se cerró cuando la tarea pasó a Terminada. Movela a otro estado para volver a escribir.",

  "period.label": "Período",
  "period.all": "Todo el historial",
  "period.today": "Hoy",
  "period.last7": "Últimos 7 días",
  "period.last30": "Últimos 30 días",
  "period.custom": "Rango personalizado",
  "period.from": "Desde",
  "period.to": "Hasta",

  "nav.dashboard": "Panel",
  "nav.tasks": "Tareas",
  "nav.summary": "Resumen",
  "nav.logout": "Salir",

  "settings.language": "Idioma",
  "settings.appearance": "Apariencia",
  "settings.theme.light": "Modo claro",
  "settings.theme.dark": "Modo oscuro",
  "settings.open": "Ajustes",

  "error.SESSION_EXPIRED": "Tu sesión venció. Volvé a entrar.",
  "error.AUTH_REQUIRED": "Necesitás iniciar sesión",
  "error.PASSWORD_CHANGE_REQUIRED":
    "Tenés que cambiar tu contraseña para continuar",
  "error.ADMIN_ONLY": "Acceso exclusivo para administradores",
  "error.STAFF_ONLY": "Acceso exclusivo para supervisores y administradores",
  "error.TASK_MANAGEMENT_REQUIRED": "Necesitás permisos de gestión de tareas",
  "error.RATE_LIMITED": "Demasiados intentos. Probá de nuevo en unos minutos.",
  "error.INVALID_SIGN_IN_INPUT": "Datos de acceso inválidos",
  "error.INVALID_CREDENTIALS": "Credenciales inválidas",
  "error.INVALID_EMAIL": "Ingresá un email válido",
  "error.EMAIL_TAKEN": "Ese email ya está registrado",
  "error.REGISTRATION_PENDING": "Solicitud pendiente de aprobación",
  "error.PASSWORD_RESET_REQUESTED":
    "Si existe una cuenta activa con ese email, un administrador va a revisar la solicitud.",
  "error.CURRENT_PASSWORD_MISMATCH": "La contraseña actual no coincide",
  "error.PASSWORD_UPDATED": "Contraseña actualizada",
  "error.INVALID_REQUEST_DECISION": "Solicitud o decisión inválida",
  "error.REQUEST_ALREADY_RESOLVED": "Esa solicitud no existe o ya fue resuelta",
  "error.REQUEST_REJECTED": "Solicitud rechazada",
  "error.TEMPORARY_PASSWORD_ISSUED":
    "Contraseña temporal generada. Dictásela al empleado: no se vuelve a mostrar.",
  "error.ACCOUNT_DUPLICATE": "No se pudo crear la cuenta: datos duplicados",
  "error.INVALID_EMPLOYEE": "Empleado inválido",
  "error.EMPLOYEE_NOT_FOUND": "Empleado no encontrado",
  "error.EMPLOYEE_INACTIVE": "Ese empleado no existe o está inactivo",
  "error.EMPLOYEE_OFFLINE": "Ese empleado no está conectado.",
  "error.INVALID_ROLE": "Rol inválido",
  "error.CANNOT_CHANGE_OWN_ROLE": "No podés cambiar tu propio rol",
  "error.LAST_ADMIN_ROLE": "No podés quitar el último administrador activo",
  "error.CANNOT_DELETE_SELF":
    "No podés eliminar tu propia cuenta de administrador",
  "error.LAST_ADMIN_DELETE": "No podés eliminar el último administrador activo",
  "error.INVALID_DATE_RANGE": "Rango de fechas inválido",
  "error.NO_PENDING_CONFIRMATION": "No hay ninguna confirmación pendiente.",
  "error.INVALID_ID": "Identificador inválido",
  "error.INVALID_VALUE": "Valor inválido",
  "error.TASK_NOT_FOUND": "Tarea no encontrada",
  "error.INVALID_PARTICIPANT":
    "Alguno de los participantes no existe o está inactivo",
  "error.INVALID_DATE_ORDER": "La fecha de fin debe ser posterior a la de inicio",
  "error.MOVE_NOT_ALLOWED": "Solo los participantes pueden mover esta tarea",
  "error.PIN_NOT_ALLOWED": "Solo los participantes pueden fijar esta tarea",
  "error.COMMENT_NOT_ALLOWED":
    "Solo los participantes pueden comentar esta tarea",
  "error.COMMENT_NOT_FOUND": "Comentario no encontrado",
  "error.COMMENT_DELETE_NOT_ALLOWED":
    "Solo el autor o un administrador pueden borrar el comentario",
  "error.CONVERSATION_NOT_FOUND": "Conversación no encontrada",
  "error.CONVERSATION_FORBIDDEN": "No tenés acceso a esta conversación",
  "error.CHAT_CLOSED_DONE": "El chat está cerrado porque la tarea está terminada",
  "error.CHAT_CLOSED_DELETED":
    "La tarea fue eliminada. El historial queda como solo lectura",
  "error.SELF_CHAT": "No podés abrir un chat con vos mismo",
  "error.INVALID_PAGINATION": "Parámetros de paginación inválidos",
  "error.MESSAGE_NOT_FOUND": "Mensaje no encontrado",
  "error.MESSAGE_DELETE_NOT_ALLOWED":
    "Solo el autor o un administrador pueden borrar el mensaje",
  "error.NOTIFICATION_NOT_FOUND": "Notificación no encontrada",
  "error.NOT_FOUND": "Ese registro no existe",
  "error.DUPLICATE_VALUE": "Ya existe un registro con esos datos",
  "error.RELATED_RECORD_MISSING": "El registro relacionado no existe",
  "error.INTERNAL_ERROR": "Ocurrió un error inesperado",
  "error.UNKNOWN": "No se pudo completar la operación",

  "common.close": "Cerrar",
  "common.cancel": "Cancelar",
  "common.all": "Todos",
  "common.employee": "Empleado",
  "common.employeeNumber": "Número de empleado",
  "common.password": "Contraseña",
  "common.email": "Email",
  "common.name": "Nombre",
  "common.status": "Estado",
  "common.task": "Tarea",
  "common.duration": "Duración",
  "common.role": "Rol",
  "common.saving": "Guardando…",
  "common.sending": "Enviando…",

  "auth.brandTagline1": "Tu jornada,",
  "auth.brandTagline2": "en tiempo real.",
  "auth.heroCopy":
    "Registrá tu actividad, mantenete en contacto con tu equipo y accedé a tu historial desde cualquier dispositivo.",
  "auth.welcome": "Bienvenido",
  "auth.signInHint": "Ingresá con los datos que te asignó tu administrador.",
  "auth.forgotPassword": "¿Olvidaste tu contraseña?",
  "auth.signIn": "Iniciar sesión",
  "auth.signingIn": "Ingresando…",
  "auth.noAccount": "¿Todavía no tenés cuenta?",
  "auth.requestAccess": "Solicitar acceso",
  "auth.backToSignIn": "Volver al inicio de sesión",
  "register.eyebrow": "NUEVA CUENTA",
  "register.title": "Solicitá tu acceso",
  "register.subtitle": "Un administrador revisará y aprobará el alta.",
  "register.passwordHint": "Mínimo 8 caracteres",
  "register.submit": "Enviar solicitud",
  "forgot.eyebrow": "RECUPERAR ACCESO",
  "forgot.subtitle":
    "Ingresá el email de tu cuenta. Un administrador va a generarte una contraseña temporal y te la va a pasar; al entrar vas a elegir una nueva.",
  "changePassword.eyebrow": "SEGURIDAD",
  "changePassword.title": "Elegí una contraseña nueva",
  "changePassword.subtitle":
    "Estás usando una contraseña temporal. Cambiala para poder seguir.",
  "changePassword.current": "Contraseña temporal",
  "changePassword.new": "Nueva contraseña",
  "changePassword.repeat": "Repetir nueva contraseña",
  "changePassword.lengthHint": "Entre 8 y 72 caracteres",
  "changePassword.submit": "Guardar y entrar",
  "changePassword.mismatch": "Las contraseñas no coinciden",

  "register.fullName": "Nombre completo",
  "register.submitted":
    "Solicitud enviada. Tu número de empleado es {number}. Vas a poder ingresar cuando un administrador apruebe tu cuenta.",
  "register.backHome": "Volver al inicio",

  "chat.backToList": "Volver a la lista",
  "chat.taskDeleted": "Tarea eliminada",
  "chat.teamChannel": "Canal del equipo",
  "chat.reconnecting": "Reconectando…",
  "chat.conversationCount": "{count} conversaciones",
  "chat.newDirect": "Nuevo mensaje directo",
  "chat.newMessage": "Nuevo mensaje",
  "chat.close": "Cerrar chat",
  "chat.noMessages": "Sin mensajes",
  "chat.composerPlaceholder": "Escribí un mensaje…",
  "chat.send": "Enviar mensaje",
  "chat.newCount.one": "{count} mensaje nuevo",
  "chat.newCount.many": "{count} mensajes nuevos",
  "chat.searchEmployee": "Buscar…",
  "notifications.empty": "No tenés notificaciones",
  "pdf.previewTitle": "Previsualización",
  "pdf.failed": "No se pudo generar el PDF",

  "pdf.download": "Descargar PDF",

  "board.dropInto": "Soltar en {state}",
  "board.noParticipants": "Sin participantes",
  "board.archivesToday": "Se archiva hoy",
  "board.archivesTomorrow": "Se archiva mañana",
  "board.archivesInDays": "Se archiva en {days} d",
  "board.participants": "Participantes",
  "board.searchEmployee": "Buscar empleado…",
  "taskSelect.loading": "Cargando tus tareas…",
  "taskSelect.noTask": "Sin tarea — otro trabajo",
  "taskSelect.empty":
    "No tenés tareas asignadas en la pizarra. Contá en el comentario en qué trabajás.",
  "taskSelect.help": "Solo tus tareas sin terminar que siguen en la pizarra.",
  "taskDetail.cannotComment":
    "Solo los participantes pueden escribir en esta tarea.",
  "taskDetail.unpin": "Dejar de fijar",
  "taskDetail.pin": "Fijar — no se archiva a los 14 días",
  "taskDetail.cannotPin": "Solo los participantes pueden fijar esta tarea",
  "taskForm.edit": "Editar tarea",
  "taskForm.create": "Nueva tarea",
  "taskForm.title": "Título",
  "taskForm.description": "¿De qué trata la tarea?",
  "taskForm.save": "Guardar cambios",
  "taskForm.submit": "Crear tarea",
  "taskForm.titleTooShort": "El título necesita al menos 3 caracteres",
  "taskForm.descriptionRequired": "Explicá de qué trata la tarea",
  "taskForm.datesRequired": "Indicá la fecha y hora de inicio y de fin",
  "taskForm.participantsRequired": "Elegí al menos un participante",
  "account.newTitle": "Nueva cuenta",
  "account.create": "Crear cuenta",
  "account.creating": "Creando…",
  "account.initialPassword": "Contraseña inicial",
  "account.passwordHint":
    "Mínimo 8 caracteres. Se la tenés que pasar vos: la app no manda mails.",
  "account.nameRequired": "Ingresá el nombre completo",
  "account.emailRequired": "Ingresá un email",
  "account.passwordTooShort": "La contraseña necesita al menos 8 caracteres",
  "role.changeTitle": "Cambiar rol",
  "role.save": "Guardar rol",

  "taskReport.title": "Reporte de tareas",
  "taskReport.note":
    "El reporte incluye las tareas archivadas, que ya no aparecen en la pizarra.",
  "taskReport.participant": "Participante",
  "taskReport.last90": "Últimos 90 días",
  "taskReport.preview": "Previsualizar",
  "taskReport.filename": "reporte-tareas.pdf",
  "tasksPage.eyebrow": "PIZARRA DE TAREAS",
  "tasksPage.title": "Tareas del equipo",
  "tasksPage.subtitle":
    "Arrastrá una tarjeta entre columnas, o usá el menú de la tarjeta para moverla. Las tareas se archivan 14 días después de su fecha de fin, salvo que las fijes.",
  "tasksPage.unpinWarning":
    "Esta tarea ya superó los 14 días desde su fecha de fin. Si dejás de fijarla, desaparecerá de la pizarra. ¿Continuar?",

  "summary.eyebrow": "TU ACTIVIDAD",
  "summary.title": "Resumen",
  "summary.timeLogged": "Tiempo registrado",
  "summary.timeLoggedNote":
    "Suma de los tramos registrados dentro del período. No incluye los períodos Desconectado ni el tiempo sin ningún estado puesto.",
  "summary.byStatus": "Por estado",
  "summary.empty": "No hay actividad registrada en este período.",
  "summary.tasksWorked": "Tareas trabajadas",
  "summary.noTasks": "No declaraste ninguna tarea en este período.",
  "summary.segments.one": "{count} tramo",
  "summary.segments.many": "{count} tramos",
  "summary.untitledTask": "Tarea sin título",
  "summary.deleted": "Eliminada",
  "summary.asOfNote":
    "Integrantes y estado son los actuales de la tarea, no los del momento en que trabajaste.",
  "summary.taskDeleted":
    "La tarea fue eliminada. Solo queda el registro del tiempo que le imputaste y su título.",

  "dashboard.eyebrow": "MI JORNADA",
  "dashboard.greeting": "Hola, {name}",
  "dashboard.securityEyebrow": "SEGURIDAD",
  "dashboard.passwordRequests": "Solicitudes de cambio de contraseña",
  "dashboard.pendingCount": "{count} pendientes",
  "dashboard.noPendingRequests": "No hay solicitudes pendientes.",
  "dashboard.accept": "Aceptar",
  "dashboard.reject": "Rechazar",
  "dashboard.approveSignUp": "Aprobar alta",
  "dashboard.confirmReject": "¿Rechazar esta solicitud de registro?",
  "dashboard.adminPanel": "PANEL ADMINISTRADOR",
  "dashboard.supervisorPanel": "PANEL SUPERVISOR",
  "dashboard.teamPanel": "EQUIPO",
  "dashboard.liveTeam": "Equipo en vivo",
  "dashboard.viewPdfReport": "Ver reporte PDF",
  "dashboard.recentActivity": "ACTIVIDAD RECIENTE",
  "dashboard.yourHistory": "Tu historial",
  "dashboard.previewPdf": "Previsualizar PDF",
  "dashboard.historyTruncated":
    "El período tiene más registros de los que entran en la tabla. Se muestran los más recientes; el resumen sí cuenta el período completo.",
  "dashboard.noDetail": "Sin detalle",
  "dashboard.noComment": "Sin comentario",
  "dashboard.start": "Inicio",
  "dashboard.detail": "Detalle",
  "dashboard.date": "Fecha",
  "dashboard.actions": "Acciones",
  "dashboard.updateStatusOf": "Actualizar estado de {name}",
  "dashboard.updateStatus": "Actualizar estado",
  "dashboard.newStatus": "Nuevo estado",
  "dashboard.detailRequired": "Escribí al menos 3 caracteres",
  "dashboard.detailOptional": "Podés agregar un comentario",
  "dashboard.noTaskChosen":
    "Elegiste trabajar sin una tarea de la pizarra: contá en qué estás.",
  "dashboard.configureReport": "Configurar reporte PDF",
  "dashboard.reportPreviewTitle": "Previsualización del reporte",
  "dashboard.reportPreviewFrameTitle": "Previsualización del reporte PDF",
  "dashboard.temporaryPassword": "Contraseña temporal",
  "dashboard.temporaryPasswordNote":
    "Pasásela a {name}. No se guarda en ningún lado y no se vuelve a mostrar. Al entrar, va a tener que elegir una nueva.",
  "dashboard.copied": "Ya la copié",

  "error.TASK_NOT_ASSIGNABLE":
    "Esa tarea no está entre las tuyas, ya está terminada o salió de la pizarra",
  "error.TASK_OR_COMMENT_REQUIRED":
    "Elegí la tarea en la que vas a trabajar, o escribí un comentario de al menos 3 caracteres si es otro trabajo",

  "date.today": "Hoy",
  "date.yesterday": "Ayer",

  "common.edit": "Editar",
  "common.delete": "Eliminar",
  "common.viewDetail": "Ver detalle",
  "common.description": "Descripción",
  "board.pin": "Fijar tarjeta",
  "board.unpin": "Dejar de fijar",
  "board.pinnedTooltip": "Fijada — no se archiva",
  "board.pinnedLabel": "Fijada",
  "board.cardActions": "Acciones de {title}",
  "board.statusLabel": "Estado: {state}",
  "board.moveTo": "Mover a {state}",
  "board.commentCount": "{count} comentarios",
  "board.newTask": "Nueva tarea",
  "board.confirmDelete":
    "¿Eliminar la tarea \"{title}\"? Se borran sus comentarios.",
  "taskDetail.conversation": "Conversación ({count})",
  "taskDetail.privateThread":
    "La conversación es privada de los participantes. Podés gestionar la tarea, pero para seguir el hilo tenés que agregarte como integrante.",
  "summary.subtitle":
    "En qué se te fue el tiempo durante el período, y los detalles de cada tarea que trabajaste.",
  "dashboard.tagline":
    "Mantené tu actividad actualizada para que el equipo esté conectado.",
  "dashboard.changeStatus": "Cambiar estado",
  "dashboard.changeRole": "Cambiar rol",
  "dashboard.deleteAccount": "Eliminar cuenta",
  "dashboard.requestConfirmation": "Solicitar confirmación",
  "dashboard.confirmDeleteAccount":
    "¿Eliminar definitivamente la cuenta de {name}? También se eliminará todo su historial de actividades.",
  "dashboard.confirmApprovePassword":
    "¿Aprobar el cambio de contraseña de {name}?",
  "dashboard.confirmRejectPassword":
    "¿Rechazar el cambio de contraseña de {name}?",
  "dashboard.personalReportFilename": "mi-registro-de-actividades.pdf",
  "dashboard.confirmationTitle": "Confirmación de actividad",
  "dashboard.confirmationBody":
    "El administrador solicita confirmar tu actividad actual.",
  "dashboard.confirmationCountdown": "Tiempo restante: {seconds}s",
  "dashboard.changeActivity": "Cambiar actividad",
  "dashboard.stillOnIt": "Sí, continúo",
  "account.created":
    "Cuenta creada: {name} · legajo #{number}. Pasale el legajo y la contraseña.",
  "chat.messages": "Mensajes",
  "chat.messagesUnread": "Mensajes, {count} sin leer",

  "role.appliesImmediately":
    "Se aplica al instante: su próxima acción ya usa el rol nuevo, sin necesidad de volver a entrar.",
  "account.autoNumberNote":
    "El legajo se asigna solo, y la cuenta queda activa: no hace falta aprobarla.",
  "chat.noConversations": "No tenés conversaciones todavía.",
  "chat.emptyThread": "Todavía no hay mensajes.",
  "notifications.title": "Notificaciones",
  "notifications.markAllRead": "Marcar todo como leído",
  "common.loadMore": "Ver más",

  "common.start": "Inicio",
  "common.pending": "Pendiente",
  "common.saveChange": "Guardar cambio",
  "dashboard.currentStatus": "Estado actual",
  "dashboard.commentRequired": "Comentario obligatorio",
  "dashboard.commentOptional": "Comentario opcional",
  "dashboard.reportFilename": "reporte-actividades.pdf",
  "board.participantsLabel": "Integrantes",
  "tasksPage.pdfReport": "Reporte PDF",
  "notifications.unreadLabel": "Notificaciones, {count} sin leer",

  "error.INVALID_DATE":
    "La fecha tiene que ser un día real en formato AAAA-MM-DD",

  "nav.workday": "Calendario",
  "workday.eyebrow": "ADMINISTRACIÓN",
  "workday.title": "Calendario laboral",
  "workday.subtitle":
    "Qué cuenta como día laboral, y los horarios que la app usa para pausar y reanudar el tablero.",
  "workday.settings": "Horarios",
  "workday.enabled": "Automatización activa",
  "workday.enabledHelp":
    "Interruptor general. Apagado, no se pausa, ni se reanuda, ni se consulta a nadie.",
  "workday.weekdays": "Días laborables",
  "workday.startTime": "Comienza",
  "workday.endTime": "Termina",
  "workday.timezone": "Zona horaria",
  "workday.delay": "Espera antes de preguntar (min)",
  "workday.delayHelp":
    "Cuánto se espera después del cierre para preguntarle a quien siga marcado como trabajando.",
  "workday.timeout": "Tiempo para responder (s)",
  "workday.timeoutHelp":
    "A quien no responda en esa ventana se lo desconecta, y sus tareas vuelven a Pendiente.",
  "workday.recheck": "Volver a preguntar cada (min)",
  "workday.recheckHelp":
    "Fuera de horario la pregunta vuelve con esta frecuencia, toda la noche y también fines de semana y feriados, hasta que la persona deje de estar marcada como trabajando.",
  "workday.saved": "Horarios guardados",
  "workday.calendar": "Excepciones",
  "workday.calendarHelp":
    "Una fecha acá pisa el patrón semanal: cierra un día laboral, abre un fin de semana, o le da otro horario a ese día.",
  "workday.previousMonth": "Mes anterior",
  "workday.nextMonth": "Mes siguiente",
  "workday.today": "Hoy",
  "workday.closed": "Cerrado",
  "workday.open": "Día laboral",
  "workday.editDay": "Editar {date}",
  "workday.isWorking": "Es día laboral",
  "workday.customHours": "Horario distinto ese día",
  "workday.label": "Nota",
  "workday.labelPlaceholder": "Feriado nacional",
  "workday.clearDay": "Volver al patrón semanal",
  "workday.followsPattern": "Sigue el patrón semanal",
  "weekday.0": "Dom",
  "weekday.1": "Lun",
  "weekday.2": "Mar",
  "weekday.3": "Mié",
  "weekday.4": "Jue",
  "weekday.5": "Vie",
  "weekday.6": "Sáb",
  "board.pausedOvernight": "Pausada anoche",

  "dashboard.confirmationExpired":
    "El control de actividad venció. Quedaste marcado como desconectado.",

  "dashboard.taskDeletedSuffix": "{title} (eliminada)",
  "dashboard.workingOn": "En: {task}",

  "chat.deleted": "Eliminada",
  "chat.closed": "Cerrada",

  "workday.readOnly":
    "Estos son los horarios con los que trabaja la app. Solo un administrador puede cambiarlos.",

  "error.ROUTE_NOT_FOUND":
    "Ese endpoint no existe. Puede que la app sea más nueva que el servidor al que le habla.",
};

export const CATALOGUES = { en, es };

export type Language = keyof typeof CATALOGUES;

/** Shown in the language picker, in each language's own name. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  es: "Español",
};
