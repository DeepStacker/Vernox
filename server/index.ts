/** Node entry point for the API (Docker / local). Routing lives in ./apiRouter. */
import http from 'http';
import { handleApiRequest } from './apiRouter';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

const server = http.createServer((req, res) => {
  void handleApiRequest(req, res);
});
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Vernox API server listening on http://0.0.0.0:${PORT}`);
  console.log(`   Firestore Emulator: ${process.env.FIRESTORE_EMULATOR_HOST || 'Live Google Cloud'}`);
});
