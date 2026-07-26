import { AccessTimeRounded, AdminPanelSettingsRounded, DownloadRounded, LogoutRounded, UpdateRounded } from "@mui/icons-material";
import { Alert, AppBar, Box, Button, Chip, Container, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, MenuItem, Paper, Select, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Toolbar, Typography } from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import { api, API_URL } from "../api";

type Status = "AVAILABLE" | "WORKING" | "BREAK" | "LUNCH" | "MEETING" | "OFFLINE";
type Employee = { id: number; employeeNumber: number; name: string; email?: string; role?: "EMPLOYEE" | "ADMIN"; currentStatus: Status; statusSince: string; active?: boolean };
type History = { id: number; status: Status; detail: string; startedAt: string; endedAt: string | null };
const labels: Record<Status, string> = { AVAILABLE: "Disponible", WORKING: "Trabajando", BREAK: "Descanso", LUNCH: "Almuerzo", MEETING: "Reunión", OFFLINE: "Desconectado" };
const colors: Record<Status, "success" | "primary" | "warning" | "secondary" | "info" | "default"> = { AVAILABLE: "success", WORKING: "primary", BREAK: "warning", LUNCH: "secondary", MEETING: "info", OFFLINE: "default" };

function elapsed(since: string, now: number) {
  const seconds = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  const h = Math.floor(seconds / 3600); const m = Math.floor((seconds % 3600) / 60); const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function DashboardPage() {
  const [me, setMe] = useState<Employee | null>(null);
  const [history, setHistory] = useState<History[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [now, setNow] = useState(Date.now());
  const [dialog, setDialog] = useState(false);
  const [status, setStatus] = useState<Status>("WORKING");
  const [detail, setDetail] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const current = await api<Employee>("/activities/me");
    setMe(current);
    setHistory(await api<History[]>("/activities/history"));
    if (current.role === "ADMIN") setEmployees(await api<Employee[]>("/admin/employees"));
  }, []);

  useEffect(() => { load().catch((e) => setError(e.message)); const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [load]);
  useEffect(() => {
    const socket = io(API_URL, { auth: { token: localStorage.getItem("token") } });
    socket.on("status:changed", () => load());
    return () => { socket.disconnect(); };
  }, [load]);
  const duration = useMemo(() => me ? elapsed(me.statusSince, now) : "00:00:00", [me, now]);

  async function changeStatus() {
    try {
      await api("/activities/status", { method: "POST", body: JSON.stringify({ status, detail }) });
      setDialog(false); setDetail(""); await load();
    } catch (err) { setError((err as Error).message); }
  }
  async function downloadReport() {
    const response = await fetch(`${API_URL}/admin/report.pdf`, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });
    const blob = await response.blob(); const href = URL.createObjectURL(blob); const anchor = document.createElement("a");
    anchor.href = href; anchor.download = "reporte-actividades.pdf"; anchor.click(); URL.revokeObjectURL(href);
  }
  async function downloadPersonalReport() {
    const response = await fetch(`${API_URL}/activities/report.pdf`, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });
    const blob = await response.blob(); const href = URL.createObjectURL(blob); const anchor = document.createElement("a");
    anchor.href = href; anchor.download = "mi-registro-de-actividades.pdf"; anchor.click(); URL.revokeObjectURL(href);
  }
  async function approve(id: number) { await api(`/admin/employees/${id}/approve`, { method: "PATCH" }); await load(); }
  function logout() { localStorage.removeItem("token"); window.location.href = "/"; }

  return (
    <Box>
      <AppBar color="inherit" elevation={0} position="sticky"><Toolbar><Box className="brand-mark small"><AccessTimeRounded /></Box><Typography variant="h6" sx={{ flex: 1 }}>Status Manager</Typography><Typography variant="body2" color="text.secondary">{me?.name} · #{me?.employeeNumber}</Typography><Button color="inherit" onClick={logout} startIcon={<LogoutRounded />}>Salir</Button></Toolbar></AppBar>
      <Container maxWidth="xl" sx={{ py: 4 }}>
        {error && <Alert severity="error" onClose={() => setError("")} sx={{ mb: 3 }}>{error}</Alert>}
        <Box className="page-heading"><Box><Typography className="eyebrow">MI JORNADA</Typography><Typography variant="h3">Hola, {me?.name?.split(" ")[0]}</Typography><Typography color="text.secondary">Mantené tu actividad actualizada para que el equipo esté conectado.</Typography></Box><Button variant="contained" size="large" startIcon={<UpdateRounded />} onClick={() => setDialog(true)}>Cambiar estado</Button></Box>
        <Box className="status-grid">
          <Paper className="status-card" elevation={0}><Typography color="text.secondary">Estado actual</Typography><Stack direction="row" spacing={1.5} sx={{ alignItems: "center", mt: 2 }}><span className={`status-dot ${me?.currentStatus.toLowerCase()}`} /><Typography variant="h4">{me ? labels[me.currentStatus] : "—"}</Typography></Stack></Paper>
          <Paper className="status-card accent" elevation={0}><Typography color="text.secondary">Tiempo transcurrido</Typography><Typography className="timer">{duration}</Typography><Typography variant="caption" color="text.secondary">desde {me ? new Date(me.statusSince).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) : "—"}</Typography></Paper>
        </Box>
        {me?.role === "ADMIN" && <><Box className="section-title"><Box><Typography className="eyebrow">PANEL ADMINISTRADOR</Typography><Typography variant="h4">Equipo en vivo</Typography></Box><Button startIcon={<DownloadRounded />} onClick={downloadReport}>Descargar PDF</Button></Box><Box className="employee-grid">{employees.map((employee) => <Paper className="employee-card" elevation={0} key={employee.id}><Stack direction="row" sx={{ justifyContent: "space-between" }}><Box><Typography sx={{ fontWeight: 700 }}>{employee.name}</Typography><Typography variant="caption" color="text.secondary">#{employee.employeeNumber}</Typography></Box>{employee.active ? <Chip color={colors[employee.currentStatus]} label={labels[employee.currentStatus]} size="small" /> : <Chip color="warning" label="Pendiente" size="small" />}</Stack>{employee.active ? <Typography className="mini-timer">{elapsed(employee.statusSince, now)}</Typography> : <Button sx={{ mt: 3 }} fullWidth variant="outlined" startIcon={<AdminPanelSettingsRounded />} onClick={() => approve(employee.id)}>Aprobar alta</Button>}</Paper>)}</Box></>}
        <Box className="section-title"><Box><Typography className="eyebrow">ACTIVIDAD RECIENTE</Typography><Typography variant="h4">Tu historial</Typography></Box><Button startIcon={<DownloadRounded />} onClick={downloadPersonalReport}>Mi registro PDF</Button></Box>
        <Paper className="table-card" elevation={0}><Table><TableHead><TableRow><TableCell>Estado</TableCell><TableCell>Detalle</TableCell><TableCell>Inicio</TableCell><TableCell>Duración</TableCell></TableRow></TableHead><TableBody>{history.map((item) => <TableRow key={item.id}><TableCell><Chip size="small" color={colors[item.status]} label={labels[item.status]} /></TableCell><TableCell>{item.detail}</TableCell><TableCell>{new Date(item.startedAt).toLocaleString("es-AR")}</TableCell><TableCell>{elapsed(item.startedAt, item.endedAt ? new Date(item.endedAt).getTime() : now)}</TableCell></TableRow>)}</TableBody></Table></Paper>
      </Container>
      <Dialog open={dialog} onClose={() => setDialog(false)} fullWidth maxWidth="sm"><DialogTitle>Actualizar estado</DialogTitle><DialogContent><Stack spacing={2.5} sx={{ mt: 1 }}><FormControl fullWidth><InputLabel>Nuevo estado</InputLabel><Select label="Nuevo estado" value={status} onChange={(e) => setStatus(e.target.value as Status)}>{Object.entries(labels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</Select></FormControl><TextField label="¿Qué estás haciendo?" placeholder="El detalle es obligatorio" value={detail} onChange={(e) => setDetail(e.target.value)} multiline minRows={3} /></Stack></DialogContent><DialogActions><Button onClick={() => setDialog(false)}>Cancelar</Button><Button variant="contained" disabled={detail.trim().length < 3} onClick={changeStatus}>Guardar cambio</Button></DialogActions></Dialog>
    </Box>
  );
}
