import {
  AddRounded,
  ArticleOutlined,
  DeleteOutlineRounded,
  EditRounded,
  SearchRounded,
} from "@mui/icons-material";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  ListSubheader,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { ApiError } from "../../api";
import type { AppOutletContext } from "../../layouts/AppLayout";
import { t, tf } from "../../i18n";
import { useOnReconnect, useSocketEvent } from "../../realtime/useSocketEvent";
import { canManageTasks } from "../roles";
import { formatCommentDate } from "../tasks/datetime";
import DocText from "./DocText";
import {
  createDoc,
  deleteDoc,
  getDoc,
  listDocs,
  updateDoc,
  type DocInput,
  type DocSummary,
  type ProjectDoc,
} from "./docsApi";

const EMPTY: DocInput = { title: "", section: "", body: "" };

/**
 * A project's GDD: design documents and notes, grouped by section. Everyone
 * reads and writes; the author or a board manager deletes.
 */
export default function DocsTab({ projectId }: { projectId: number }) {
  const { me } = useOutletContext<AppOutletContext>();
  const [searchParams, setSearchParams] = useSearchParams();
  const docId = Number(searchParams.get("doc")) || null;

  const [docs, setDocs] = useState<DocSummary[] | null>(null);
  const [doc, setDoc] = useState<ProjectDoc | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  /** null = reading; otherwise the form, for a new doc (no doc) or the open one. */
  const [draft, setDraft] = useState<DocInput | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadList = useCallback(async () => {
    try {
      setDocs(await listDocs(projectId));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [projectId]);

  const loadDoc = useCallback(async () => {
    if (!docId) {
      setDoc(null);
      return;
    }
    try {
      setDoc(await getDoc(docId));
    } catch (err) {
      setDoc(null);
      setError((err as Error).message);
    }
  }, [docId]);

  useEffect(() => {
    void loadList();
  }, [loadList]);
  useEffect(() => {
    void loadDoc();
  }, [loadDoc]);

  // Somebody else's save shows up here, unless this person is mid-edit: their
  // own save then meets the conflict check instead of losing what they typed.
  useSocketEvent<{ projectId: number; docId: number }>("docs:changed", (payload) => {
    if (payload.projectId !== projectId) return;
    void loadList();
    if (payload.docId === docId && !draft) void loadDoc();
  });
  useOnReconnect(() => {
    void loadList();
    if (!draft) void loadDoc();
  });

  const sections = useMemo(
    () => [...new Set((docs ?? []).map((item) => item.section).filter(Boolean))].sort(),
    [docs]
  );

  const grouped = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const visible = (docs ?? []).filter(
      (item) =>
        !needle ||
        item.title.toLowerCase().includes(needle) ||
        item.section.toLowerCase().includes(needle)
    );
    const groups = new Map<string, DocSummary[]>();
    for (const item of visible) {
      const key = item.section || "";
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    // Unsectioned last.
    return [...groups.entries()].sort(([a], [b]) => (!a ? 1 : !b ? -1 : a.localeCompare(b)));
  }, [docs, query]);

  function open(id: number) {
    setDraft(null);
    setCreating(false);
    setSearchParams({ doc: String(id) }, { replace: true });
  }

  function startNew() {
    setCreating(true);
    setDraft(EMPTY);
  }

  function startEdit() {
    if (!doc) return;
    setCreating(false);
    setDraft({ title: doc.title, section: doc.section, body: doc.body });
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError("");
    try {
      const input = { ...draft, title: draft.title.trim(), section: draft.section.trim() };
      const saved = creating ? await createDoc(projectId, input) : await updateDoc(doc!.id, input, doc!.updatedAt);
      setDraft(null);
      setCreating(false);
      setDoc(saved);
      setSearchParams({ doc: String(saved.id) }, { replace: true });
      await loadList();
    } catch (err) {
      // Kept in the form either way: what they typed must not be lost.
      setError(
        err instanceof ApiError && err.code === "DOC_EDIT_CONFLICT"
          ? t("docs.conflict")
          : (err as Error).message
      );
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!doc || !window.confirm(tf("docs.confirmDelete", { title: doc.title }))) return;
    try {
      await deleteDoc(doc.id);
      setSearchParams({}, { replace: true });
      setDoc(null);
      await loadList();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (!docs) {
    return error ? <Alert severity="error">{error}</Alert> : <CircularProgress />;
  }

  const canDelete = doc && me && (doc.createdById === me.id || canManageTasks(me.role));

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "300px minmax(0, 1fr)" },
          alignItems: "start",
        }}
      >
        <Paper className="status-card" elevation={0} sx={{ p: 1.5 }}>
          <Stack spacing={1}>
            <Button variant="contained" startIcon={<AddRounded />} onClick={startNew} disabled={Boolean(draft)}>
              {t("docs.new")}
            </Button>
            <TextField
              size="small"
              placeholder={t("docs.search")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchRounded fontSize="small" />
                    </InputAdornment>
                  ),
                },
              }}
            />
          </Stack>

          {docs.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2, px: 1 }}>
              {t("docs.empty")}
            </Typography>
          ) : (
            <List dense sx={{ mt: 1, maxHeight: { md: "65vh" }, overflowY: "auto" }}>
              {grouped.map(([section, items]) => (
                <Box key={section || "-"}>
                  <ListSubheader disableSticky sx={{ bgcolor: "transparent", lineHeight: "28px", fontWeight: 700 }}>
                    {section || t("docs.noSection")}
                  </ListSubheader>
                  {items.map((item) => (
                    <ListItemButton
                      key={item.id}
                      selected={item.id === docId && !creating}
                      onClick={() => open(item.id)}
                      sx={{ borderRadius: "8px" }}
                    >
                      <ArticleOutlined fontSize="small" sx={{ mr: 1, color: "text.secondary" }} />
                      <ListItemText
                        primary={item.title}
                        slotProps={{ primary: { noWrap: true } }}
                      />
                    </ListItemButton>
                  ))}
                </Box>
              ))}
            </List>
          )}
        </Paper>

        <Paper className="status-card" elevation={0} sx={{ p: { xs: 2, md: 3 }, minHeight: 320 }}>
          {draft ? (
            <Stack spacing={2}>
              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                {creating ? t("docs.new") : t("docs.edit")}
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                <TextField
                  label={t("docs.title")}
                  value={draft.title}
                  onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                  required
                  autoFocus
                  slotProps={{ htmlInput: { maxLength: 160 } }}
                  sx={{ flex: 2 }}
                />
                <Autocomplete
                  freeSolo
                  options={sections}
                  value={draft.section}
                  onInputChange={(_, value) => setDraft({ ...draft, section: value })}
                  renderInput={(params) => (
                    <TextField {...params} label={t("docs.section")} helperText={t("docs.sectionHint")} />
                  )}
                  sx={{ flex: 1 }}
                />
              </Stack>
              <TextField
                label={t("docs.body")}
                value={draft.body}
                onChange={(event) => setDraft({ ...draft, body: event.target.value })}
                multiline
                minRows={14}
                helperText={t("docs.formatHint")}
                slotProps={{
                  htmlInput: { maxLength: 50000, style: { fontFamily: "ui-monospace, monospace", fontSize: 14 } },
                }}
              />
              <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
                <Button
                  onClick={() => {
                    setDraft(null);
                    setCreating(false);
                  }}
                >
                  {t("common.cancel")}
                </Button>
                <Button variant="contained" onClick={() => void save()} disabled={saving || !draft.title.trim()}>
                  {saving ? t("common.saving") : t("maps.save")}
                </Button>
              </Stack>
            </Stack>
          ) : doc ? (
            <Box>
              <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  {doc.section && (
                    <Typography className="eyebrow" sx={{ mb: 0.5 }}>
                      {doc.section}
                    </Typography>
                  )}
                  <Typography variant="h5" sx={{ fontWeight: 800, overflowWrap: "anywhere" }}>
                    {doc.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {tf("docs.lastEdit", { name: doc.updatedByName, date: formatCommentDate(doc.updatedAt) })}
                  </Typography>
                </Box>
                <Button startIcon={<EditRounded />} onClick={startEdit}>
                  {t("common.edit")}
                </Button>
                {canDelete && (
                  <Button color="error" startIcon={<DeleteOutlineRounded />} onClick={() => void remove()}>
                    {t("common.delete")}
                  </Button>
                )}
              </Stack>
              <Box sx={{ mt: 2 }}>
                {doc.body.trim() ? (
                  <DocText source={doc.body} />
                ) : (
                  <Typography color="text.secondary">{t("docs.emptyBody")}</Typography>
                )}
              </Box>
            </Box>
          ) : (
            <Typography color="text.secondary">{t("docs.pick")}</Typography>
          )}
        </Paper>
      </Box>
    </Box>
  );
}
