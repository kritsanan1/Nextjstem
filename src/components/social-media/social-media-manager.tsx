'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Calendar, Clock, Send, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface SocialMediaManagerProps {
  initialContent?: string;
  contentDraftId?: string;
}

const PLATFORMS = [
  { id: 'facebook', name: 'Facebook', color: 'bg-blue-600' },
  { id: 'twitter', name: 'Twitter', color: 'bg-sky-500' },
  { id: 'instagram', name: 'Instagram', color: 'bg-pink-600' },
  { id: 'linkedin', name: 'LinkedIn', color: 'bg-blue-700' },
  { id: 'youtube', name: 'YouTube', color: 'bg-red-600' },
  { id: 'tiktok', name: 'TikTok', color: 'bg-black' },
];

export function SocialMediaManager({ initialContent = '', contentDraftId }: SocialMediaManagerProps) {
  const [content, setContent] = useState(initialContent);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [scheduledFor, setScheduledFor] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [isScheduled, setIsScheduled] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setContent(initialContent);
  }, [initialContent]);

  const handlePlatformToggle = (platformId: string) => {
    setSelectedPlatforms(prev => 
      prev.includes(platformId)
        ? prev.filter(id => id !== platformId)
        : [...prev, platformId]
    );
  };

  const handlePost = async (scheduled = false) => {
    if (!content.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter content to post.',
        variant: 'destructive',
      });
      return;
    }

    if (selectedPlatforms.length === 0) {
      toast({
        title: 'Error',
        description: 'Please select at least one platform.',
        variant: 'destructive',
      });
      return;
    }

    if (scheduled && !scheduledFor) {
      toast({
        title: 'Error',
        description: 'Please select a date and time for scheduling.',
        variant: 'destructive',
      });
      return;
    }

    setIsPosting(true);
    try {
      const response = await fetch('/api/social-media-post', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content,
          platforms: selectedPlatforms,
          scheduledFor: scheduled ? scheduledFor : undefined,
          contentDraftId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to process post');
      }

      if (scheduled) {
        toast({
          title: 'Success',
          description: 'Post scheduled successfully!',
        });
        setIsScheduled(true);
      } else {
        toast({
          title: 'Success',
          description: 'Post published successfully!',
        });
      }

      // Reset form
      setContent('');
      setSelectedPlatforms([]);
      setScheduledFor('');
    } catch (error) {
      console.error('Post error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to process post. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsPosting(false);
    }
  };

  const formatDateTime = (dateTimeString: string) => {
    if (!dateTimeString) return '';
    const date = new Date(dateTimeString);
    return date.toISOString().slice(0, 16); // Format for datetime-local input
  };

  const minDateTime = new Date();
  minDateTime.setMinutes(minDateTime.getMinutes() + 5); // Minimum 5 minutes from now

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-blue-500" />
            Social Media Manager
          </CardTitle>
          <CardDescription>
            Post your content to multiple social media platforms
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="content">Post Content</Label>
            <Textarea
              id="content"
              placeholder="What would you like to share?"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
            />
            <div className="text-sm text-muted-foreground">
              {content.length} characters
            </div>
          </div>

          <div className="space-y-3">
            <Label>Select Platforms</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {PLATFORMS.map((platform) => (
                <div key={platform.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={platform.id}
                    checked={selectedPlatforms.includes(platform.id)}
                    onCheckedChange={() => handlePlatformToggle(platform.id)}
                  />
                  <Label
                    htmlFor={platform.id}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <div className={`w-3 h-3 rounded-full ${platform.color}`} />
                    {platform.name}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="schedule">Schedule Post (Optional)</Label>
            <Input
              id="schedule"
              type="datetime-local"
              value={scheduledFor}
              onChange={(e) => setScheduledFor(e.target.value)}
              min={formatDateTime(minDateTime.toISOString())}
            />
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => handlePost(false)}
              disabled={isPosting || !content.trim() || selectedPlatforms.length === 0}
              className="flex-1"
            >
              {isPosting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Posting...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Post Now
                </>
              )}
            </Button>
            
            {scheduledFor && (
              <Button
                variant="outline"
                onClick={() => handlePost(true)}
                disabled={isPosting || !content.trim() || selectedPlatforms.length === 0}
                className="flex-1"
              >
                {isPosting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Scheduling...
                  </>
                ) : (
                  <>
                    <Calendar className="mr-2 h-4 w-4" />
                    Schedule Post
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {isScheduled && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-green-800">
              <Clock className="h-4 w-4" />
              <span className="font-medium">Post Scheduled Successfully</span>
            </div>
            <p className="text-sm text-green-700 mt-1">
              Your post will be published on {new Date(scheduledFor).toLocaleString()} to{' '}
              {selectedPlatforms.join(', ')}.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}