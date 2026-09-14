import { useEffect } from 'react';

/** Conta dos setores: só o quadro, sem menu do Estoque. */
export function DesenvOnlyPage() {
  useEffect(() => {
    if (!window.location.pathname.startsWith('/desenv-board')) {
      window.location.replace('/desenv-board/');
    }
  }, []);

  return (
    <div className="desenv-only-page">
      <iframe title="Desenvolvimentos" src="/desenv-board/index.html" />
      <style>{`
        .desenv-only-page { min-height: 100vh; margin: 0; background: #0e1218; }
        .desenv-only-page iframe { display: block; width: 100%; height: 100vh; border: 0; background: #0e1218; }
      `}</style>
    </div>
  );
}

export function DesenvolvimentosPage() {
  return (
    <div className="tecelagem-embed">
      <iframe title="Desenvolvimentos" src="/desenv-board/index.html" />
    </div>
  );
}
