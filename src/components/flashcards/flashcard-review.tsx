'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Brain,
  RotateCcw,
  Lightbulb,
  CheckCircle2,
  PartyPopper,
  ArrowRight,
  AlertCircle,
} from 'lucide-react';
import { Flashcard } from '@/types';
import { getRatingStyle, predictNextIntervals, SimpleRating } from '@/lib/services/sm2';

export function FlashcardReview() {
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [startTime, setStartTime] = useState<number>(0);

  const fetchDueCards = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/flashcards?due=true&limit=20');
      if (!res.ok) throw new Error('Failed to fetch cards');
      const data = await res.json();
      setCards(data.flashcards);
      setCurrentIndex(0);
      setReviewedCount(0);
    } catch (err) {
      console.error('Failed to fetch due cards:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDueCards();
  }, []);

  useEffect(() => {
    // Reset state when moving to new card
    setShowAnswer(false);
    setShowHint(false);
    setStartTime(Date.now());
  }, [currentIndex]);

  const currentCard = cards[currentIndex];
  const isComplete = currentIndex >= cards.length;
  const progress = cards.length > 0 ? (reviewedCount / cards.length) * 100 : 0;

  const [reviewError, setReviewError] = useState<string | null>(null);

  const handleRating = async (rating: SimpleRating) => {
    if (!currentCard) return;

    const timeToAnswerMs = Date.now() - startTime;
    setReviewError(null);

    try {
      const res = await fetch(`/api/flashcards/${currentCard.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, timeToAnswerMs }),
      });

      if (!res.ok) {
        throw new Error('Failed to submit review');
      }

      // Only update state after successful API call
      setReviewedCount((prev) => prev + 1);
      setCurrentIndex((prev) => prev + 1);
    } catch (err) {
      console.error('Failed to submit review:', err);
      setReviewError('Failed to save review. Please try again.');
    }
  };

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!currentCard) return;

      if (!showAnswer) {
        if (e.code === 'Space' || e.key === 'Enter') {
          e.preventDefault();
          setShowAnswer(true);
        }
        if (e.key === 'h' || e.key === 'H') {
          setShowHint(true);
        }
      } else {
        switch (e.key) {
          case '1':
            handleRating('again');
            break;
          case '2':
            handleRating('hard');
            break;
          case '3':
            handleRating('good');
            break;
          case '4':
            handleRating('easy');
            break;
        }
      }
    },
    [currentCard, showAnswer]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Card>
          <CardContent className="pt-6">
            <Skeleton className="h-48 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <Card className="max-w-md mx-auto">
        <CardContent className="pt-6">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold">All Caught Up!</h3>
            <p className="text-muted-foreground">
              No flashcards due for review right now. Check back later!
            </p>
            <Button onClick={fetchDueCards} variant="outline">
              <RotateCcw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isComplete) {
    return (
      <Card className="max-w-md mx-auto">
        <CardContent className="pt-6">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-yellow-100 flex items-center justify-center">
              <PartyPopper className="w-8 h-8 text-yellow-600" />
            </div>
            <h3 className="text-lg font-semibold">Session Complete!</h3>
            <p className="text-muted-foreground">
              You reviewed {reviewedCount} cards. Great work!
            </p>
            <div className="flex gap-2 justify-center">
              <Button onClick={fetchDueCards} variant="outline">
                <RotateCcw className="w-4 h-4 mr-2" />
                Review More
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const nextIntervals = predictNextIntervals(
    currentCard.easeFactor,
    currentCard.interval,
    currentCard.repetitions
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Progress header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" />
            <span className="font-medium">Flashcard Review</span>
          </div>
          <span className="text-sm text-muted-foreground">
            {reviewedCount} / {cards.length} reviewed
          </span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {/* Flashcard */}
      <Card
        className="cursor-pointer min-h-[300px] flex flex-col"
        onClick={() => !showAnswer && setShowAnswer(true)}
      >
        <CardContent className="pt-6 flex-1 flex flex-col">
          {/* Question */}
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <div className="space-y-4">
              {currentCard.visualCue && (
                <span className="text-4xl">{currentCard.visualCue}</span>
              )}
              <p className="text-xl font-medium">{currentCard.front}</p>

              {/* Hint */}
              {showHint && currentCard.hint && (
                <p className="text-sm text-muted-foreground bg-muted p-2 rounded">
                  💡 {currentCard.hint}
                </p>
              )}

              {!showAnswer && currentCard.hint && !showHint && (
                <Button variant="ghost" size="sm" onClick={(e) => {
                  e.stopPropagation();
                  setShowHint(true);
                }}>
                  <Lightbulb className="w-4 h-4 mr-1" />
                  Show Hint
                </Button>
              )}
            </div>
          </div>

          {/* Answer (when revealed) */}
          {showAnswer && (
            <div className="border-t pt-4 mt-4 space-y-4">
              <div className="text-center">
                <Badge variant="secondary" className="mb-2">Answer</Badge>
                <p className="text-lg">{currentCard.back}</p>

                {currentCard.mnemonic && (
                  <p className="text-sm text-muted-foreground mt-2">
                    🧠 {currentCard.mnemonic}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Show answer prompt */}
          {!showAnswer && (
            <div className="text-center pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                Click or press <kbd className="px-1 py-0.5 bg-muted rounded text-xs">Space</kbd> to reveal answer
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Error display */}
      {reviewError && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2 text-destructive">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="text-sm">{reviewError}</span>
        </div>
      )}

      {/* Rating buttons */}
      {showAnswer && (
        <div className="space-y-4">
          <p className="text-center text-sm text-muted-foreground">
            How well did you remember?
          </p>
          <div className="grid grid-cols-4 gap-2">
            {(['again', 'hard', 'good', 'easy'] as SimpleRating[]).map((rating, index) => {
              const style = getRatingStyle(rating);
              return (
                <Button
                  key={rating}
                  variant="outline"
                  className={`flex flex-col h-auto py-3 ${style.bgColor} ${style.hoverBgColor} ${style.color} border-0`}
                  onClick={() => handleRating(rating)}
                >
                  <span className="font-medium">{style.label}</span>
                  <span className="text-xs opacity-75">{nextIntervals[rating]}</span>
                  <span className="text-[10px] opacity-50">({index + 1})</span>
                </Button>
              );
            })}
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Press <kbd className="px-1 py-0.5 bg-muted rounded">1-4</kbd> to rate
          </p>
        </div>
      )}

      {/* Skip button */}
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCurrentIndex((prev) => prev + 1)}
        >
          Skip <ArrowRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}
