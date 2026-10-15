import {
  AddRounded,
  DeleteOutlineRounded,
  EditRounded,
  FolderRounded,
  OpenInNewRounded,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { t, tf } from "../../i18n";
import { useProjects } from "./ProjectsContext";
import { createProject, deleteProject, renameProject, type Project } from "./projectsApi";

/**
 * The admin's place to add company projects. Each one becomes an entry of the
 * sidebar, with its tools (Maps so far) as tabs inside.
 */
export default function ProjectsAdminCard() {
  const navigate = useNavigate();
  const { projects, reload } = useProjects();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError("");
    try {
      await createProject(name.trim());
      setName("");
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function rename(project: Project) {
    const next = window.prompt(t("projects.renamePrompt"), project.name)?.trim();
    if (!next || next === project.name) return;
    try {
      await renameProject(project.id, next);
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove(project: Project) {
    const question = project.mapsCount
      ? tf("projects.confirmDeleteWithMaps", { name: project.name, count: project.mapsCount })
      : tf("projects.confirmDelete", { name: project.name });
    if (!window.confirm(question)) return;
    try {
      await deleteProject(project.id);
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Paper className="status-card" elevation={0} sx={{ mb: 3 }}>
      <Typography variant="h6" sx={{ fontWeight: 800 }}>
        {t("projects.title")}
      </Typography>
      <Typography color="text.secondary" variant="body2" sx={{ mt: 0.5 }}>
        {t("projects.subtitle")}
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      <Stack component="form" onSubmit={add} direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mt: 2 }}>
        <TextField
          size="small"
          label={t("projects.name")}
          value={name}
          onChange={(event) => setName(event.target.value)}
          slotProps={{ htmlInput: { maxLength: 80 } }}
          sx={{ flex: 1 }}
        />
        <Button type="submit" variant="contained" startIcon={<AddRounded />} disabled={saving || !name.trim()}>
          {t("projects.add")}
        </Button>
      </Stack>

      {projects && projects.length === 0 && (
        <Typography color="text.secondary" variant="body2" sx={{ mt: 2 }}>
          {t("projects.empty")}
        </Typography>
      )}

      {projects && projects.length > 0 && (
        <List dense sx={{ mt: 1 }}>
          {projects.map((project) => (
            <ListItem
              key={project.id}
              disableGutters
              secondaryAction={
                <Box>
                  <Tooltip title={t("projects.open")}>
                    <IconButton size="small" onClick={() => navigate(`/projects/${project.id}/tasks`)}>
                      <OpenInNewRounded fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={t("common.edit")}>
                    <IconButton size="small" onClick={() => void rename(project)}>
                      <EditRounded fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={t("common.delete")}>
                    <IconButton size="small" onClick={() => void remove(project)}>
                      <DeleteOutlineRounded fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              }
            >
              <ListItemIcon sx={{ minWidth: 36 }}>
                <FolderRounded fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary={project.name}
                secondary={tf("projects.counts", { tasks: project.tasksCount, maps: project.mapsCount })}
                sx={{ pr: 14 }}
              />
            </ListItem>
          ))}
        </List>
      )}
    </Paper>
  );
}
