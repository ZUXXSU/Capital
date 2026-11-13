// Masters module — mounted at /masters/* by App.tsx. Owns its own internal
// routing so Groups/Ledgers/Members each get a real URL while still reading
// as one screen from the outside.
import { Route, Routes } from 'react-router-dom';
import { MastersIndex } from './MastersIndex';
import { GroupsScreen } from './GroupsScreen';
import { LedgersScreen } from './LedgersScreen';
import { MembersScreen } from './MembersScreen';

export function MastersModule() {
  return (
    <Routes>
      <Route index element={<MastersIndex />} />
      <Route path="groups" element={<GroupsScreen />} />
      <Route path="ledgers" element={<LedgersScreen />} />
      <Route path="members" element={<MembersScreen />} />
    </Routes>
  );
}
