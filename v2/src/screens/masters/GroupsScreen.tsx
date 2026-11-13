// Masters → Group Entry. Legacy "Group Master Entry" screen: list of account
// groups + a create/edit form (code, name, nature, schedule flag, column).
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader } from '../../ui/primitives';
import { useHotkey, useScope } from '../../keyboard/HotkeyProvider';
import { useSession } from '../../store/session';
import { db, uid } from '../../db/db';
import type { Group, GroupNature } from '../../types/model';
import { NATURE_OPTIONS, NATURE_RANGES, Select, handleEnterAdvance, suggestGroupCode } from './shared';

const blankForm = (nature: GroupNature, suggestedCode: string) => ({
  code: suggestedCode,
  name: '',
  nature,
  isSchedule: false,
  column: 'inner' as 'inner' | 'outer',
});

export function GroupsScreen() {
  const navigate = useNavigate();
  const company = useSession((s) => s.activeCompany);
  const [groups, setGroups] = useState<Group[]>([]);
  const [view, setView] = useState<'list' | 'form'>('list');
  const [editing, setEditing] = useState<Group | null>(null);
  const [form, setForm] = useState(blankForm('liability', '11'));
  const [reload, setReload] = useState(0);
  const formRef = useRef<HTMLDivElement>(null);

  useScope('masters-groups');
  useHotkey('esc', 'Back', () => (view === 'form' ? setView('list') : navigate('/masters')), { scope: 'masters-groups' });

  useEffect(() => {
    if (!company) return;
    db.groups.where('companyId').equals(company.id).toArray().then((rows) =>
      setGroups(rows.sort((a, b) => a.code.localeCompare(b.code))),
    );
  }, [company, reload]);

  if (!company) {
    return (
      <EmptyState
        title="No company selected"
        hint="Create or switch to a company from the Masters home before setting up groups."
        action={<Button variant="primary" onClick={() => navigate('/masters')}>Go to Masters</Button>}
      />
    );
  }

  function openNew() {
    setEditing(null);
    setForm(blankForm('liability', suggestGroupCode('liability', groups)));
    setView('form');
  }

  function openEdit(g: Group) {
    setEditing(g);
    setForm({ code: g.code, name: g.name, nature: g.nature, isSchedule: g.isSchedule, column: g.column });
    setView('form');
  }

  function onNatureChange(nature: GroupNature) {
    setForm((f) => ({
      ...f,
      nature,
      code: editing ? f.code : suggestGroupCode(nature, groups),
    }));
  }

  async function save() {
    if (!form.name.trim() || !form.code.trim()) return;
    const row: Group = {
      id: editing?.id ?? uid(),
      companyId: company.id,
      code: form.code.trim(),
      name: form.name.trim(),
      nature: form.nature,
      isSchedule: form.isSchedule,
      column: form.column,
      parentId: editing?.parentId,
    };
    await db.groups.put(row);
    setReload((n) => n + 1);
    setView('list');
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Groups"
        subtitle="Group Master Entry — the account groups that drive the Balance Sheet / I&E layout."
        actions={
          view === 'list' ? (
            <Button variant="primary" onClick={openNew}>+ New Group</Button>
          ) : (
            <Button variant="ghost" onClick={() => setView('list')}>Esc Cancel</Button>
          )
        }
      />

      {view === 'list' ? (
        groups.length === 0 ? (
          <EmptyState title="No groups yet" hint="Create your first account group to start building the chart of accounts." action={<Button variant="primary" onClick={openNew}>+ New Group</Button>} />
        ) : (
          <Card className="divide-y divide-border">
            {groups.map((g) => (
              <button
                key={g.id}
                onClick={() => openEdit(g)}
                className="w-full flex items-center justify-between gap-3 px-4 h-12 text-left hover:bg-surface-2 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm text-muted w-8">{g.code}</span>
                  <span className="text-sm font-medium">{g.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  {g.isSchedule && <Badge tone="warning">Schedule</Badge>}
                  <Badge>{g.column}</Badge>
                  <Badge tone={g.nature === 'income' ? 'positive' : g.nature === 'expenditure' ? 'negative' : 'default'}>
                    {g.nature}
                  </Badge>
                </div>
              </button>
            ))}
          </Card>
        )
      ) : (
        <Card className="p-5 max-w-lg">
          <div ref={formRef} className="grid grid-cols-2 gap-4">
            <Field label="Nature">
              <Select
                value={form.nature}
                onChange={(e) => onNatureChange(e.target.value as GroupNature)}
                onKeyDown={(e) => handleEnterAdvance(e, formRef.current, save)}
              >
                {NATURE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Group No." hint={NATURE_RANGES[form.nature].hint}>
              <Input
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                onKeyDown={(e) => handleEnterAdvance(e, formRef.current, save)}
              />
            </Field>
            <Field label="Group Name">
              <Input
                value={form.name}
                autoFocus
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                onKeyDown={(e) => handleEnterAdvance(e, formRef.current, save)}
              />
            </Field>
            <Field label="B/S Column">
              <Select
                value={form.column}
                onChange={(e) => setForm((f) => ({ ...f, column: e.target.value as 'inner' | 'outer' }))}
                onKeyDown={(e) => handleEnterAdvance(e, formRef.current, save)}
              >
                <option value="inner">Inner</option>
                <option value="outer">Outer</option>
              </Select>
            </Field>
            <label className="flex items-center gap-2 text-sm col-span-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border accent-brand"
                checked={form.isSchedule}
                onChange={(e) => setForm((f) => ({ ...f, isSchedule: e.target.checked }))}
              />
              Appears as a Balance Sheet schedule
            </label>
          </div>
          <div className="flex items-center gap-2 mt-5">
            <Button variant="primary" hotkey="⏎" onClick={save}>Save</Button>
            <Button variant="ghost" hotkey="Esc" onClick={() => setView('list')}>Cancel</Button>
            {editing && <span className="text-xs text-muted ml-auto">Editing {editing.code} — {editing.name}</span>}
          </div>
        </Card>
      )}
    </div>
  );
}
