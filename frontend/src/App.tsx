import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import TasksPage from "./pages/TasksPage";
import SummaryPage from "./pages/SummaryPage";
import RegisterPage from "./pages/RegisterPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ChangePasswordPage from "./pages/ChangePasswordPage";
import AppLayout from "./layouts/AppLayout";
import AppSettings from "./components/AppSettings";

/**
 * Redirect that carries the query string and hash across.
 *
 * A plain <Navigate to="/tasks"> drops them, which would silently break the
 * deep links the notification bell produces (/tareas?task=12): the user would
 * land on the board with no task open and no clue why.
 */
function LegacyRedirect({ to }: { to: string }) {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: to, search, hash }} replace />;
}

export default function App() {
  const authenticated = Boolean(localStorage.getItem("token"));
  return (
    <>
      {/* The auth screens have no app bar, so the control floats there instead.
          Without it the login page would be stuck in the default language for
          anyone who cannot read it. */}
      {!authenticated && <AppSettings floating />}
      <Routes>
      <Route path="/" element={authenticated ? <Navigate to="/dashboard" /> : <LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />

      {/* Outside AppLayout on purpose: the shell fires requests that would
          bounce with 403 and bring the user right back here. */}
      <Route path="/change-password" element={authenticated ? <ChangePasswordPage /> : <Navigate to="/" replace />} />

      {/* Pathless layout route: provides the shared AppBar and inherits the
          same guard the authenticated pages already had. */}
      <Route element={authenticated ? <AppLayout /> : <Navigate to="/" replace />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/summary" element={<SummaryPage />} />
      </Route>

      {/* Old Spanish paths, kept as redirects. They were live in production
          long enough to be bookmarked and to sit in browser history, and a
          rename alone would have turned every one of those into a bounce
          through the catch-all below. */}
      <Route path="/registro" element={<LegacyRedirect to="/register" />} />
      <Route path="/recuperar-clave" element={<LegacyRedirect to="/forgot-password" />} />
      <Route path="/tareas" element={<LegacyRedirect to="/tasks" />} />
      <Route path="/resumen" element={<LegacyRedirect to="/summary" />} />

      <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </>
  );
}
