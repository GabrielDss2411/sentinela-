import { useState } from 'react';
import { fmtDistance } from '../lib/safety';
import { FACTIONS } from '../lib/zones';
import type { ProximityAlert } from '../hooks/useProximityMonitor';
import { fmtAgo, incidentPlace, incidentTitle } from '../hooks/useIncidents';

export function AlertModal({ alert, onClose }: { alert: ProximityAlert; onClose: () => void }) {
  if (alert.kind === 'incident') {
    const i = alert.incident;
    return (
      <div className="modal-bg" role="alertdialog" aria-modal="true" aria-labelledby="alert-title">
        <div className="modal alert-modal bad">
          <span className="badge">Tiroteio recente nas proximidades</span>
          <h3 id="alert-title">{incidentPlace(i)}</h3>
          <p>
            {incidentTitle(i)} · {fmtAgo(i.date)}
          </p>
          <p className="muted">
            A aproximadamente {fmtDistance(alert.distanceM)} da sua posição. Fonte: Fogo Cruzado.
          </p>
          <button className="primary" onClick={onClose} autoFocus>
            Entendi
          </button>
        </div>
      </div>
    );
  }
  const inside = alert.level === 2;
  return (
    <div className="modal-bg" role="alertdialog" aria-modal="true" aria-labelledby="alert-title">
      <div className={`modal alert-modal ${inside ? 'bad' : 'warn'}`}>
        <span className="badge">{inside ? 'Você entrou em área mapeada' : 'Área mapeada nas proximidades'}</span>
        <h3 id="alert-title">{alert.zone.name}</h3>
        <p style={{ color: FACTIONS[alert.zone.faction].color }}>Presença: {FACTIONS[alert.zone.faction].label}</p>
        <p className="muted">{inside ? 'Redobre a atenção e siga orientações locais.' : `A aproximadamente ${fmtDistance(alert.distanceM)} da sua posição.`}</p>
        <button className="primary" onClick={onClose} autoFocus>
          Entendi
        </button>
      </div>
    </div>
  );
}

const ACK_KEY = 'sentinela.disclaimer.v1';

function readAck() {
  try {
    return localStorage.getItem(ACK_KEY) === '1';
  } catch {
    return false;
  }
}

export function DisclaimerModal() {
  const [open, setOpen] = useState(() => !readAck());
  if (!open) return null;
  const accept = () => {
    try {
      localStorage.setItem(ACK_KEY, '1');
    } catch {
      /* private mode: just close */
    }
    setOpen(false);
  };
  return (
    <div className="modal-bg" role="dialog" aria-modal="true" aria-labelledby="disc-title">
      <div className="modal">
        <h3 id="disc-title">Antes de usar o Sentinela</h3>
        <p>
          O mapa reúne <b>informações públicas</b> sobre regiões do Estado do Rio de Janeiro com presença registrada de facções e
          milícias, para fins <b>informativos e de segurança pessoal</b>.
        </p>
        <p>
          O controle territorial muda o tempo todo: as áreas podem estar <b>desatualizadas ou imprecisas</b>. A pontuação das rotas é
          uma estimativa de exposição, não garantia de segurança, e não substitui orientações das autoridades.
        </p>
        <p className="muted">Uma área no mapa não é acusação contra moradores ou estabelecimentos locais.</p>
        <button className="primary" onClick={accept} autoFocus>
          Entendi, acessar o mapa
        </button>
      </div>
    </div>
  );
}
