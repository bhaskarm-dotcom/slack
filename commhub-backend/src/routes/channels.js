const router = require('express').Router();
const db     = require('../db');

/* GET /api/channels */
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT c.id, c.name, c.type, c.topic,
              array_agg(cm.user_id::text) FILTER (WHERE cm.user_id IS NOT NULL) AS members
       FROM channels c
       LEFT JOIN channel_members cm ON cm.channel_id = c.id
       WHERE c.type = 'public'
          OR EXISTS (SELECT 1 FROM channel_members m WHERE m.channel_id=c.id AND m.user_id=$1)
       GROUP BY c.id ORDER BY c.created_at`,
      [req.user.id]
    );
    res.json(rows.map(r => ({ ...r, members: r.members || [] })));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

/* POST /api/channels  — create a channel */
router.post('/', async (req, res) => {
  const { name, type = 'public', topic = '' } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Channel name required' });
  const cleanName = name.trim().toLowerCase().replace(/\s+/g, '-');
  try {
    const exists = await db.query(`SELECT id FROM channels WHERE name=$1`,[cleanName]);
    if (exists.rows.length) return res.status(409).json({ error: 'Channel already exists' });
    const { rows } = await db.query(
      `INSERT INTO channels(name,type,topic,created_by) VALUES($1,$2,$3,$4) RETURNING id,name,type,topic`,
      [cleanName, type, topic, req.user.id]
    );
    const ch = rows[0];
    await db.query(`INSERT INTO channel_members(channel_id,user_id) VALUES($1,$2)`,[ch.id, req.user.id]);
    if (type === 'public') {
      const others = await db.query(`SELECT id FROM users WHERE id != $1`,[req.user.id]);
      for (const u of others.rows)
        await db.query(`INSERT INTO channel_members(channel_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[ch.id,u.id]);
    }
    const members = await db.query(`SELECT user_id FROM channel_members WHERE channel_id=$1`,[ch.id]);
    res.status(201).json({ ...ch, members: members.rows.map(r=>r.user_id) });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

/* GET /api/channels/dm/:userId  — get or create DM channel */
router.get('/dm/:userId', async (req, res) => {
  const { userId } = req.params;
  const myId = req.user.id;
  const dmName = [myId, userId].sort().join('__dm__');
  try {
    let ch = await db.query(`SELECT id,name,type,topic FROM channels WHERE name=$1`,[dmName]);
    if (!ch.rows.length) {
      const ins = await db.query(
        `INSERT INTO channels(name,type,topic) VALUES($1,'dm','') RETURNING id,name,type,topic`,[dmName]
      );
      ch = ins;
      await db.query(`INSERT INTO channel_members(channel_id,user_id) VALUES($1,$2),($1,$3)`,[ch.rows[0].id, myId, userId]);
    }
    const members = await db.query(`SELECT user_id FROM channel_members WHERE channel_id=$1`,[ch.rows[0].id]);
    res.json({ ...ch.rows[0], members: members.rows.map(r=>r.user_id) });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
