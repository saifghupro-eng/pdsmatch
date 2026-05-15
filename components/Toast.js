// components/Toast.js
import { useState, useEffect, useCallback } from 'react';

let _addToast = null;

export function toast(msg) {
  if (_addToast) _addToast(msg);
}

export default function Toast() {
  const [toasts, setToasts] = useState([]);

  const add = useCallback((msg) => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000);
  }, []);

  useEffect(() => { _addToast = add; return () => { _addToast = null; }; }, [add]);

  return (
    <div className="toast-wrap">
      {toasts.map(t => <div key={t.id} className="toast">{t.msg}</div>)}
    </div>
  );
}
