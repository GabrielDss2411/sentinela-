import { useEffect, useRef, useState } from 'react';
import { searchPlaces, type Place } from '../lib/geocode';
import type { LngLat } from '../lib/routing';

type Props = {
  label: string;
  dot: 'origin' | 'dest';
  value: Place | null;
  onChange: (p: Place | null) => void;
  near?: LngLat;
  onLocate?: () => void;
  active: boolean;
  onFocus: () => void;
};

export function PlaceInput({ label, dot, value, onChange, near, onLocate, active, onFocus }: Props) {
  const [text, setText] = useState(value?.label ?? '');
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const typed = useRef(false);

  useEffect(() => {
    setText(value?.label ?? '');
    typed.current = false;
  }, [value]);

  useEffect(() => {
    if (!typed.current || text.trim().length < 3) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      searchPlaces(text, near, ctrl.signal)
        .then((r) => {
          setResults(r);
          setOpen(true);
        })
        .catch(() => {});
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [text, near]);

  return (
    <div className={`place ${active ? 'active' : ''}`}>
      <span className={`dot ${dot}`} aria-hidden />
      <input
        aria-label={label}
        placeholder={label}
        value={text}
        onFocus={() => {
          onFocus();
          if (results.length) setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          typed.current = true;
          setText(e.target.value);
          if (!e.target.value) onChange(null);
        }}
      />
      {onLocate && (
        <button className="icon-btn" title="Usar minha localização" onClick={onLocate} type="button">
          ◎
        </button>
      )}
      {open && results.length > 0 && (
        <ul className="suggestions">
          {results.map((r, i) => (
            <li key={i}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(r);
                  setOpen(false);
                }}
              >
                <strong>{r.label}</strong>
                {r.detail && <span>{r.detail}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
