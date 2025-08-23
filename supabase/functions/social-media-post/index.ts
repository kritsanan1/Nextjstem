import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SocialMediaPostRequest {
  content: string
  platforms: string[]
  scheduledFor?: string
  mediaUrls?: string[]
  contentDraftId?: string
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Get the user
    const {
      data: { user },
    } = await supabaseClient.auth.getUser()

    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Parse request body
    const { content, platforms, scheduledFor, mediaUrls, contentDraftId }: SocialMediaPostRequest = await req.json()

    if (!content || !platforms || platforms.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Content and platforms are required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Check usage limits
    const { data: canPost } = await supabaseClient.rpc('check_usage_limit', {
      p_user_id: user.id,
      p_feature_name: 'social_posts_per_month'
    })

    if (!canPost) {
      return new Response(
        JSON.stringify({ error: 'Usage limit exceeded. Please upgrade your plan.' }),
        {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const ayrshareApiKey = Deno.env.get('AYRSHARE_API_KEY')
    if (!ayrshareApiKey) {
      throw new Error('Ayrshare API key not configured')
    }

    // Prepare post data for Ayrshare
    const postData = {
      post: content,
      platforms: platforms,
      ...(mediaUrls && mediaUrls.length > 0 && { mediaUrls }),
      ...(scheduledFor && { scheduleDate: scheduledFor }),
    }

    let ayrshareResponse
    let externalIds = {}

    // If scheduled for future, save to database for n8n to process
    if (scheduledFor && new Date(scheduledFor) > new Date()) {
      // Save scheduled post to database
      const { data: scheduledPost, error: scheduleError } = await supabaseClient
        .from('scheduled_posts')
        .insert({
          user_id: user.id,
          content_draft_id: contentDraftId,
          platforms: platforms,
          scheduled_for: scheduledFor,
          post_data: postData,
          status: 'scheduled'
        })
        .select()
        .single()

      if (scheduleError) {
        console.error('Error scheduling post:', scheduleError)
        throw new Error('Failed to schedule post')
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Post scheduled successfully',
          scheduledPost: scheduledPost
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    } else {
      // Post immediately via Ayrshare
      ayrshareResponse = await fetch('https://app.ayrshare.com/api/post', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ayrshareApiKey}`,
        },
        body: JSON.stringify(postData),
      })

      if (!ayrshareResponse.ok) {
        const errorText = await ayrshareResponse.text()
        console.error('Ayrshare API error:', errorText)
        throw new Error('Failed to post to social media')
      }

      const ayrshareData = await ayrshareResponse.json()
      
      if (ayrshareData.status !== 'success') {
        throw new Error(ayrshareData.message || 'Failed to post to social media')
      }

      // Extract external IDs from Ayrshare response
      if (ayrshareData.id) {
        externalIds = { ayrshare_id: ayrshareData.id }
        
        // Add platform-specific IDs if available
        platforms.forEach(platform => {
          if (ayrshareData[platform] && ayrshareData[platform].id) {
            externalIds[`${platform}_id`] = ayrshareData[platform].id
          }
        })
      }

      // Save posted content to database
      const { data: scheduledPost, error: saveError } = await supabaseClient
        .from('scheduled_posts')
        .insert({
          user_id: user.id,
          content_draft_id: contentDraftId,
          platforms: platforms,
          scheduled_for: new Date().toISOString(),
          post_data: postData,
          external_ids: externalIds,
          status: 'posted'
        })
        .select()
        .single()

      if (saveError) {
        console.error('Error saving posted content:', saveError)
        // Don't throw error here as the post was successful
      }

      // Track usage
      await supabaseClient.rpc('track_usage', {
        p_user_id: user.id,
        p_metric_type: 'social_posts_per_month',
        p_count: platforms.length // Count each platform as one post
      })

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Post published successfully',
          externalIds: externalIds,
          scheduledPost: scheduledPost,
          ayrshareResponse: ayrshareData
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

  } catch (error) {
    console.error('Social media post error:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal server error',
        details: 'Failed to process social media post'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})