/*
  # Subscription and Usage Tracking Schema

  1. New Tables
    - `subscription_plans`
      - `id` (uuid, primary key)
      - `name` (text)
      - `stripe_price_id` (text)
      - `features` (jsonb)
      - `limits` (jsonb)
      - `price` (integer)
      - `currency` (text)
      - `interval` (text)
      - `is_active` (boolean)
      - `created_at` (timestamp)
    
    - `usage_metrics`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references profiles)
      - `metric_type` (text)
      - `count` (integer)
      - `period_start` (timestamp)
      - `period_end` (timestamp)
      - `created_at` (timestamp)
    
    - `feature_entitlements`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references profiles)
      - `feature_name` (text)
      - `limit_value` (integer)
      - `current_usage` (integer)
      - `reset_period` (text)
      - `last_reset` (timestamp)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on all tables
    - Add policies for user data access
    - Create functions for usage tracking
*/

-- Create subscription_plans table
CREATE TABLE IF NOT EXISTS subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  stripe_price_id text UNIQUE NOT NULL,
  features jsonb DEFAULT '{}',
  limits jsonb DEFAULT '{}',
  price integer NOT NULL, -- Price in cents
  currency text DEFAULT 'usd',
  interval text NOT NULL CHECK (interval IN ('month', 'year')),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Create usage_metrics table
CREATE TABLE IF NOT EXISTS usage_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  metric_type text NOT NULL CHECK (metric_type IN ('content_generation', 'social_posts', 'api_calls', 'storage_used')),
  count integer DEFAULT 1,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create feature_entitlements table
CREATE TABLE IF NOT EXISTS feature_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  feature_name text NOT NULL,
  limit_value integer NOT NULL,
  current_usage integer DEFAULT 0,
  reset_period text DEFAULT 'month' CHECK (reset_period IN ('day', 'week', 'month', 'year')),
  last_reset timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, feature_name)
);

