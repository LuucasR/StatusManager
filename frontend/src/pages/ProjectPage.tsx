import { DescriptionRounded, MapRounded, MenuBookRounded, ViewKanbanRounded } from "@mui/icons-material";
import type { SvgIconComponent } from "@mui/icons-material";
import { Alert, Box, CircularProgress, Container, Tab, Tabs, Typography } from "@mui/material";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { t, type TranslationKey } from "../i18n";
import TasksPage from "./TasksPage";
import PatchNotesPage from "./PatchNotesPage";
import MapsTab from "../components/maps/MapsTab";
import DocsTab from "../components/docs/DocsTab";
import { useProjects } from "../components/projects/ProjectsContext";
import { PROJECT_TABS, type ProjectTab } from "../components/projects/projectsApi";

const TAB_META: Record<ProjectTab, { key: TranslationKey; Icon: SvgIconComponent }> = {
  tasks: { key: "nav.tasks", Icon: ViewKanbanRounded },
  maps: { key: "nav.maps", Icon: MapRounded },
  "patch-notes": { key: "nav.patchNotes", Icon: DescriptionRounded },
  docs: { key: "nav.docs", Icon: MenuBookRounded },
};

/**
 * One project, with its tools as tabs (/projects/:projectId/:tab). The sidebar
 * lists every project an admin created on the dashboard.
 */
export default function ProjectPage() {
  const { projectId, tab } = useParams();
  const { search } = useLocation();
  const navigate = useNavigate();
  const { projects } = useProjects();

  const id = Number(projectId);
  const current = (PROJECT_TABS as readonly string[]).includes(tab ?? "") ? (tab as ProjectTab) : null;
  if (!current) return <Navigate to={{ pathname: `/projects/${projectId}/${PROJECT_TABS[0]}`, search }} replace />;

  if (!projects) {
    return (
      <Container maxWidth="lg" sx={{ py: 6 }}>
        <CircularProgress />
      </Container>
    );
  }

  const project = projects.find((item) => item.id === id);
  if (!project) {
    return (
      <Container maxWidth="lg" sx={{ py: 6 }}>
        <Alert severity="warning">{t("projects.notFound")}</Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box className="page-heading">
        <Box>
          <Typography className="eyebrow">{t("nav.projects")}</Typography>
          <Typography variant="h4" sx={{ fontWeight: 800, overflowWrap: "anywhere" }}>
            {project.name}
          </Typography>
        </Box>
      </Box>

      <Tabs
        value={current}
        onChange={(_, next: ProjectTab) => navigate(`/projects/${project.id}/${next}`)}
        variant="scrollable"
        allowScrollButtonsMobile
        sx={{ mt: 2, mb: 3, borderBottom: 1, borderColor: "divider" }}
      >
        {PROJECT_TABS.map((value) => {
          const { key, Icon } = TAB_META[value];
          return <Tab key={value} value={value} label={t(key)} icon={<Icon />} iconPosition="start" />;
        })}
      </Tabs>

      {/* Keyed by project: nothing of one project survives into another's. */}
      {current === "tasks" && <TasksPage key={project.id} projectId={project.id} />}
      {current === "maps" && <MapsTab key={project.id} projectId={project.id} />}
      {current === "patch-notes" && <PatchNotesPage key={project.id} projectId={project.id} />}
      {current === "docs" && <DocsTab key={project.id} projectId={project.id} />}
    </Container>
  );
}
