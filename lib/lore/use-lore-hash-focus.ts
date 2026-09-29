"use client";

import { useEffect, useRef, useState } from "react";
import { loreCardElementId, parseLoreHash } from "@/lib/lore/promotion-provenance";

export function useLoreHashFocus({ ready, cardIds }: { ready: boolean; cardIds: string[] }): {
  highlightedId: string | null;
  notFound: boolean;
} {
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const processedHashRef = useRef<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!ready) return;
    const hash = window.location.hash;
    if (hash === processedHashRef.current) return;
    const id = parseLoreHash(hash);
    if (!id) return;
    processedHashRef.current = hash;
    if (!cardIds.includes(id)) {
      setNotFound(true);
      return;
    }
    const element = document.getElementById(loreCardElementId(id));
    if (!element) {
      setNotFound(true);
      return;
    }
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    setNotFound(false);
    element.scrollIntoView({ block: "center" });
    setHighlightedId(id);
    timeoutRef.current = setTimeout(() => {
      setHighlightedId(null);
      timeoutRef.current = null;
    }, 3000);
  }, [ready, cardIds]);

  useEffect(() => () => {
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
  }, []);

  return { highlightedId, notFound };
}
