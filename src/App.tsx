import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { Layout } from './components/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { PartsPage } from './pages/PartsPage';
import { MonthlyReportsPage } from './pages/MonthlyReportsPage';
import { ReportsPage } from './pages/ReportsPage';
import { WithdrawalsPage } from './pages/WithdrawalsPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="pecas" element={<PartsPage />} />
          <Route path="retiradas" element={<WithdrawalsPage />} />
          <Route path="relatorios" element={<ReportsPage />} />
          <Route path="relatorios-mensais" element={<MonthlyReportsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
