/*
  # Social Media Management Schema

  1. New Tables
    - `social_media_accounts`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references profiles)
      - `platform` (text)
      - `account_id` (text)
      - `account_name` (text)
      - `access_token` (text, encrypted)
      - `refresh_token` (text, encrypted)
      - `expires_at` (timestamp)
      - `is_active` (boolean)
      - `metadata` (jsonb)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
    
    - `scheduled_posts`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references profiles)
      - `content_draft_id` (uuid, references content_drafts)
      - `platforms` (text[])
      - `scheduled_for` (timestamp)
      - `status` (text)
      - `post_data` (jsonb)
      - `external_ids` (jsonb)
      - `error_message` (text)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
    
    - `post_analytics`
      - `id` (uuid, primary key)
      - `scheduled_post_id` (uuid, references scheduled_posts)
      - `platform` (text)
      - `external_id` (text)
      - `metrics` (jsonb)
      - `collected_at` (timestamp)

  2. Security
    - Enable RLS on all tables
    - Add policies for user data access
    - Encrypt sensitive token data
*/

-- Create social_media_accounts table
CREATE TABLE IF NOT EXISTS social_media_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  platform text NOT NULL CHECK (platform IN ('facebook', 'twitter', 'instagram', 'linkedin', 'youtube', 'tiktok', 'pinterest')),
  account_id text NOT NULL,
  account_name text NOT NULL,
  access_token text, -- Will be encrypted at application level
  refresh_token text, -- Will be encrypted at application level
  expires_at timestamptz,
  is_active boolean DEFAULT true,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, platform, account_id)
);

-- Create scheduled_posts table
CREATE TABLE IF NOT EXISTS scheduled_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  content_draft_id uuid REFERENCES content_drafts(id) ON DELETE SET NULL,
  platforms text[] NOT NULL,
  scheduled_for timestamptz NOT NULL,
  status text DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'posting', 'posted', 'failed', 'cancelled')),
  post_data jsonb NOT NULL DEFAULT '{}',
  external_ids jsonb DEFAULT '{}', -- Store platform-specific post IDs
  error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create post_analytics table
CREATE TABLE IF NOT EXISTS post_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_post_id uuid REFERENCES scheduled_posts(id) ON DELETE CASCADE NOT NULL,
  platform text NOT NULL,
  external_id text NOT NULL,
  metrics jsonb DEFAULT '{}', -- likes, shares, comments, impressions, etc.
  collected_at timestamptz DEFAULT now(),
  UNIQUE(scheduled_post_id, platform)
);

-- Enable RLS
ALTER TABLE social_media_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_analytics ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for social_media_accounts
CREATE POLICY "Users can manage own social accounts"
  ON social_media_accounts
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid());

-- Create RLS policies for scheduled_posts
CREATE POLICY "Users can manage own scheduled posts"
  ON scheduled_posts
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid());

-- Create RLS policies for post_analytics
CREATE POLICY "Users can read own post analytics"
  ON post_analytics
  FOR SELECT
  TO authenticated
  USING (
    scheduled_post_id IN (
      SELECT id FROM scheduled_posts WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert post analytics"
  ON post_analytics
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "System can update post analytics"
  ON post_analytics
  FOR UPDATE
  TO service_role
  USING (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_social_accounts_user_id ON social_media_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_social_accounts_platform ON social_media_accounts(platform);
CREATE INDEX IF NOT EXISTS idx_social_accounts_active ON social_media_accounts(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_scheduled_posts_user_id ON scheduled_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_status ON scheduled_posts(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_scheduled_for ON scheduled_posts(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_platforms ON scheduled_posts USING GIN(platforms);

CREATE INDEX IF NOT EXISTS idx_post_analytics_scheduled_post ON post_analytics(scheduled_post_id);
CREATE INDEX IF NOT EXISTS idx_post_analytics_platform ON post_analytics(platform);
CREATE INDEX IF NOT EXISTS idx_post_analytics_collected_at ON post_analytics(collected_at DESC);

-- Create triggers for updated_at
CREATE TRIGGER social_media_accounts_updated_at
  BEFORE UPDATE ON social_media_accounts
  FOR EACH ROW
  EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER scheduled_posts_updated_at
  BEFORE UPDATE ON scheduled_posts
  FOR EACH ROW
  EXECUTE FUNCTION handle_updated_at();

-- Create function to get posts ready for publishing
CREATE OR REPLACE FUNCTION get_posts_ready_for_publishing()
RETURNS TABLE (
  post_id uuid,
  user_id uuid,
  platforms text[],
  post_data jsonb,
  scheduled_for timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sp.id,
    sp.user_id,
    sp.platforms,
    sp.post_data,
    sp.scheduled_for
  FROM scheduled_posts sp
  WHERE sp.status = 'scheduled'
    AND sp.scheduled_for <= now()
  ORDER BY sp.scheduled_for ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to update post status
CREATE OR REPLACE FUNCTION update_post_status(
  post_id uuid,
  new_status text,
  external_post_ids jsonb DEFAULT NULL,
  error_msg text DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  UPDATE scheduled_posts
  SET 
    status = new_status,
    external_ids = COALESCE(external_post_ids, external_ids),
    error_message = error_msg,
    updated_at = now()
  WHERE id = post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;