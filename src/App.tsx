import { lazy, Suspense } from 'react';
import { Toaster } from 'sonner';
import { Route, Router, Switch } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import { AppLayout } from '@/app/AppLayout';
import { useStartup } from '@/app/useStartup';
import { useTheme } from '@/app/useTheme';
import HomePage from '@/pages/HomePage';
import { useSettings } from '@/features/settings/settingsStore';

// ホーム以外のページは必要になってから読み込む
const StudyPage = lazy(() => import('@/pages/StudyPage'));
const LibraryPage = lazy(() => import('@/pages/LibraryPage'));
const CalendarPage = lazy(() => import('@/pages/CalendarPage'));
const ChatPage = lazy(() => import('@/pages/ChatPage'));
const QuizPage = lazy(() => import('@/pages/QuizPage'));
const PracticePage = lazy(() => import('@/pages/PracticePage'));
const ModelsPage = lazy(() => import('@/pages/ModelsPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const HelpPage = lazy(() => import('@/pages/HelpPage'));

export default function App() {
  useTheme();
  useStartup();
  const theme = useSettings((s) => s.theme);
  return (
    // GitHub Pages ではサーバー側のルーティングができないためハッシュルーティングを使う
    <Router hook={useHashLocation}>
      <AppLayout>
        <Suspense fallback={null}>
          <Switch>
            <Route path="/study" component={StudyPage} />
            <Route path="/library/:tab?" component={LibraryPage} />
            <Route path="/calendar/:tab?" component={CalendarPage} />
            <Route path="/chat" component={ChatPage} />
            <Route path="/quiz" component={QuizPage} />
            <Route path="/practice" component={PracticePage} />
            <Route path="/models" component={ModelsPage} />
            <Route path="/settings" component={SettingsPage} />
            <Route path="/help" component={HelpPage} />
            <Route component={HomePage} />
          </Switch>
        </Suspense>
      </AppLayout>
      <Toaster
        theme={theme}
        position="top-center"
        richColors
        closeButton
        duration={3000}
        toastOptions={{ className: 'text-sm' }}
      />
    </Router>
  );
}
