import { Typography } from "@mui/material";

interface HeaderProps {
  title: string;
}

function Header({ title }: HeaderProps) {
  return (
    <Typography variant="h3" sx={{ mt: 4 }}>
      {title}
    </Typography>
  );
}

export default Header;