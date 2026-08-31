import { Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import TasksPage from "./pages/TasksPage";
import SummaryPage from "./pages/SummaryPage";
import RegisterPage from "./pages/RegisterPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ChangePasswordPage from "./pages/ChangePasswordPage";
import AppLayout from "./layouts/AppLayout";

export default function App() {
  const authenticated = Boolean(localStorage.getItem("token"));
  return (
    <Routes>
      <Route path="/" element={authenticated ? <Navigate to="/dashboard" /> : <LoginPage />} />
      <Route path="/registro" element={<RegisterPage />} />
      <Route path="/recuperar-clave" element={<ForgotPasswordPage />} />

      {/* Fuera de AppLayout a proposito: el shell dispara requests que
          rebotarian con 403 y volverian a traer al usuario aca. */}
      <Route path="/change-password" element={authenticated ? <ChangePasswordPage /> : <Navigate to="/" replace />} />

      {/* Ruta de layout sin path: aporta el AppBar compartido y hereda el
          mismo guard que ya tenían las páginas autenticadas. */}
      <Route element={authenticated ? <AppLayout /> : <Navigate to="/" replace />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/tareas" element={<TasksPage />} />
        <Route path="/resumen" element={<SummaryPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}
