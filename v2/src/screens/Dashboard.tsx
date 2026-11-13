import { useNavigate } from 'react-router-dom';
import { Card, PageHeader, Button } from '../ui/primitives';
import { NAV } from '../ui/AppShell';
import { formatPaise } from '../lib/money';

// Landing screen. Shows headline figures (wired to live data once modules land)
// and a keyboard-forward launcher grid mirroring the PACE main menu.
export function Dashboard() {
  const navigate = useNavigate();
  const stats = [
    { label: 'Cash & Bank', value: 0, tone: 'positive' as const },
    { label: 'Receivables', value: 0, tone: 'default' as const },
    { label: 'Payables', value: 0, tone: 'negative' as const },
    { label: 'This month collection', value: 0, tone: 'default' as const },
  ];

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Dashboard"
        subtitle="Overview of your books — press a number to jump to any module."
        actions={<Button variant="primary" onClick={() => navigate('/vouchers')} hotkey="2">New Voucher</Button>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((s) => (
          <Card key={s.label} className="p-4">
            <div className="text-xs text-muted">{s.label}</div>
            <div className="text-2xl font-semibold tabular mt-1">{formatPaise(s.value, { symbol: true })}</div>
          </Card>
        ))}
      </div>

      <h2 className="text-sm font-semibold text-fg-soft mb-3">Modules</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {NAV.map((item) => (
          <button
            key={item.to}
            onClick={() => navigate(item.to)}
            className="text-left p-4 rounded-xl border border-border bg-surface hover:bg-surface-2 hover:border-brand/40 transition-colors group"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">{item.label}</span>
              <span className="keycap">{item.hotkey}</span>
            </div>
            <div className="text-xs text-muted mt-1">{item.hint}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
