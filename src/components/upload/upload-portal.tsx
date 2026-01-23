'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileUp, FileText, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

interface UploadPortalProps {
  onUploadComplete: (sourceId: string) => void;
}

type UploadStatus = 'idle' | 'uploading' | 'processing' | 'complete' | 'error';

export function UploadPortal({ onUploadComplete }: UploadPortalProps) {
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sourceId, setSourceId] = useState<string | null>(null);

  // Text input state
  const [textTitle, setTextTitle] = useState('');
  const [textContent, setTextContent] = useState('');

  // File input state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        setSelectedFile(file);
        setError(null);
      } else {
        setError('Only PDF files are supported currently');
      }
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        setSelectedFile(file);
        setError(null);
      } else {
        setError('Only PDF files are supported currently');
      }
    }
  };

  const processSource = async (id: string) => {
    setStatus('processing');
    setProgress(20);

    // Poll for processing status
    const pollInterval = setInterval(async () => {
      try {
        const statusRes = await fetch(`/api/process/${id}`);
        const statusData = await statusRes.json();

        if (statusData.status === 'complete') {
          clearInterval(pollInterval);
          setProgress(100);
          setStatus('complete');
          setTimeout(() => onUploadComplete(id), 1500);
        } else if (statusData.status === 'error') {
          clearInterval(pollInterval);
          setError(statusData.error || 'Processing failed');
          setStatus('error');
        } else {
          setProgress(statusData.progress || 50);
        }
      } catch (err) {
        clearInterval(pollInterval);
        setError('Failed to check processing status');
        setStatus('error');
      }
    }, 1000);

    // Trigger processing
    try {
      const processRes = await fetch(`/api/process/${id}`, { method: 'POST' });
      if (!processRes.ok) {
        clearInterval(pollInterval);
        const data = await processRes.json();
        throw new Error(data.error || 'Processing failed');
      }
    } catch (err) {
      clearInterval(pollInterval);
      setError(err instanceof Error ? err.message : 'Processing failed');
      setStatus('error');
    }
  };

  const handleFileUpload = async () => {
    if (!selectedFile) return;

    setStatus('uploading');
    setProgress(10);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const res = await fetch('/api/sources', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Upload failed');
      }

      const data = await res.json();
      setSourceId(data.source.id);
      await processSource(data.source.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setStatus('error');
    }
  };

  const handleTextSubmit = async () => {
    if (!textTitle.trim() || !textContent.trim()) {
      setError('Please provide both a title and content');
      return;
    }

    setStatus('uploading');
    setProgress(10);
    setError(null);

    try {
      const res = await fetch('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'text',
          title: textTitle,
          text: textContent,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Upload failed');
      }

      const data = await res.json();
      setSourceId(data.source.id);
      await processSource(data.source.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setStatus('error');
    }
  };

  const resetForm = () => {
    setStatus('idle');
    setProgress(0);
    setError(null);
    setSourceId(null);
    setSelectedFile(null);
    setTextTitle('');
    setTextContent('');
  };

  if (status === 'complete') {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-xl font-semibold">Processing Complete!</h3>
            <p className="text-muted-foreground">
              Your content has been transformed into micro-lessons and flashcards.
            </p>
            <Button onClick={() => onUploadComplete(sourceId!)}>
              Start Learning
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (status === 'uploading' || status === 'processing') {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center space-y-4">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
            <h3 className="text-xl font-semibold">
              {status === 'uploading' ? 'Uploading...' : 'Creating Micro-Lessons...'}
            </h3>
            <p className="text-muted-foreground">
              {status === 'uploading'
                ? 'Extracting text from your document'
                : 'AI is breaking down your content into ADHD-friendly chunks'}
            </p>
            <Progress value={progress} className="w-full max-w-xs" />
            <p className="text-sm text-muted-foreground">{Math.round(progress)}%</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Add New Content</CardTitle>
        <CardDescription>
          Upload a PDF or paste text to transform it into ADHD-friendly micro-lessons
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2 text-destructive">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{error}</span>
            <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setError(null)}>
              Dismiss
            </Button>
          </div>
        )}

        <Tabs defaultValue="file">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="file" className="flex items-center gap-2">
              <FileUp className="w-4 h-4" />
              Upload PDF
            </TabsTrigger>
            <TabsTrigger value="text" className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Paste Text
            </TabsTrigger>
          </TabsList>

          <TabsContent value="file">
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragActive
                  ? 'border-primary bg-primary/5'
                  : 'border-muted-foreground/25 hover:border-primary/50'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              {selectedFile ? (
                <div className="space-y-4">
                  <div className="w-12 h-12 mx-auto rounded-lg bg-primary/10 flex items-center justify-center">
                    <FileUp className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">{selectedFile.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <div className="flex gap-2 justify-center">
                    <Button variant="outline" onClick={() => setSelectedFile(null)}>
                      Remove
                    </Button>
                    <Button onClick={handleFileUpload}>
                      Process PDF
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="w-12 h-12 mx-auto rounded-lg bg-muted flex items-center justify-center">
                    <FileUp className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium">Drop your PDF here</p>
                    <p className="text-sm text-muted-foreground">or click to browse</p>
                  </div>
                  <Input
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    id="file-upload"
                    onChange={handleFileSelect}
                  />
                  <Button variant="outline" asChild>
                    <label htmlFor="file-upload" className="cursor-pointer">
                      Select File
                    </label>
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="text">
            <div className="space-y-4">
              <div>
                <label htmlFor="title" className="text-sm font-medium mb-2 block">
                  Title
                </label>
                <Input
                  id="title"
                  placeholder="What is this content about?"
                  value={textTitle}
                  onChange={(e) => setTextTitle(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="content" className="text-sm font-medium mb-2 block">
                  Content
                </label>
                <Textarea
                  id="content"
                  placeholder="Paste your text content here..."
                  className="min-h-[200px]"
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                />
              </div>
              <Button
                onClick={handleTextSubmit}
                disabled={!textTitle.trim() || !textContent.trim()}
                className="w-full"
              >
                Process Content
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
