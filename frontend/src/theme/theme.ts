import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  palette: { mode: "light", primary: { main: "#5b5ce2" }, background: { default: "#f5f6fa", paper: "#fff" }, text: { primary: "#17182f", secondary: "#6d7087" } },
  typography: { fontFamily: '"Inter", "Segoe UI", sans-serif', h2: { fontWeight: 800, letterSpacing: "-0.045em" }, h3: { fontWeight: 750, letterSpacing: "-0.035em" }, h4: { fontWeight: 750, letterSpacing: "-0.025em" }, button: { fontWeight: 700, textTransform: "none" } },
  shape: { borderRadius: 14 },
  components: { MuiButton: { styleOverrides: { root: { borderRadius: 10, paddingInline: 20 } } }, MuiPaper: { styleOverrides: { root: { border: "1px solid #e8e9f1" } } }, MuiTextField: { defaultProps: { fullWidth: true } } },
});
export default theme;
