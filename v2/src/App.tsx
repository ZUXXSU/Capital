import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { HotkeyProvider } from './keyboard/HotkeyProvider';
import { AppShell } from './ui/AppShell';
import { applyTheme, useSession } from './store/session';
import { Dashboard } from './screens/Dashboard';
import { MastersModule } from './screens/masters/MastersModule';
import { VouchersModule } from './screens/vouchers/VouchersModule';
import { BillsModule } from './screens/bills/BillsModule';
import { ReportsModule, BooksModule } from './screens/reports/ReportsModule';
import { BalancesModule } from './screens/balances/BalancesModule';
import { ToolsModule } from './screens/tools/ToolsModule';
import { SetupModule } from './screens/setup/SetupModule';

// All eight menu modules are now live — no more placeholders.
export default function App() {
  const theme = useSession((s) => s.theme);
  useEffect(() => applyTheme(theme), [theme]);

  return (
    <HotkeyProvider>
      <HashRouter>
        <AppShell>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/masters/*" element={<MastersModule />} />
            <Route path="/vouchers/*" element={<VouchersModule />} />
            <Route path="/bills/*" element={<BillsModule />} />
            <Route path="/books/*" element={<BooksModule />} />
            <Route path="/reports/*" element={<ReportsModule />} />
            <Route path="/balances/*" element={<BalancesModule />} />
            <Route path="/tools/*" element={<ToolsModule />} />
            <Route path="/setup/*" element={<SetupModule />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppShell>
      </HashRouter>
    </HotkeyProvider>
  );
}
