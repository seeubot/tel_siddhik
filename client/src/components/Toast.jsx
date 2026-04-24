
import React, { 
  useState, 
  useImperativeHandle, 
  forwardRef, 
  useCallback, 
  useRef, 
  useEffect 
} from 'react';

const Toast = forwardRef((props, ref) => {
  const [state, setState] = useState({ msg: '', visible: false });
  const timerRef = useRef(null);

  const show = useCallback((msg, duration = 3000) => {
    // Prevent memory leaks by clearing existing timers
    if (timerRef.current) clearTimeout(timerRef.current);
    
    setState({ msg, visible: true });
    
    timerRef.current = setTimeout(() => {
      setState(prev => ({ ...prev, visible: false }));
    }, duration);
  }, []);

  // Ensure timer is destroyed if component unmounts
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useImperativeHandle(ref, () => ({ show }), [show]);

  if (!state.msg) return null;

  const style = {
    position: 'fixed',
    top: '2rem',
    left: '50%',
    zIndex: 9999,
    pointerEvents: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    
    // Animation Logic
    transition: 'opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1), transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
    opacity: state.visible ? 1 : 0,
    transform: `translateX(-50%) translateY(${state.visible ? '0px' : '-12px'})`,
    
    // Aesthetic Styling
    background: '#ffffff',
    color: '#000000',
    padding: '0.75rem 1.75rem',
    borderRadius: '100px',
    fontSize: '0.85rem',
    fontWeight: '800',
    letterSpacing: '-0.01em',
    whiteSpace: 'nowrap',
    boxShadow: '0 10px 30px -5px rgba(0, 0, 0, 0.5), 0 0 20px rgba(255, 255, 255, 0.2)',
  };

  return (
    <div style={style} role="alert">
      {state.msg}
    </div>
  );
});

export default Toast;
