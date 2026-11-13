import { PageHeader, EmptyState, Button } from '../ui/primitives';

// Temporary screen for modules not yet delivered by the feature agents.
export function Placeholder({ title, module }: { title: string; module: string }) {
  return (
    <div>
      <PageHeader title={title} subtitle={`The ${module} module is being built.`} />
      <EmptyState
        title={`${title} — coming online`}
        hint="This vertical is under construction by a feature agent against the shared data model and design system. Keyboard hotkeys and routes are already wired."
        action={<Button variant="primary">View data model (SUMMARY.md)</Button>}
      />
    </div>
  );
}
