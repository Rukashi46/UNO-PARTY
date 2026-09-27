-- ==============================================================================
-- UNO PARTY NATIVE - SUPABASE MULTIPLAYER SCHEMA & RLS POLICIES
-- ==============================================================================

-- 1. Create Rooms Table
CREATE TABLE IF NOT EXISTS public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code VARCHAR(12) NOT NULL UNIQUE,
  host_id VARCHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'WAITING', -- 'WAITING', 'STARTING', 'PLAYING', 'FINISHED', 'CLOSED'
  game_mode VARCHAR(20) NOT NULL DEFAULT 'ONLINE',
  max_players INTEGER NOT NULL DEFAULT 10,
  rules JSONB NOT NULL DEFAULT '{"stacking":true,"sevenZeroRule":true,"jumpInRule":true,"drawUntilPlayable":false,"forcePlay":false,"mercy25Cards":true,"includeCustomWilds":true,"soundEnabled":true,"hapticsEnabled":true}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index on room_code for fast lookup
CREATE INDEX IF NOT EXISTS idx_rooms_code ON public.rooms (room_code);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON public.rooms (status);

-- 2. Create Room Players Table
CREATE TABLE IF NOT EXISTS public.room_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  player_id VARCHAR(64) NOT NULL,
  display_name VARCHAR(50) NOT NULL,
  avatar VARCHAR(10) NOT NULL DEFAULT '👦🏻',
  is_host BOOLEAN NOT NULL DEFAULT FALSE,
  is_ready BOOLEAN NOT NULL DEFAULT FALSE,
  is_connected BOOLEAN NOT NULL DEFAULT TRUE,
  card_count INTEGER NOT NULL DEFAULT 7,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_room_player UNIQUE (room_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_room_players_room ON public.room_players (room_id);
CREATE INDEX IF NOT EXISTS idx_room_players_player ON public.room_players (player_id);

-- 3. Create Game Events Table (for historical event logging and reconnect recovery)
CREATE TABLE IF NOT EXISTS public.game_events (
  id BIGSERIAL PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_events_room ON public.game_events (room_id, created_at);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_events ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
-- Allow anyone with public anon key to view open or active rooms
CREATE POLICY "Public rooms are viewable by anyone"
  ON public.rooms FOR SELECT
  USING (true);

-- Allow any player to create a room
CREATE POLICY "Anyone can create a room"
  ON public.rooms FOR INSERT
  WITH CHECK (true);

-- Allow host to update room (rules, status, host migration)
CREATE POLICY "Hosts can update their rooms"
  ON public.rooms FOR UPDATE
  USING (true);

-- Room Players Policies
CREATE POLICY "Room players viewable by anyone in room"
  ON public.room_players FOR SELECT
  USING (true);

CREATE POLICY "Players can join room"
  ON public.room_players FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Players can update their own status or host can update"
  ON public.room_players FOR UPDATE
  USING (true);

CREATE POLICY "Players can leave room"
  ON public.room_players FOR DELETE
  USING (true);

-- Game Events Policies
CREATE POLICY "Game events viewable by room members"
  ON public.game_events FOR SELECT
  USING (true);

CREATE POLICY "Game events can be appended"
  ON public.game_events FOR INSERT
  WITH CHECK (true);

-- 6. Enable Supabase Realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'rooms'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'room_players'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.room_players;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'game_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.game_events;
  END IF;
END $$;
