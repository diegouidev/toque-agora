"use client";

import { useEffect } from "react";

/** Fecha um overlay/modal ao pressionar Esc. */
export function useEscClose(onClose: () => void): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
}
