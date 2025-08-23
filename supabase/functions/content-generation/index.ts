import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ContentGenerationRequest {
  prompt: string
  contentType?: string
  tone?: string
  length?: string
  platform?: string
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

    // Check usage limits
    const { data: canGenerate } = await supabaseClient.rpc('check_usage_limit', {
      p_user_id: user.id,
      p_feature_name: 'content_generations_per_month'
    })

    if (!canGenerate) {
      return new Response(
        JSON.stringify({ error: 'Usage limit exceeded. Please upgrade your plan.' }),
        {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Parse request body
    const { prompt, contentType = 'social_post', tone = 'professional', length = 'medium', platform }: ContentGenerationRequest = await req.json()

    if (!prompt) {
      return new Response(
        JSON.stringify({ error: 'Prompt is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Construct enhanced prompt based on parameters
    let enhancedPrompt = `Create a ${contentType} with a ${tone} tone and ${length} length. `
    if (platform) {
      enhancedPrompt += `This content is for ${platform}. `
    }
    enhancedPrompt += `Here's the user's request: ${prompt}`

    // Call Google Gemini API
    const geminiApiKey = Deno.env.get('GOOGLE_GEMINI_API_KEY')
    if (!geminiApiKey) {
      throw new Error('Google Gemini API key not configured')
    }

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: enhancedPrompt
            }]
          }],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024,
          },
        }),
      }
    )

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text()
      console.error('Gemini API error:', errorText)
      throw new Error('Failed to generate content')
    }

    const geminiData = await geminiResponse.json()
    const generatedContent = geminiData.candidates?.[0]?.content?.parts?.[0]?.text

    if (!generatedContent) {
      throw new Error('No content generated')
    }

    // Save content draft to database
    const { data: contentDraft, error: saveError } = await supabaseClient
      .from('content_drafts')
      .insert({
        user_id: user.id,
        title: `Generated ${contentType} - ${new Date().toLocaleDateString()}`,
        content: generatedContent,
        prompt: prompt,
        content_type: contentType,
        metadata: {
          tone,
          length,
          platform,
          generated_at: new Date().toISOString()
        }
      })
      .select()
      .single()

    if (saveError) {
      console.error('Error saving content draft:', saveError)
      throw new Error('Failed to save content draft')
    }

    // Track usage
    await supabaseClient.rpc('track_usage', {
      p_user_id: user.id,
      p_metric_type: 'content_generations_per_month',
      p_count: 1
    })

    return new Response(
      JSON.stringify({
        success: true,
        content: generatedContent,
        contentDraft: contentDraft
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    console.error('Content generation error:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal server error',
        details: 'Failed to generate content'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})