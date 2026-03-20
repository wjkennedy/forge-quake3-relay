import { QuakeGameClient } from '@/components/QuakeGameClient';

export const metadata = {
  title: 'Quake 3 Relay Client',
  description: 'WebSocket relay client for multiplayer Quake 3 in Atlassian Forge',
};

export default function Page() {
  return (
    <main className="min-h-screen bg-gray-50 py-8">
      <QuakeGameClient />
    </main>
  );
}
