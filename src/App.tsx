import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { Layout } from './components/Layout';
import { useAuth } from './hooks/useAuth';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { MonthlyReportsPage } from './pages/MonthlyReportsPage';
import { PartsPage } from './pages/PartsPage';
import { ReportsPage } from './pages/ReportsPage';
import { WithdrawalsPage } from './pages/WithdrawalsPage';
import { DesenvControleLayout } from './pages/dev/DesenvControleLayout';
import { DevControleWorkPage } from './pages/dev/DevControleWorkPage';
import { DesenvCadastroPage } from './pages/dev/DesenvCadastroPage';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <div className="loader">Carregando…</div>;
  if (!user) return <LoginPage />;

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="pecas" element={<PartsPage />} />
          <Route path="retiradas" element={<WithdrawalsPage />} />
          <Route path="relatorios" element={<ReportsPage />} />
          <Route path="relatorios-mensais" element={<MonthlyReportsPage />} />
          <Route path="desenv-controle" element={<DesenvControleLayout />}>
            <Route index element={<Navigate to="extra" replace />} />
            <Route path="extra" element={<DevControleWorkPage workType="extra" />} />
            <Route path="dia-normal" element={<DevControleWorkPage workType="normal" />} />
          </Route>
          <Route path="desenv-cadastro" element={<DesenvCadastroPage />} />
          <Route path="programacao" element={<Navigate to="/desenv-controle/extra" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
