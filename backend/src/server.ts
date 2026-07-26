import "dotenv/config";
import { createServer } from "node:http";
import app from "./app";
import { initializeRealtime } from "./realtime";

const PORT = Number(process.env.PORT ?? 3000);
const server = createServer(app);
initializeRealtime(server);
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
