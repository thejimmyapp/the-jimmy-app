import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const rewriteBlocksRoute = (url: string | undefined) => {
  if (!url) return url;
  const queryIndex = url.indexOf("?");
  const pathname = queryIndex === -1 ? url : url.slice(0, queryIndex);
  const search = queryIndex === -1 ? "" : url.slice(queryIndex);
  return pathname.replace(/\/+$/, "") === "/blocks" ? `/blocks/index.html${search}` : url;
};

const blocksRoute = (): Plugin => {
  const installRewrite = (middlewares: {
    use: (handler: (request: { url?: string }, response: unknown, next: () => void) => void) => void;
  }) => {
    middlewares.use((request, _response, next) => {
      request.url = rewriteBlocksRoute(request.url);
      next();
    });
  };

  return {
    name: "thejimmyapp-blocks-route",
    configureServer: (server) => installRewrite(server.middlewares),
    configurePreviewServer: (server) => installRewrite(server.middlewares),
  };
};

export default defineConfig({
  plugins: [blocksRoute(), react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8000",
      "/health": "http://127.0.0.1:8000",
      "/puzzle-move": "http://127.0.0.1:8000",
      "/puzzle-next-move": "http://127.0.0.1:8000",
      "/puzzle-solution": "http://127.0.0.1:8000",
      "/ws": { target: "ws://127.0.0.1:8000", ws: true },
    },
  },
});
