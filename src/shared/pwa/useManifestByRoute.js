import { useEffect } from "react";
import { isAppRoute, parsePublicBookingPath } from "../booking/publicRoutes";

const MANIFESTS = [
  { match: (path) => isAppRoute(path, "barber"), href: "/manifest-barber.json" },
  { match: (path) => isAppRoute(path, "reservar") || !!parsePublicBookingPath(path), href: "/manifest-cliente.json" },
  { match: () => true, href: "/manifest-admin.json" }, // fallback: AdminApp
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
