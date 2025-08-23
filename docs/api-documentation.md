# API Documentation

## Overview
This document provides comprehensive API documentation for all backend services, including request/response examples, authentication requirements, and error codes.

## Authentication

All API endpoints require authentication via Supabase Auth. Include the JWT token in the Authorization header:

```
Authorization: Bearer <jwt_token>
```

## Content Generation API

### Generate Content

**Endpoint:** `POST /api/content-generation`

**Description:** Generate AI-powered content using Google Gemini

**Authentication:** Required

**Request Body:**
```json
{
  "prompt": "Create a social media post about sustainable living",
  "contentType": "social_post",
  "tone": "professional",
  "length": "medium",
  "platform": "linkedin"
}
```

**Request Parameters:**
- `prompt` (string, required): The content generation prompt
- `contentType` (string, optional): Type of content to generate
  - Values: `social_post`, `blog_post`, `email`, `ad_copy`, `caption`
  - Default: `social_post`
- `tone` (string, optional): Tone of the generated content
  - Values: `professional`, `casual`, `friendly`, `humorous`, `formal`, `creative`
  - Default: `professional`
- `length` (string, optional): Length of the generated content
  - Values: `short`, `medium`, `long`
  - Default: `medium`
- `platform` (string, optional): Target social media platform
  - Values: `twitter`, `facebook`, `instagram`, `linkedin`, `youtube`, `tiktok`

**Success Response (200):**
```json
{
  "success": true,
  "content": "🌱 Sustainable living isn't just a trend—it's a necessity for our planet's future. Small changes in our daily routines can make a significant impact. Start with reducing single-use plastics, choosing renewable energy, and supporting eco-friendly brands. Every action counts! #Sustainability #EcoFriendly #GreenLiving",
  "contentDraft": {
    "id": "uuid",
    "user_id": "uuid",
    "title": "Generated social_post - 12/23/2024",
    "content": "Generated content...",
    "prompt": "Create a social media post about sustainable living",
    "content_type": "social_post",
    "status": "draft",
    "metadata": {
      "tone": "professional",
      "length": "medium",
      "platform": "linkedin",
      "generated_at": "2024-12-23T10:30:00Z"
    },
    "created_at": "2024-12-23T10:30:00Z",
    "updated_at": "2024-12-23T10:30:00Z"
  }
}
```

**Error Responses:**

**401 Unauthorized:**
```json
{
  "error": "Unauthorized"
}
```

**400 Bad Request:**
```json
{
  "error": "Prompt is required"
}
```

**429 Too Many Requests:**
```json
{
  "error": "Usage limit exceeded. Please upgrade your plan."
}
```

**500 Internal Server Error:**
```json
{
  "error": "Internal server error",
  "details": "Failed to generate content"
}
```

## Social Media Management API

### Post to Social Media

**Endpoint:** `POST /api/social-media-post`

**Description:** Post content to multiple social media platforms or schedule for later

**Authentication:** Required

**Request Body:**
```json
{
  "content": "🌱 Sustainable living isn't just a trend—it's a necessity for our planet's future.",
  "platforms": ["twitter", "linkedin", "facebook"],
  "scheduledFor": "2024-12-25T14:30:00Z",
  "mediaUrls": ["https://example.com/image.jpg"],
  "contentDraftId": "uuid"
}
```

**Request Parameters:**
- `content` (string, required): The content to post
- `platforms` (array, required): List of platforms to post to
  - Values: `facebook`, `twitter`, `instagram`, `linkedin`, `youtube`, `tiktok`, `pinterest`
- `scheduledFor` (string, optional): ISO 8601 timestamp for scheduling
- `mediaUrls` (array, optional): URLs of media files to include
- `contentDraftId` (string, optional): ID of the content draft being posted

**Success Response - Immediate Post (200):**
```json
{
  "success": true,
  "message": "Post published successfully",
  "externalIds": {
    "ayrshare_id": "ayr_123456",
    "twitter_id": "1234567890",
    "linkedin_id": "activity:6789012345"
  },
  "scheduledPost": {
    "id": "uuid",
    "user_id": "uuid",
    "platforms": ["twitter", "linkedin"],
    "scheduled_for": "2024-12-23T10:30:00Z",
    "status": "posted",
    "post_data": {
      "post": "Content...",
      "platforms": ["twitter", "linkedin"]
    },
    "external_ids": {
      "ayrshare_id": "ayr_123456"
    },
    "created_at": "2024-12-23T10:30:00Z"
  }
}
```

**Success Response - Scheduled Post (200):**
```json
{
  "success": true,
  "message": "Post scheduled successfully",
  "scheduledPost": {
    "id": "uuid",
    "user_id": "uuid",
    "platforms": ["twitter", "linkedin"],
    "scheduled_for": "2024-12-25T14:30:00Z",
    "status": "scheduled",
    "post_data": {
      "post": "Content...",
      "platforms": ["twitter", "linkedin"],
      "scheduleDate": "2024-12-25T14:30:00Z"
    },
    "created_at": "2024-12-23T10:30:00Z"
  }
}
```

**Error Responses:**

**400 Bad Request:**
```json
{
  "error": "Content and platforms are required"
}
```

**429 Too Many Requests:**
```json
{
  "error": "Usage limit exceeded. Please upgrade your plan."
}
```

