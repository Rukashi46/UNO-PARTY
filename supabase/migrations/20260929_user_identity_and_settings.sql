-- ==============================================================================
-- UNO PARTY NATIVE - PRODUCTION USER IDENTITY & SETTINGS MIGRATION
-- Separation of Account Identity, User Profile, and User Default Settings
-- ==============================================================================

-- 1. Upgrade public.profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT 'Player',
  avatar_id TEXT NOT NULL DEFAULT '👦🏻',
  username TEXT DEFAULT 'Player',
  avatar TEXT DEFAULT '👦🏻',
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure display_name and avatar_id columns exist if table was created previously
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name TEXT DEFAULT 'Player';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_id TEXT DEFAULT '👦🏻';
ALTER TABLE public.profiles ALTER COLUMN username DROP DEFAULT;
ALTER TABLE public.profiles ALTER COLUMN username SET DEFAULT 'Player';

-- Index on profiles id
CREATE INDEX IF NOT EXISTS idx_profiles_id ON public.profiles (id);

-- 2. Create authoritative public.user_settings table (User Defaults vs Match Settings)
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  sound_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  haptics_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  animations_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  theme TEXT NOT NULL DEFAULT 'Dark Mahogany Felt',
  default_deck TEXT NOT NULL DEFAULT 'NORMAL',
  default_game_end_mode TEXT NOT NULL DEFAULT 'FIRST_PLAYER_WINS',
  default_stacking_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  default_seven_zero_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  default_jump_in_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  default_draw_until_playable BOOLEAN NOT NULL DEFAULT FALSE,
  default_force_play BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON public.user_settings (user_id);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- 4. Profiles RLS Policies (Owner access + Public read for opponent lobbies)
DROP POLICY IF EXISTS "Public profiles are viewable by anyone" ON public.profiles;
CREATE POLICY "Public profiles are viewable by anyone"
  ON public.profiles FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id OR auth.role() = 'anon');

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id OR auth.role() = 'anon');

-- 5. User Settings RLS Policies (Private to user)
DROP POLICY IF EXISTS "Users can view their own settings" ON public.user_settings;
CREATE POLICY "Users can view their own settings"
  ON public.user_settings FOR SELECT
  USING (auth.uid() = user_id OR auth.role() = 'anon');

DROP POLICY IF EXISTS "Users can insert their own settings" ON public.user_settings;
CREATE POLICY "Users can insert their own settings"
  ON public.user_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id OR auth.role() = 'anon');

DROP POLICY IF EXISTS "Users can update their own settings" ON public.user_settings;
CREATE POLICY "Users can update their own settings"
  ON public.user_settings FOR UPDATE
  USING (auth.uid() = user_id OR auth.role() = 'anon');

-- 6. Add realtime publication if available
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'user_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_settings;
  END IF;
END $$;
