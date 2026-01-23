'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock,
  Brain,
  Lightbulb,
  Star,
  Home,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Source, MicroLesson, Flashcard } from '@/types';
import ReactMarkdown from 'react-markdown';

interface StudyPageProps {
  params: Promise<{ sourceId: string }>;
}

export default function StudyPage({ params }: StudyPageProps) {
  const { sourceId } = use(params);
  const router = useRouter();

  const [source, setSource] = useState<Source | null>(null);
  const [lessons, setLessons] = useState<MicroLesson[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [lessonFlashcards, setLessonFlashcards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [startTime, setStartTime] = useState<number>(Date.now());
  const [showCompletion, setShowCompletion] = useState(false);

  // Fetch source and lessons
  useEffect(() => {
    async function fetchData() {
      try {
        const [sourceRes, lessonsRes] = await Promise.all([
          fetch(`/api/sources/${sourceId}`),
          fetch(`/api/lessons?sourceId=${sourceId}`),
        ]);

        if (!sourceRes.ok || !lessonsRes.ok) {
          throw new Error('Failed to fetch data');
        }

        const sourceData = await sourceRes.json();
        const lessonsData = await lessonsRes.json();

        setSource(sourceData.source);
        setLessons(lessonsData.lessons);
      } catch (err) {
        console.error('Failed to fetch study data:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [sourceId]);

  // Fetch flashcards for current lesson
  useEffect(() => {
    async function fetchFlashcards() {
      if (!lessons[currentIndex]) return;

      try {
        const res = await fetch(`/api/flashcards?lessonId=${lessons[currentIndex].id}`);
        if (res.ok) {
          const data = await res.json();
          setLessonFlashcards(data.flashcards);
        }
      } catch (err) {
        console.error('Failed to fetch flashcards:', err);
      }
    }

    fetchFlashcards();
    setStartTime(Date.now());
    setShowCompletion(false);
  }, [currentIndex, lessons]);

  const currentLesson = lessons[currentIndex];
  const progress = lessons.length > 0 ? ((currentIndex + 1) / lessons.length) * 100 : 0;
  const completedCount = lessons.filter((l) => l.isCompleted).length;

  const handleComplete = async (rating: 1 | 2 | 3 | 4 | 5) => {
    if (!currentLesson) return;

    const timeSpentSeconds = Math.round((Date.now() - startTime) / 1000);

    try {
      await fetch(`/api/lessons/${currentLesson.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timeSpentSeconds,
          comprehensionRating: rating,
        }),
      });

      // Update local state
      setLessons((prev) =>
        prev.map((l) =>
          l.id === currentLesson.id ? { ...l, isCompleted: true } : l
        )
      );

      // Move to next lesson or show completion
      if (currentIndex < lessons.length - 1) {
        setCurrentIndex((prev) => prev + 1);
      } else {
        setShowCompletion(true);
      }
    } catch (err) {
      console.error('Failed to mark lesson complete:', err);
    }
  };

  const navigateToLesson = (index: number) => {
    if (index >= 0 && index < lessons.length) {
      setCurrentIndex(index);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-4xl mx-auto space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-[500px] w-full" />
        </div>
      </div>
    );
  }

  if (!source || lessons.length === 0) {
    return (
      <div className="min-h-screen bg-background p-4 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center space-y-4">
            <p className="text-muted-foreground">No lessons found for this content.</p>
            <Button onClick={() => router.push('/')}>
              <Home className="w-4 h-4 mr-2" />
              Return Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (showCompletion) {
    return (
      <div className="min-h-screen bg-background p-4 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold">Congratulations!</h2>
            <p className="text-muted-foreground">
              You've completed all {lessons.length} micro-lessons in "{source.title}"
            </p>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" onClick={() => router.push('/')}>
                <Home className="w-4 h-4 mr-2" />
                Home
              </Button>
              <Button onClick={() => router.push('/?tab=review')}>
                <Brain className="w-4 h-4 mr-2" />
                Review Flashcards
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <Button variant="ghost" size="sm" onClick={() => router.push('/')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Exit
            </Button>

            <div className="flex-1 max-w-md">
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-muted-foreground truncate">{source.title}</span>
                <span>
                  {currentIndex + 1} / {lessons.length}
                </span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>

            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="hidden sm:flex">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                {completedCount} done
              </Badge>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-[250px_1fr] gap-6">
          {/* Sidebar - Lesson list */}
          <aside className="hidden lg:block">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Lessons</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[calc(100vh-250px)]">
                  <div className="p-2 space-y-1">
                    {lessons.map((lesson, index) => (
                      <button
                        key={lesson.id}
                        onClick={() => navigateToLesson(index)}
                        className={`w-full text-left p-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${
                          index === currentIndex
                            ? 'bg-primary text-primary-foreground'
                            : 'hover:bg-muted'
                        }`}
                      >
                        {lesson.isCompleted ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                        ) : (
                          <Circle className="w-4 h-4 shrink-0 opacity-50" />
                        )}
                        <span className="truncate">{lesson.title}</span>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </aside>

          {/* Main content */}
          <main className="space-y-6">
            {/* Lesson card */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline">
                    <Clock className="w-3 h-3 mr-1" />
                    {currentLesson.estimatedMinutes} min
                  </Badge>
                  <Badge
                    variant="outline"
                    className={
                      currentLesson.difficulty === 1
                        ? 'text-green-600'
                        : currentLesson.difficulty === 2
                        ? 'text-yellow-600'
                        : 'text-red-600'
                    }
                  >
                    {currentLesson.difficulty === 1
                      ? 'Beginner'
                      : currentLesson.difficulty === 2
                      ? 'Intermediate'
                      : 'Advanced'}
                  </Badge>
                </div>
                <CardTitle className="text-2xl">{currentLesson.title}</CardTitle>
              </CardHeader>

              <CardContent className="space-y-6">
                {/* Hook */}
                {currentLesson.hook && (
                  <div className="bg-primary/5 border-l-4 border-primary p-4 rounded-r-lg">
                    <div className="flex items-start gap-2">
                      <Lightbulb className="w-5 h-5 text-primary mt-0.5" />
                      <p className="text-sm italic">{currentLesson.hook}</p>
                    </div>
                  </div>
                )}

                {/* Content */}
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <ReactMarkdown>{currentLesson.content}</ReactMarkdown>
                </div>

                <Separator />

                {/* Key takeaway */}
                {currentLesson.keyTakeaway && (
                  <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 p-4 rounded-lg">
                    <div className="flex items-start gap-2">
                      <Star className="w-5 h-5 text-green-600 mt-0.5" />
                      <div>
                        <p className="font-medium text-sm text-green-800 dark:text-green-400">
                          Key Takeaway
                        </p>
                        <p className="text-sm mt-1">{currentLesson.keyTakeaway}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Flashcards preview */}
                {lessonFlashcards.length > 0 && (
                  <div className="bg-muted/50 p-4 rounded-lg">
                    <div className="flex items-center gap-2 mb-3">
                      <Brain className="w-4 h-4" />
                      <span className="font-medium text-sm">
                        {lessonFlashcards.length} flashcards from this lesson
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {lessonFlashcards.slice(0, 3).map((card) => (
                        <Badge key={card.id} variant="secondary" className="text-xs">
                          {card.visualCue} {card.front.slice(0, 30)}...
                        </Badge>
                      ))}
                      {lessonFlashcards.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{lessonFlashcards.length - 3} more
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Completion rating */}
            <Card>
              <CardContent className="pt-6">
                <div className="text-center space-y-4">
                  <p className="font-medium">How well did you understand this lesson?</p>
                  <div className="flex justify-center gap-2">
                    {[1, 2, 3, 4, 5].map((rating) => (
                      <Button
                        key={rating}
                        variant="outline"
                        size="lg"
                        className="w-12 h-12 text-lg"
                        onClick={() => handleComplete(rating as 1 | 2 | 3 | 4 | 5)}
                      >
                        {rating}
                      </Button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    1 = Didn't understand → 5 = Perfectly clear
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Navigation */}
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                onClick={() => navigateToLesson(currentIndex - 1)}
                disabled={currentIndex === 0}
              >
                <ChevronLeft className="w-4 h-4 mr-2" />
                Previous
              </Button>

              <div className="flex gap-1">
                {lessons.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => navigateToLesson(index)}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      index === currentIndex
                        ? 'bg-primary'
                        : lessons[index].isCompleted
                        ? 'bg-green-500'
                        : 'bg-muted-foreground/30'
                    }`}
                  />
                ))}
              </div>

              <Button
                variant="outline"
                onClick={() => navigateToLesson(currentIndex + 1)}
                disabled={currentIndex === lessons.length - 1}
              >
                Next
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
