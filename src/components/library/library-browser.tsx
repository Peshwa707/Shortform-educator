'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  BookOpen,
  MoreVertical,
  Trash2,
  FileText,
  Clock,
  Layers,
  Brain,
  RefreshCw,
} from 'lucide-react';
import { Source } from '@/types';
import { formatDistanceToNow } from 'date-fns';

interface LibraryBrowserProps {
  onStudy: (sourceId: string) => void;
}

export function LibraryBrowser({ onStudy }: LibraryBrowserProps) {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSources = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/sources');
      if (!res.ok) throw new Error('Failed to fetch sources');
      const data = await res.json();
      setSources(data.sources);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load library');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSources();
  }, []);

  const handleDelete = async (sourceId: string) => {
    if (!confirm('Are you sure you want to delete this content and all its lessons?')) {
      return;
    }

    try {
      const res = await fetch(`/api/sources/${sourceId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      setSources((prev) => prev.filter((s) => s.id !== sourceId));
    } catch (err) {
      alert('Failed to delete content');
    }
  };

  const handleReprocess = async (sourceId: string) => {
    try {
      const res = await fetch(`/api/process/${sourceId}`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to reprocess');
      // Refresh the list
      fetchSources();
    } catch (err) {
      alert('Failed to reprocess content');
    }
  };

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-4 w-2/3" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="max-w-md mx-auto">
        <CardContent className="pt-6">
          <div className="text-center space-y-4">
            <p className="text-destructive">{error}</p>
            <Button onClick={fetchSources}>Retry</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (sources.length === 0) {
    return (
      <Card className="max-w-md mx-auto">
        <CardContent className="pt-6">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-muted flex items-center justify-center">
              <Brain className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">Your Library is Empty</h3>
            <p className="text-muted-foreground">
              Upload a PDF or paste text to create your first micro-lessons!
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <span className="text-2xl font-bold">{sources.length}</span>
            </div>
            <p className="text-sm text-muted-foreground">Sources</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-muted-foreground" />
              <span className="text-2xl font-bold">
                {sources.reduce((acc, s) => acc + (s.lessonCount || 0), 0)}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">Lessons</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-muted-foreground" />
              <span className="text-2xl font-bold">
                {sources.reduce((acc, s) => acc + (s.cardCount || 0), 0)}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">Flashcards</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="text-2xl font-bold">
                {sources.reduce((acc, s) => acc + (s.lessonCount || 0) * 3, 0)}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">Est. Minutes</p>
          </CardContent>
        </Card>
      </div>

      {/* Source cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {sources.map((source) => (
          <Card key={source.id} className="group hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-lg truncate">{source.title}</CardTitle>
                  <CardDescription className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-xs">
                      {source.type.toUpperCase()}
                    </Badge>
                    <span className="text-xs">
                      {formatDistanceToNow(new Date(source.createdAt), { addSuffix: true })}
                    </span>
                  </CardDescription>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleReprocess(source.id)}>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Reprocess
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => handleDelete(source.id)}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Progress */}
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Progress</span>
                    <span>{source.progress || 0}%</span>
                  </div>
                  <Progress value={source.progress || 0} className="h-2" />
                </div>

                {/* Stats */}
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Layers className="w-3 h-3" />
                    {source.lessonCount || 0} lessons
                  </span>
                  <span className="flex items-center gap-1">
                    <Brain className="w-3 h-3" />
                    {source.cardCount || 0} cards
                  </span>
                </div>

                {/* Action */}
                <Button
                  className="w-full"
                  onClick={() => onStudy(source.id)}
                  disabled={!source.lessonCount}
                >
                  <BookOpen className="w-4 h-4 mr-2" />
                  {source.lessonCount ? 'Study' : 'Processing...'}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
