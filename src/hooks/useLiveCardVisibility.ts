import { useEffect, useRef, useState } from 'react';

/**
 * Live widgets should not poll an API for every historical message.
 * They subscribe only while they are on screen (with a small prefetch margin).
 * On older WebViews without IntersectionObserver we gracefully remain enabled.
 */
export function useLiveCardVisibility<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(entries => {
      setVisible(entries.some(entry => entry.isIntersecting));
    }, { rootMargin: '180px 0px', threshold: 0 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { cardRef: ref, cardVisible: visible };
}
