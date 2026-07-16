import useReveal from '../hooks/useReveal';

// Wraps any content and fades/slides it up into place the first time it
// scrolls into view. `delay` (seconds) staggers items in a list.
export default function Reveal({ children, delay = 0, y = 24, style = {}, ...rest }) {
  const [ref, visible] = useReveal();
  return (
    <div
      ref={ref}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : `translateY(${y}px)`,
        transition: `opacity 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s, transform 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s`,
        willChange: 'opacity, transform',
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
