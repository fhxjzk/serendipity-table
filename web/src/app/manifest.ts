// F-40: installable to the home screen (an iPhone receives web push only after installing).
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "우연한 식탁",
    short_name: "우연한 식탁",
    description: "매주 목요일 저녁, 처음 보는 사람들과 좋은 저녁 한 끼",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    background_color: "#f6f1ea",
    theme_color: "#18120e",
    lang: "ko",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
