'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Library, BookOpen, Brain } from 'lucide-react';
import { UploadPortal } from '@/components/upload/upload-portal';
import { LibraryBrowser } from '@/components/library/library-browser';
import { FlashcardReview } from '@/components/flashcards/flashcard-review';

export default function Home() {
  const [activeTab, setActiveTab] = useState('library');
  const router = useRouter();

  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
                <Brain className="w-6 h-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">LearnFlow</h1>
                <p className="text-sm text-muted-foreground">ADHD-Friendly Learning</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-3 mb-8">
            <TabsTrigger value="library" className="flex items-center gap-2">
              <Library className="w-4 h-4" />
              <span className="hidden sm:inline">Library</span>
            </TabsTrigger>
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Upload</span>
            </TabsTrigger>
            <TabsTrigger value="review" className="flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              <span className="hidden sm:inline">Review</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="library">
            <LibraryBrowser onStudy={(sourceId) => {
              // Navigate to study mode using Next.js router for client-side navigation
              router.push(`/study/${sourceId}`);
            }} />
          </TabsContent>

          <TabsContent value="upload">
            <UploadPortal onUploadComplete={() => {
              // Switch to library tab after upload
              setActiveTab('library');
            }} />
          </TabsContent>

          <TabsContent value="review">
            <FlashcardReview />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
