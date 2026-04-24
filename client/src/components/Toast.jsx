import { useState, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react'

const Toast = forwardRef(function Toast(_, ref) {
  const [state, setState] = useState({ msg: '', visible: false })
  const timerRef = { current: null }

  const show = useCallback((msg, duration = 3000) => {
    clearTimeout(timerRef.current)
    setState({ msg, visible: true })
    timerRef.current = setTimeout(() => setState(s => ({ ...s, visible: false })), duration)
  }, [])

  useImperativeHandle(ref, () => ({ show }), [show])

  return (
    <div style={{
      position: 'fixed', top: '2rem', left: '50%', transform: 'translateX(-50%)',
      background: 'var(--amber)', color: '#000', padding: '0.7rem 1.5rem',
      borderRadius: '100px', fontWeight: 700, fontSize: '0.85rem',
      zIndex: 1000, pointerEvents: 'none',
      transition: 'opacity 0.3s, transform 0.3s',
      opacity: state.visible ? 1 : 0,
      transform: `translateX(-50%) translateY(${state.visible ? 0 : '-8px'})`,
    }}>
      {state.msg}
    </div>
  )
})

export default Toast
