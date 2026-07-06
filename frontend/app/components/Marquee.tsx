"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Mostra um texto; se ele for maior que o espaço E `active` for true, desliza
 * (ping-pong) para revelar o fim, respeitando "reduzir movimento". Caso
 * contrário, comporta-se como um texto truncado normal (…).
 */
export default function Marquee({
  text,
  active = false,
  className = "",
}: {
  text: string;
  active?: boolean;
  className?: string;
}) {
  const outerRef = useRef<HTMLSpanElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const measure = () => {
      const diff = inner.scrollWidth - outer.clientWidth;
      setOverflow(diff > 4 ? diff : 0);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(outer);
    return () => ro.disconnect();
  }, [text]);

  const animate = active && overflow > 0;
  // ~25px por segundo + margem para as pausas nas pontas.
  const dur = Math.max(6, Math.round(overflow / 25) + 6);

  return (
    <span ref={outerRef} className={`block overflow-hidden ${className}`}>
      <span
        ref={innerRef}
        className={animate ? "marquee-anim" : "block truncate"}
        style={
          animate
            ? {
                ["--shift" as string]: `-${overflow + 12}px`,
                ["--dur" as string]: `${dur}s`,
              }
            : undefined
        }
      >
        {text}
      </span>
    </span>
  );
}
