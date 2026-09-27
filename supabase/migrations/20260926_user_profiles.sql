-- ==============================================================================
-- UNO PARTY NATIVE - USER PROFILES & SETTINGS SCHEMA
-- ==============================================================================

-- 1. Create or alter Profiles table with settings JSONB support
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY,
  username TEXT NOT NULL DEFAULT 'VARUN',
  avatar TEXT NOT NULL DEFAULT '👦🏻',
  settings JSONB NOT NULL DEFAULT '{"soundEnabled":true,"musicEnabled":true,"hapticsEnabled":true,"animationsEnabled":true,"cardConfirmation":true,"turnNotifications":true,"theme":"Dark Mahogany Felt","language":"English (US)"}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure settings column exists if table was created previously without it
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{"soundEnabled":true,"musicEnabled":true,"hapticsEnabled":true,"animationsEnabled":true,"cardConfirmation":true,"turnNotifications":true,"theme":"Dark Mahogany Felt","language":"English (US)"}'::jsonb;

-- 2. Index for lookup
CREATE INDEX IF NOT EXISTS idx_profiles_id ON public.profiles (id);

-- 3. Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 4. Policies (Allow anonymous/public key to read & upsert profiles by unique user id)
DROP POLICY IF EXISTS "Public profiles are viewable by anyone" ON public.profiles;
CREATE POLICY "Public profiles are viewable by anyone"
  ON public.profiles FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Anyone can insert profile" ON public.profiles;
CREATE POLICY "Anyone can insert profile"
  ON public.profiles FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can update profile" ON public.profiles;
CREATE POLICY "Anyone can update profile"
  ON public.profiles FOR UPDATE
  USING (true);
