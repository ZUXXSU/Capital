import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { HotkeyProvider } from './keyboard/HotkeyProvider';
import { AppShell } from './ui/AppShell';
import { applyTheme, useSession } from './store/session';
import { Dashboard } from './screens/Dashboard';
import { Placeholder } from './screens/Placeholder';

// Module screens are mounted here. As agents deliver real modules they replace
// the <Placeholder> entries — the routes and hotkeys stay stable.
export default function App() {
  const theme = useSession((s) => s.theme);
  useEffect(() => applyTheme(theme), [theme]);

  return (
    <HotkeyProvider>
      <HashRouter>
        <AppShell>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/masters/*" element={<Placeholder title="Masters" module="masters" />} />
            <Route path="/vouchers/*" element={<Placeholder title="Vouchers" module="vouchers" />} />
            <Route path="/bills/*" element={<Placeholder title="Bills" module="bills" />} />
            <Route path="/books/*" element={<Placeholder title="Account Books" module="books" />} />
            <Route path="/reports/*" element={<Placeholder title="Reports" module="reports" />} />
            <Route path="/balances/*" element={<Placeholder title="Open / Close Balances" module="balances" />} />
            <Route path="/tools/*" element={<Placeholder title="Accessories" module="tools" />} />
            <Route path="/setup/*" element={<Placeholder title="Setup" module="setup" />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppShell>
      </HashRouter>
    </HotkeyProvider>
  );
}
