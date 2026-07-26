import { Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import RegisterPage from "./pages/RegisterPage";

export default function App() {
  const authenticated = Boolean(localStorage.getItem("token"));
  return (
    <Routes>
      <Route path="/" element={authenticated ? <Navigate to="/dashboard" /> : <LoginPage />} />
      <Route path="/registro" element={<RegisterPage />} />
      <Route path="/dashboard" element={authenticated ? <DashboardPage /> : <Navigate to="/" />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}
