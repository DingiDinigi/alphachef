import { useEffect, useRef, useState } from 'react';

// Fires once, the first time the element scrolls into view, then stops
// watching. Used to drive scroll-triggered reveal animations.
export default function useReveal(options = {}) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(node);
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px', ...options }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return [ref, visible];
}
