import type { NextConfig } from "next";

// basePath para GitHub Pages (https://carlosmundaray1.github.io/tradingview-free/).
// En dev local el basePath molesta para assets relativos, así que lo
// dejamos vacío cuando NO es producción (GitHub Actions setea NEXT_PUBLIC_BASE_PATH).
const isProdExport = process.env.NODE_ENV === "production";
const basePath = isProdExport ? process.env.NEXT_PUBLIC_BASE_PATH ?? "" : "";

const nextConfig: NextConfig = {
  // Genera un build estático (out/) que se puede servir desde GitHub Pages,
  // CDN, o embeber en un APK de Capacitor.
  output: "export",
  basePath,
  // GitHub Pages sirve bajo /tradingview-free/, los trailing slash evitan
  // redirecciones rotas y aseguran que las rutas estáticas resuelvan.
  trailingSlash: true,
  images: {
    // Sin loader de imagen en static export: usamos <img> normal con URLs externas
    unoptimized: true,
  },
  // Permite HMR y conexiones desde la IP local (para probar en el celu / LAN).
  // Sin esto, Next bloquea requests desde hosts distintos a localhost por
  // seguridad (DNS rebinding protection).
  allowedDevOrigins: ["http://192.168.2.131:3007", "http://0.0.0.0:3007"],
};

export default nextConfig;
