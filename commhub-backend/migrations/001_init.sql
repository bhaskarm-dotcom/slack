CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  color         TEXT NOT NULL DEFAULT 'bg-teal-500',
  initials      TEXT NOT NULL,
  presence      TEXT NOT NULL DEFAULT 'offline',
  title         TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS channels (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'public',
  topic       TEXT NOT NULL DEFAULT '',
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS channel_members (
  channel_id  UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (channel_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id    UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  sender_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  text          TEXT NOT NULL,
  parent_id     UUID REFERENCES messages(id) ON DELETE CASCADE,
  thread_count  INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at     TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS reactions (
  message_id  UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji       TEXT NOT NULL,
  PRIMARY KEY (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_messages_channel  ON messages(channel_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_messages_parent   ON messages(parent_id);
CREATE INDEX IF NOT EXISTS idx_channel_members_u ON channel_members(user_id);
CREATE INDEX IF NOT EXISTS idx_reactions_message ON reactions(message_id);

/* ── v2 additions (safe to re-run) ── */
ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS files (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  mime_type   TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes  BIGINT NOT NULL DEFAULT 0,
  data        TEXT NOT NULL,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_file_id UUID REFERENCES files(id) ON DELETE SET NULL;
