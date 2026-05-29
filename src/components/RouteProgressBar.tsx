import { useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";

/**
 * Thin top progress bar that tracks router transitions.
 * Gives instant visual feedback during route changes / data fetches.
 */
export function RouteProgressBar() {
  const isLoading = useRouterState({ select: (s) => s.isLoading || s.isTransitioning });
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let raf: number;
    let timeout: ReturnType<typeof setTimeout>;
    if (isLoading) {
      setVisible(true);
      setProgress(15);
      const step = () => {
        setProgress((p) => (p < 85 ? p + (85 - p) * 0.08 : p));
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    } else if (visible) {
      setProgress(100);
      timeout = setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 220);
    }
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timeout);
    };
  }, [isLoading, visible]);

  if (!visible) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] h-0.5 bg-transparent pointer-events-none">
      <div
        className="h-full bg-gradient-to-r from-[oklch(0.72_0.18_55)] via-[oklch(0.76_0.17_60)] to-[oklch(0.82_0.14_70)] shadow-[0_0_8px_oklch(0.74_0.18_60)] transition-[width] duration-200 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
