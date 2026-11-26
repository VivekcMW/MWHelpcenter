CREATE TABLE IF NOT EXISTS help_chat_quota (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  minute_start timestamp without time zone NOT NULL,
  minute_count integer NOT NULL CHECK (minute_count >= 0),
  day_start timestamp without time zone NOT NULL,
  day_count integer NOT NULL CHECK (day_count >= 0)
);
INSERT INTO help_chat_quota (id, minute_start, minute_count, day_start, day_count)
VALUES (true, '1970-01-01', 0, '1970-01-01', 0)
ON CONFLICT (id) DO NOTHING;
