import { speak, unlockAudio } from '../lib/alerts';
import { fmtDistance } from '../lib/safety';
import { FACTIONS } from '../lib/zones';
import type { MonitorOptions, MonitorState } from '../hooks/useProximityMonitor';

const RADII = [500, 1000, 2000];

type Props = {
  state: MonitorState & { active: boolean };
  opts: MonitorOptions;
  onOpts: (o: MonitorOptions) => void;
  onStart: () => void;
  onStop: () => void;
};

const ICON: Record<MonitorState['status'], string> = {
  off: '🛡️',
  starting: '📡',
  nogps: '⚠️',
  far: '📡',
  near: '⚠️',
  inside: '⚠️',
};

function headline(s: MonitorState) {
  switch (s.status) {
    case 'off':
      return { title: 'Alerta desligado', sub: 'Ative para ser avisado ao se aproximar de uma área mapeada.' };
    case 'starting':
      return { title: 'Monitorando…', sub: 'Obtendo sua posição' };
    case 'nogps':
      return { title: 'Sem sinal de GPS', sub: 'Verifique as permissões de localização do navegador.' };
    case 'inside':
      return { title: 'Dentro de área mapeada', sub: s.nearest ? `${s.nearest.zone.name} · ${FACTIONS[s.nearest.zone.faction].label}` : '' };
    case 'near':
      return {
        title: `Área mapeada a ${fmtDistance(s.nearest?.distanceM ?? 0)}`,
        sub: s.nearest ? `${s.nearest.zone.name} · ${FACTIONS[s.nearest.zone.faction].label} · ${s.inRadius} área(s) no raio` : '',
      };
    case 'far':
      return {
        title: 'Monitorando · nenhuma área no raio',
        sub: s.nearest ? `Mais próxima: ${s.nearest.zone.name} a ${fmtDistance(s.nearest.distanceM)}` : 'Nenhuma área num raio de 3 km',
      };
  }
}

export function MonitorPanel({ state, opts, onOpts, onStart, onStop }: Props) {
  const h = headline(state);
  return (
    <section className="monitor">
      <div className="mon-head">
        <span className={`mon-ring ${state.status}`}>{ICON[state.status]}</span>
        <div>
          <strong>{h.title}</strong>
          <span>{h.sub}</span>
        </div>
      </div>

      <button className={`primary ${state.active ? 'stop' : ''}`} onClick={state.active ? onStop : onStart}>
        {state.active ? 'Desativar alerta' : 'Ativar alerta de proximidade'}
      </button>

      <div>
        <h2>Raio de alerta</h2>
        <div className="segmented" role="radiogroup" aria-label="Raio de alerta">
          {RADII.map((r) => (
            <button key={r} role="radio" aria-checked={opts.radiusM === r} className={opts.radiusM === r ? 'on' : ''} onClick={() => onOpts({ ...opts, radiusM: r })}>
              {fmtDistance(r)}
            </button>
          ))}
        </div>
      </div>

      <div className="toggles">
        <label>
          <input type="checkbox" checked={opts.vibration} onChange={(e) => onOpts({ ...opts, vibration: e.target.checked })} /> Vibração
        </label>
        <label>
          <input
            type="checkbox"
            checked={opts.beeps}
            onChange={(e) => {
              if (e.target.checked) unlockAudio();
              onOpts({ ...opts, beeps: e.target.checked });
            }}
          />{' '}
          Bipes
        </label>
        <label>
          <input
            type="checkbox"
            checked={opts.voice}
            onChange={(e) => {
              // Speaking once here, inside the click, unlocks speech for later alerts.
              if (e.target.checked) {
                unlockAudio();
                speak('Alerta por voz ativado.');
              }
              onOpts({ ...opts, voice: e.target.checked });
            }}
          />{' '}
          Voz
        </label>
      </div>
      {opts.voice && <p className="hint">A voz só avisa a 500 m ou menos, no máximo uma vez a cada 10 min por área.</p>}
      {state.active && (
        <p className="hint">Mantenha a tela ligada: em segundo plano o navegador pausa o GPS.</p>
      )}
    </section>
  );
}
