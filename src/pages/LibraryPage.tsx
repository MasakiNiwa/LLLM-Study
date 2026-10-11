import { useEffect } from 'react';
import { FileInput, Gift, Library, Wand2 } from 'lucide-react';
import { useLocation, useParams } from 'wouter';
import { PageBody, PageHeader } from '@/app/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Tabs } from '@/components/ui/Tabs';
import { ImportPanel } from '@/features/library/ImportPanel';
import { useLibrary } from '@/features/library/libraryStore';
import { PackList } from '@/features/library/PackList';
import { PromptBuilder } from '@/features/library/PromptBuilder';
import { SampleList } from '@/features/library/SampleList';

type Tab = 'mine' | 'samples' | 'import' | 'create';
const TABS = [
  { value: 'mine' as const, label: 'マイ教材', icon: <Library /> },
  { value: 'samples' as const, label: 'サンプル', icon: <Gift /> },
  { value: 'import' as const, label: '取り込む', icon: <FileInput /> },
  { value: 'create' as const, label: 'AI で作る', icon: <Wand2 /> },
];

export default function LibraryPage() {
  const params = useParams<{ tab?: string }>();
  const [, navigate] = useLocation();
  const tab: Tab = TABS.some((t) => t.value === params.tab) ? (params.tab as Tab) : 'mine';
  const go = (t: Tab) => navigate(t === 'mine' ? '/library' : `/library/${t}`, { replace: true });

  useEffect(() => {
    void useLibrary.getState().refresh();
  }, []);

  return (
    <>
      <PageHeader title="教材" />
      <PageBody>
        <Tabs value={tab} items={TABS} onChange={go} />
        {tab === 'mine' && (
          <PackList
            empty={
              <Card className="space-y-3 p-6 text-center">
                <p className="font-medium">まだ教材がありません</p>
                <p className="text-sm text-slate-500">
                  サンプル教材を追加するか、外部の AI に作ってもらった教材を取り込みましょう。
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button variant="primary" onClick={() => go('samples')}>
                    サンプルを見る
                  </Button>
                  <Button variant="secondary" onClick={() => go('create')}>
                    AI で作る
                  </Button>
                </div>
              </Card>
            }
          />
        )}
        {tab === 'samples' && (
          <div className="space-y-2">
            <p className="px-1 text-sm text-slate-600 dark:text-slate-400">
              アプリに同梱しているサンプル教材です。今後も追加していきます。
            </p>
            <SampleList />
          </div>
        )}
        {tab === 'import' && <ImportPanel onInstalled={() => go('mine')} />}
        {tab === 'create' && <PromptBuilder onGoImport={() => go('import')} />}
      </PageBody>
    </>
  );
}
