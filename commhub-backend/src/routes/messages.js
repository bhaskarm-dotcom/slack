const router = require('express').Router();
const db     = require('../db');

async function buildMessages(channelId) {
  const msgsRes = await db.query(
    `SELECT id, channel_id AS "channelId", sender_id AS "senderId", text,
            thread_count AS "threadCount",
            EXTRACT(EPOCH FROM created_at)*1000 AS t
     FROM messages WHERE channel_id=$1 AND parent_id IS NULL
     ORDER BY created_at ASC LIMIT 200`,
    [channelId]
  );
  const msgs = msgsRes.rows;
  if (!msgs.length) return [];

  const ids = msgs.map(m => m.id);

  const reactRes = await db.query(
    `SELECT message_id, emoji, array_agg(user_id::text) AS users
     FROM reactions WHERE message_id = ANY($1::uuid[])
     GROUP BY message_id, emoji`,
    [ids]
  );
  const threadRes = await db.query(
    `SELECT id, parent_id AS "parentId", sender_id AS "senderId", text,
            EXTRACT(EPOCH FROM created_at)*1000 AS t
     FROM messages WHERE parent_id = ANY($1::uuid[]) ORDER BY created_at ASC`,
    [ids]
  );

  const reactMap  = {};
  for (const r of reactRes.rows) {
    if (!reactMap[r.message_id]) reactMap[r.message_id] = [];
    reactMap[r.message_id].push({ emoji: r.emoji, users: r.users });
  }
  const threadMap = {};
  for (const t of threadRes.rows) {
    if (!threadMap[t.parentId]) threadMap[t.parentId] = [];
    threadMap[t.parentId].push({ ...t, reactions: [], thread: [], threadCount: 0 });
  }

  return msgs.map(m => ({
    ...m,
    t: parseFloat(m.t),
    reactions: reactMap[m.id] || [],
    thread: (threadMap[m.id] || []).map(tm => ({ ...tm, t: parseFloat(tm.t) })),
  }));
}

/* GET /api/messages/:channelId */
router.get('/:channelId', async (req, res) => {
  try {
    res.json({ messages: await buildMessages(req.params.channelId) });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

/* POST /api/messages */
router.post('/', async (req, res) => {
  const { channelId, text, parentId } = req.body;
  if (!channelId || !text?.trim()) return res.status(400).json({ error: 'channelId and text required' });
  try {
    const { rows } = await db.query(
      `INSERT INTO messages(channel_id,sender_id,text,parent_id)
       VALUES($1,$2,$3,$4)
       RETURNING id, channel_id AS "channelId", sender_id AS "senderId", text, parent_id AS "parentId",
                 thread_count AS "threadCount", EXTRACT(EPOCH FROM created_at)*1000 AS t`,
      [channelId, req.user.id, text.trim(), parentId || null]
    );
    const msg = rows[0];
    if (parentId) {
      await db.query(`UPDATE messages SET thread_count=thread_count+1 WHERE id=$1`,[parentId]);
    }
    res.status(201).json({ ...msg, reactions: [], thread: [] });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

/* POST /api/messages/:id/react */
router.post('/:id/react', async (req, res) => {
  const { emoji } = req.body;
  if (!emoji) return res.status(400).json({ error: 'emoji required' });
  try {
    const existing = await db.query(
      `SELECT 1 FROM reactions WHERE message_id=$1 AND user_id=$2 AND emoji=$3`,
      [req.params.id, req.user.id, emoji]
    );
    if (existing.rows.length) {
      await db.query(`DELETE FROM reactions WHERE message_id=$1 AND user_id=$2 AND emoji=$3`,[req.params.id, req.user.id, emoji]);
    } else {
      await db.query(`INSERT INTO reactions(message_id,user_id,emoji) VALUES($1,$2,$3)`,[req.params.id, req.user.id, emoji]);
    }
    const { rows } = await db.query(
      `SELECT emoji, array_agg(user_id::text) AS users FROM reactions WHERE message_id=$1 GROUP BY emoji`,
      [req.params.id]
    );
    res.json({ reactions: rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