## Supabase Edge Functions

### Content Generation Function

**Endpoint:** `https://<project-ref>.supabase.co/functions/v1/content-generation`

**Description:** Direct access to content generation edge function

**Headers:**
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

### Social Media Post Function

**Endpoint:** `https://<project-ref>.supabase.co/functions/v1/social-media-post`

**Description:** Direct access to social media posting edge function

### Stripe Webhook Function

**Endpoint:** `https://<project-ref>.supabase.co/functions/v1/stripe-webhook`

**Description:** Handles Stripe webhook events

**Headers:**
```
stripe-signature: <webhook_signature>
Content-Type: application/json
```

## Database API (via Supabase)

### Content Drafts

**Get User's Content Drafts:**
```sql
SELECT * FROM content_drafts 
WHERE user_id = auth.uid() 
ORDER BY created_at DESC
```

**Create Content Draft:**
```sql
INSERT INTO content_drafts (user_id, title, content, prompt, content_type, metadata)
VALUES (auth.uid(), $1, $2, $3, $4, $5)
RETURNING *
```

**Update Content Draft:**
```sql
UPDATE content_drafts 
SET title = $1, content = $2, status = $3, updated_at = now()
WHERE id = $4 AND user_id = auth.uid()
RETURNING *
```

### Scheduled Posts

**Get User's Scheduled Posts:**
```sql
SELECT sp.*, cd.title as content_title
FROM scheduled_posts sp
LEFT JOIN content_drafts cd ON sp.content_draft_id = cd.id
WHERE sp.user_id = auth.uid()
ORDER BY sp.scheduled_for DESC
```

**Get Post Analytics:**
```sql
SELECT pa.*
FROM post_analytics pa
JOIN scheduled_posts sp ON pa.scheduled_post_id = sp.id
WHERE sp.user_id = auth.uid()
ORDER BY pa.collected_at DESC
```

### Usage Tracking

**Check Usage Limit:**
```sql
SELECT check_usage_limit(auth.uid(), 'content_generations_per_month')
```

**Track Usage:**
```sql
SELECT track_usage(auth.uid(), 'content_generations_per_month', 1)
```

**Get Usage Metrics:**
```sql
SELECT * FROM usage_metrics 
WHERE user_id = auth.uid() 
AND period_start >= date_trunc('month', now())
```

## Error Codes

### HTTP Status Codes

- `200` - Success
- `400` - Bad Request (invalid parameters)
- `401` - Unauthorized (missing or invalid authentication)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found (resource doesn't exist)
- `429` - Too Many Requests (rate limit exceeded)
- `500` - Internal Server Error

### Custom Error Codes

- `USAGE_LIMIT_EXCEEDED` - User has exceeded their plan limits
- `INVALID_PLATFORM` - Unsupported social media platform
- `CONTENT_GENERATION_FAILED` - AI content generation failed
- `SOCIAL_POST_FAILED` - Social media posting failed
- `WEBHOOK_VERIFICATION_FAILED` - Webhook signature verification failed

## Rate Limits

### API Endpoints
- Content Generation: 100 requests per hour per user
- Social Media Post: 50 requests per hour per user
- General API: 1000 requests per hour per user

### Usage Limits (Plan-based)
- **Starter Plan**: 50 content generations, 100 social posts per month
- **Pro Plan**: 500 content generations, 1000 social posts per month
- **Enterprise Plan**: Unlimited

## Webhook Events

### Stripe Webhooks

**Supported Events:**
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

**Webhook Payload Example:**
```json
{
  "id": "evt_1234567890",
  "object": "event",
  "type": "customer.subscription.updated",
  "data": {
    "object": {
      "id": "sub_1234567890",
      "customer": "cus_1234567890",
      "status": "active",
      "items": {
        "data": [
          {
            "price": {
              "id": "price_1234567890",
              "product": "prod_1234567890"
            }
          }
        ]
      }
    }
  }
}
```

### Ayrshare Webhooks

**Supported Events:**
- `post.published`
- `post.failed`
- `analytics.updated`

**Webhook Payload Example:**
```json
{
  "type": "post.published",
  "data": {
    "id": "ayr_1234567890",
    "platforms": ["twitter", "linkedin"],
    "status": "published",
    "publishedAt": "2024-12-23T10:30:00Z"
  }
}
```

## SDK Examples

### JavaScript/TypeScript

```typescript
// Content Generation
const generateContent = async (prompt: string) => {
  const response = await fetch('/api/content-generation', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      prompt,
      contentType: 'social_post',
      tone: 'professional'
    })
  });
  
  return response.json();
};

// Social Media Post
const postToSocialMedia = async (content: string, platforms: string[]) => {
  const response = await fetch('/api/social-media-post', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      content,
      platforms
    })
  });
  
  return response.json();
};
```

### cURL Examples

```bash
# Generate Content
curl -X POST https://your-domain.com/api/content-generation \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "prompt": "Create a social media post about AI",
    "contentType": "social_post",
    "tone": "professional"
  }'

# Post to Social Media
curl -X POST https://your-domain.com/api/social-media-post \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "content": "AI is transforming the way we work!",
    "platforms": ["twitter", "linkedin"]
  }'
```