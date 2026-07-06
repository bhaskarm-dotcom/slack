const router = require('express').Router();
const db     = require('../db');

const initialsFor = n => n.trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();

/* GET /api/users */
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, name, email, color, initials, presence, title,
              CASE WHEN avatar_file_id IS NOT NULL
                   THEN '/api/files/' || avatar_file_id::text
                   ELSE NULL END AS avatar_url
       FROM users ORDER BY name`
    );
    const map = {};
    for (const u of rows) map[u.id] = u;
    res.json(map);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

/* PATCH /api/users/me/presence */
router.patch('/me/presence', async (req, res) => {
  const { presence } = req.body;
  if (!['online','away','dnd','offline'].includes(presence))
    return res.status(400).json({ error: 'Invalid presence' });
  try {
    await db.query(`UPDATE users SET presence=$1 WHERE id=$2`, [presence, req.user.id]);
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

/* PATCH /api/users/me — update profile */
router.patch('/me', async (req, res) => {
  const { name, title, color, avatarFileId } = req.body;
  const sets = [], vals = [];
  let i = 1;
  if (name?.trim()) {
    sets.push(`name=$${i++}`, `initials=$${i++}`);
    vals.push(name.trim(), initialsFor(name));
  }
  if (title !== undefined) { sets.push(`title=$${i++}`); vals.push(title||''); }
  if (color)               { sets.push(`color=$${i++}`); vals.push(color); }
  if (avatarFileId)        { sets.push(`avatar_file_id=$${i++}`); vals.push(avatarFileId); }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
  vals.push(req.user.id);
  try {
    const { rows } = await db.query(
      `UPDATE users SET ${sets.join(',')} WHERE id=$${i}
       RETURNING id, name, email, color, initials, presence, title,
                 CASE WHEN avatar_file_id IS NOT NULL
                      THEN '/api/files/' || avatar_file_id::text
                      ELSE NULL END AS avatar_url`,
      vals
    );
    res.json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
