import { DashboardPageHeader } from '@/components/dashboard/layout/dashboard-page-header';
import { ContentGenerator } from '@/components/content/content-generator';
import { SocialMediaManager } from '@/components/social-media/social-media-manager';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function ContentPage() {
  return (
    <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-8">
      <DashboardPageHeader pageTitle={'Content Creation'} />
      
      <Tabs defaultValue="generator" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="generator">AI Content Generator</TabsTrigger>
          <TabsTrigger value="social">Social Media Manager</TabsTrigger>
        </TabsList>
        
        <TabsContent value="generator" className="space-y-6">
          <ContentGenerator 
            onContentGenerated={(content, contentDraft) => {
              // You could switch to the social tab and pre-fill content
              console.log('Content generated:', content, contentDraft);
            }}
          />
        </TabsContent>
        
        <TabsContent value="social" className="space-y-6">
          <SocialMediaManager />
        </TabsContent>
      </Tabs>
    </main>
  );
}