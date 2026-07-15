import { useEffect } from "react";

const MANIFESTS = [
  { match: (path) => path.startsWith("/admin"), href: "/manifest-admin.json" },
  { match: (path) => path.startsWith("/barber"), href: "/manifest-barber.json" },
  { match: () => true, href: "/manifest-cliente.json" }, // fallback: ClienteApp
];

export function useManifestByRoute() {
  useEffect(() => {
    const path = window.location.pathname;
    const config = MANIFESTS.find((m) => m.match(path));

    let link = document.querySelector('link[rel="manifest"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "manifest";
      document.head.appendChild(link);
    }
    link.href = config.href;
  }, []);
}