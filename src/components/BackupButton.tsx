import { useEffect, useState } from 'react';

import { isLocalScannerAvailable, localProgramsApi, scannerSupportsBackup } from '../lib/local-programs-api';
import { exportFirestoreForBackup } from '../lib/backup-export';

type BackupStatus = 'idle' | 'running' | 'success' | 'error';

function formatSummary(firestore: Record<string, number>) {
  const parts = Object.entries(firestore)
    .filter(([, count]) => count > 0)
    .map(([name, count]) => `${count} ${name}`);
  return parts.length > 0 ? parts.join(' · ') : 'dados locais';
}

export function BackupButton() {
  const [available, setAvailable] = useState(false);
  const [status, setStatus] = useState<BackupStatus>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!isLocalScannerAvailable()) return;

    let cancelled = false;
    void localProgramsApi
      .health()
      .then((health) => {
        if (!cancelled) setAvailable(scannerSupportsBackup(health));
      })
      .catch(() => {
        if (!cancelled) setAvailable(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!isLocalScannerAvailable()) return null;

  async function runBackup() {
    setStatus('running');
    setMessage('');

    try {
      const firestore = await exportFirestoreForBackup();
      const result = await localProgramsApi.backup({ firestore });
      const fileName = result.zip_file ?? result.manifest_path.split(/[/\\]/).pop() ?? 'backup';
      setStatus('success');
      setMessage(`${formatSummary(result.firestore_collections)} → ${fileName}`);
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Falha ao gerar backup.');
    }
  }

  return (
    <div className="backup-panel">
      <button
        type="button"
        className="btn btn-ghost btn-sm backup-btn"
        disabled={!available || status === 'running'}
        onClick={() => void runBackup()}
        title={available ? 'Exporta Firestore e arquivos locais para backups/' : 'Reinicie o Iniciar.bat para ativar o backup'}
      >
        {status === 'running' ? 'Gerando backup…' : 'Fazer backup'}
      </button>
      {message ? (
        <p className={`backup-msg backup-msg--${status}`} role="status">
          {message}
        </p>
      ) : !available ? (
        <p className="backup-msg backup-msg--hint">Scanner local desatualizado</p>
      ) : null}
      <style>{`
        .backup-panel { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
        .backup-btn { width: 100%; justify-content: center; }
        .backup-msg { margin: 0; font-size: 11px; line-height: 1.35; word-break: break-word; }
        .backup-msg--success { color: var(--ok, #1f8f4e); }
        .backup-msg--error { color: var(--danger, #c0392b); }
        .backup-msg--hint { color: var(--muted); }
      `}</style>
    </div>
  );
}