-- Enable RLS
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_entitlements ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for subscription_plans (public read)
CREATE POLICY "Anyone can read active subscription plans"
  ON subscription_plans
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Create RLS policies for usage_metrics
CREATE POLICY "Users can read own usage metrics"
  ON usage_metrics
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "System can insert usage metrics"
  ON usage_metrics
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Create RLS policies for feature_entitlements
CREATE POLICY "Users can read own feature entitlements"
  ON feature_entitlements
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "System can manage feature entitlements"
  ON feature_entitlements
  FOR ALL
  TO service_role
  USING (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_subscription_plans_stripe_price_id ON subscription_plans(stripe_price_id);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_active ON subscription_plans(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_usage_metrics_user_id ON usage_metrics(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_metrics_type ON usage_metrics(metric_type);
CREATE INDEX IF NOT EXISTS idx_usage_metrics_period ON usage_metrics(period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_feature_entitlements_user_id ON feature_entitlements(user_id);
CREATE INDEX IF NOT EXISTS idx_feature_entitlements_feature ON feature_entitlements(feature_name);

-- Create trigger for updated_at
CREATE TRIGGER feature_entitlements_updated_at
  BEFORE UPDATE ON feature_entitlements
  FOR EACH ROW
  EXECUTE FUNCTION handle_updated_at();

-- Insert default subscription plans
INSERT INTO subscription_plans (name, stripe_price_id, features, limits, price, interval) VALUES
  ('Starter', 'price_starter_monthly', 
   '{"ai_content_generation": true, "social_posting": true, "analytics": false, "team_collaboration": false}',
   '{"content_generations_per_month": 50, "social_posts_per_month": 100, "social_accounts": 3}',
   900, 'month'),
  ('Pro', 'price_pro_monthly',
   '{"ai_content_generation": true, "social_posting": true, "analytics": true, "team_collaboration": true}',
   '{"content_generations_per_month": 500, "social_posts_per_month": 1000, "social_accounts": 10}',
   2900, 'month'),
  ('Enterprise', 'price_enterprise_monthly',
   '{"ai_content_generation": true, "social_posting": true, "analytics": true, "team_collaboration": true, "priority_support": true}',
   '{"content_generations_per_month": -1, "social_posts_per_month": -1, "social_accounts": -1}',
   9900, 'month')
ON CONFLICT (stripe_price_id) DO NOTHING;

-- Create function to track usage
CREATE OR REPLACE FUNCTION track_usage(
  p_user_id uuid,
  p_metric_type text,
  p_count integer DEFAULT 1
)
RETURNS void AS $$
DECLARE
  current_period_start timestamptz;
  current_period_end timestamptz;
BEGIN
  -- Calculate current period (monthly)
  current_period_start := date_trunc('month', now());
  current_period_end := current_period_start + interval '1 month';
  
  -- Insert or update usage metrics
  INSERT INTO usage_metrics (user_id, metric_type, count, period_start, period_end)
  VALUES (p_user_id, p_metric_type, p_count, current_period_start, current_period_end)
  ON CONFLICT (user_id, metric_type, period_start, period_end) 
  DO UPDATE SET 
    count = usage_metrics.count + p_count,
    created_at = now();
    
  -- Update feature entitlements current usage
  UPDATE feature_entitlements
  SET 
    current_usage = current_usage + p_count,
    updated_at = now()
  WHERE user_id = p_user_id 
    AND feature_name = p_metric_type;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to check usage limits
CREATE OR REPLACE FUNCTION check_usage_limit(
  p_user_id uuid,
  p_feature_name text
)
RETURNS boolean AS $$
DECLARE
  entitlement_record feature_entitlements%ROWTYPE;
BEGIN
  SELECT * INTO entitlement_record
  FROM feature_entitlements
  WHERE user_id = p_user_id AND feature_name = p_feature_name;
  
  -- If no entitlement found, deny access
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- If limit is -1, it means unlimited
  IF entitlement_record.limit_value = -1 THEN
    RETURN true;
  END IF;
  
  -- Check if current usage is within limits
  RETURN entitlement_record.current_usage < entitlement_record.limit_value;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to reset usage counters
CREATE OR REPLACE FUNCTION reset_usage_counters()
RETURNS void AS $$
BEGIN
  -- Reset monthly counters
  UPDATE feature_entitlements
  SET 
    current_usage = 0,
    last_reset = now(),
    updated_at = now()
  WHERE reset_period = 'month'
    AND last_reset < date_trunc('month', now());
    
  -- Reset daily counters
  UPDATE feature_entitlements
  SET 
    current_usage = 0,
    last_reset = now(),
    updated_at = now()
  WHERE reset_period = 'day'
    AND last_reset < date_trunc('day', now());
    
  -- Reset weekly counters
  UPDATE feature_entitlements
  SET 
    current_usage = 0,
    last_reset = now(),
    updated_at = now()
  WHERE reset_period = 'week'
    AND last_reset < date_trunc('week', now());
    
  -- Reset yearly counters
  UPDATE feature_entitlements
  SET 
    current_usage = 0,
    last_reset = now(),
    updated_at = now()
  WHERE reset_period = 'year'
    AND last_reset < date_trunc('year', now());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to initialize user entitlements based on subscription
CREATE OR REPLACE FUNCTION initialize_user_entitlements(
  p_user_id uuid,
  p_stripe_price_id text
)
RETURNS void AS $$
DECLARE
  plan_record subscription_plans%ROWTYPE;
  limit_key text;
  limit_value integer;
BEGIN
  -- Get the subscription plan
  SELECT * INTO plan_record
  FROM subscription_plans
  WHERE stripe_price_id = p_stripe_price_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription plan not found for price_id: %', p_stripe_price_id;
  END IF;
  
  -- Clear existing entitlements
  DELETE FROM feature_entitlements WHERE user_id = p_user_id;
  
  -- Create entitlements based on plan limits
  FOR limit_key, limit_value IN
    SELECT key, value::integer
    FROM jsonb_each_text(plan_record.limits)
  LOOP
    INSERT INTO feature_entitlements (user_id, feature_name, limit_value)
    VALUES (p_user_id, limit_key, limit_value)
    ON CONFLICT (user_id, feature_name) 
    DO UPDATE SET 
      limit_value = EXCLUDED.limit_value,
      updated_at = now();
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;