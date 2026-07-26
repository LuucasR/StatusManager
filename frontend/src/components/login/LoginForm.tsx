import { useState } from "react";
import { Button, Stack, TextField } from "@mui/material";
import { useNavigate } from "react-router-dom";

function LoginForm() {
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
const navigate = useNavigate();

const handleLogin = async () => {
        setError("");

    const response = await fetch("http://localhost:3000/auth/login", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            employeeNumber: Number(employeeNumber),
            password,
        }),
    });

const data = await response.json();

if (response.ok) {
    localStorage.setItem("token", data.token);
    navigate("/dashboard");
} else {
    setError(data.message);
}
};


  return (
    <Stack spacing={2} sx={{ mt: 4 }}>
      <TextField
        label="Número de empleado"
        value={employeeNumber}
        onChange={(e) => setEmployeeNumber(e.target.value)}
      />

      <TextField
        label="Contraseña"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
<Button
  variant="contained"
  onClick={handleLogin}
>
  Iniciar sesión
</Button>
{error && (
    <p style={{ color: "red" }}>
        {error}
    </p>
)}
    </Stack>
  );
}

export default LoginForm;