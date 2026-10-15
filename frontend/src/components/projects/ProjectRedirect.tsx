import { Alert, CircularProgress, Container } from "@mui/material";
import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { t } from "../../i18n";
import { getTask } from "../tasks/tasksApi";
import { useProjects } from "./ProjectsContext";
import type { ProjectTab } from "./projectsApi";

/**
 * The old top-level /tasks and /patch-notes, now tabs of a project. Links that
 * still point there - the notification bell's /tasks?task=12, bookmarks - land
 * on the right project: the task's own one, or else the first project.
 */
export default function ProjectRedirect({ tab }: { tab: ProjectTab }) {
  const { search, hash } = useLocation();
  const { projects } = useProjects();
  const taskId = tab === "tasks" ? Number(new URLSearchParams(search).get("task")) || null : null;
  const [taskProject, setTaskProject] = useState<number | null | undefined>(taskId ? undefined : null);

  useEffect(() => {
    if (!taskId) return;
    getTask(taskId)
      .then((task) => setTaskProject(task.projectId))
      // Gone or not visible: the project's board says so when it tries to open it.
      .catch(() => setTaskProject(null));
  }, [taskId]);

  if (!projects || taskProject === undefined) {
    return (
      <Container maxWidth="lg" sx={{ py: 6 }}>
        <CircularProgress />
      </Container>
    );
  }

  const projectId = taskProject ?? projects[0]?.id;
  if (!projectId) {
    return (
      <Container maxWidth="lg" sx={{ py: 6 }}>
        <Alert severity="info">{t("projects.none")}</Alert>
      </Container>
    );
  }

  return <Navigate to={{ pathname: `/projects/${projectId}/${tab}`, search, hash }} replace />;
}
