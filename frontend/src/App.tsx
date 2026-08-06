import { Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import TasksPage from "./pages/TasksPage";
import RegisterPage from "./pages/RegisterPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import AppLayout from "./layouts/AppLayout";

export default function App() {
  const authenticated = Boolean(localStorage.getItem("token"));
  return (
    <Routes>
      <Route path="/" element={authenticated ? <Navigate to="/dashboard" /> : <LoginPage />} />
      <Route path="/registro" element={<RegisterPage />} />
      <Route path="/recuperar-clave" element={<ForgotPasswordPage />} />

      {/* Ruta de layout sin path: aporta el AppBar compartido y hereda el
          mismo guard que ya tenían las páginas autenticadas. */}
      <Route element={authenticated ? <AppLayout /> : <Navigate to="/" replace />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/tareas" element={<TasksPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}
