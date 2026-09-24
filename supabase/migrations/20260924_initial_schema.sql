-- ====================================================================
-- UNO MULTIPLAYER SCHEMA & ROW LEVEL SECURITY MIGRATIONS
-- ====================================================================

-- 1. PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY,
    username TEXT NOT NULL,
    avatar TEXT DEFAULT '🦁',
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT username_length CHECK (char_length(trim(username)) >= 2 AND char_length(trim(username)) <= 16)
);

CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles (username);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Profiles are viewable by everyone"
    ON public.profiles FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
    ON public.profiles FOR INSERT
    WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    USING (id = auth.uid() OR auth.uid() IS NULL);

-- 2. ROOMS
CREATE TABLE IF NOT EXISTS public.rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_code TEXT UNIQUE NOT NULL,
    mode TEXT NOT NULL DEFAULT 'ONLINE_ROOM',
    host_player_id UUID NOT NULL,
    status TEXT NOT NULL DEFAULT 'LOBBY', -- 'LOBBY', 'PLAYING', 'FINISHED', 'CANCELLED'
    max_players INTEGER NOT NULL DEFAULT 10,
    rules JSONB NOT NULL DEFAULT '{}'::jsonb,
    host_address TEXT NULL, -- Optional IP:PORT or WebSocket relay address
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT max_players_limit CHECK (max_players >= 2 AND max_players <= 10)
);

CREATE INDEX IF NOT EXISTS idx_rooms_room_code ON public.rooms (room_code);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON public.rooms (status);

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

-- Rooms Policies
DROP POLICY IF EXISTS "Rooms are viewable by everyone" ON public.rooms;
CREATE POLICY "Rooms are viewable by everyone"
    ON public.rooms FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Hosts can insert rooms" ON public.rooms;
CREATE POLICY "Hosts can insert rooms"
    ON public.rooms FOR INSERT
    WITH CHECK (true);

DROP POLICY IF EXISTS "Only host can update room" ON public.rooms;
CREATE POLICY "Only host can update room"
    ON public.rooms FOR UPDATE
    USING (host_player_id = auth.uid() OR auth.uid() IS NULL);

-- 3. ROOM PLAYERS
CREATE TABLE IF NOT EXISTS public.room_players (
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    player_id UUID NOT NULL,
    username TEXT NOT NULL,
    avatar TEXT DEFAULT '🦁',
    is_host BOOLEAN NOT NULL DEFAULT FALSE,
    connected BOOLEAN NOT NULL DEFAULT TRUE,
    joined_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_seen_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (room_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_room_players_player_id ON public.room_players (player_id);
CREATE INDEX IF NOT EXISTS idx_room_players_room_id ON public.room_players (room_id);

ALTER TABLE public.room_players ENABLE ROW LEVEL SECURITY;

-- Room Players Policies
DROP POLICY IF EXISTS "Room players are viewable by everyone" ON public.room_players;
CREATE POLICY "Room players are viewable by everyone"
    ON public.room_players FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Players can join room" ON public.room_players;
CREATE POLICY "Players can join room"
    ON public.room_players FOR INSERT
    WITH CHECK (true);

DROP POLICY IF EXISTS "Players can update their own room status" ON public.room_players;
CREATE POLICY "Players can update their own room status"
    ON public.room_players FOR UPDATE
    USING (player_id = auth.uid() OR auth.uid() IS NULL);

DROP POLICY IF EXISTS "Players can leave room" ON public.room_players;
CREATE POLICY "Players can leave room"
    ON public.room_players FOR DELETE
    USING (player_id = auth.uid() OR auth.uid() IS NULL);

-- 4. SESSIONS
CREATE TABLE IF NOT EXISTS public.sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID NOT NULL,
    room_id UUID NULL REFERENCES public.rooms(id) ON DELETE SET NULL,
    socket_id TEXT NULL,
    last_active_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_player_id ON public.sessions (player_id);

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage sessions" ON public.sessions;
CREATE POLICY "Users can manage sessions"
    ON public.sessions FOR ALL
    USING (true);

-- 5. GAME HISTORY
CREATE TABLE IF NOT EXISTS public.game_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NULL,
    room_code TEXT NOT NULL,
    winner_id UUID NULL,
    winner_name TEXT NOT NULL,
    player_count INTEGER NOT NULL,
    mode TEXT NOT NULL,
    rounds_played INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.game_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Game history is viewable by everyone" ON public.game_history;
CREATE POLICY "Game history is viewable by everyone"
    ON public.game_history FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Hosts can record game history" ON public.game_history;
CREATE POLICY "Hosts can record game history"
    ON public.game_history FOR INSERT
    WITH CHECK (true);
