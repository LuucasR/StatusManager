import { Alert, CircularProgress, Container } from "@mui/material";
import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { getMap } from "./mapsApi";

/**
 * /maps/:mapId, where the MAP_* notifications point: maps live inside a
 * project, so this finds which one and opens the map there.
 */
export default function MapRedirect() {
  const { mapId } = useParams();
  const [target, setTarget] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const id = Number(mapId);
    getMap(id)
      .then((map) => setTarget(`/projects/${map.projectId}/maps?map=${map.id}`))
      .catch((err: Error) => setError(err.message));
  }, [mapId]);

  if (target) return <Navigate to={target} replace />;
  return (
    <Container maxWidth="lg" sx={{ py: 6 }}>
      {error ? <Alert severity="warning">{error}</Alert> : <CircularProgress />}
    </Container>
  );
}
