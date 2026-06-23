const router = require('express').Router();
const db     = require('../db');

/* GET /api/users  — everyone in the workspace */
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id,name,email,color,initials,presence,title FROM users ORDER BY name`
    );
    const map = {};
    for (const u of rows) map[u.id] = u;
    res.json(map);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

/* PATCH /api/users/me/presence */
router.patch('/me/presence', async (req, res) => {
  const { presence } = req.body;
  const valid = ['online','away','dnd','offline'];
  if (!valid.includes(presence)) return res.status(400).json({ error: 'Invalid presence value' });
  try {
    await db.query(`UPDATE users SET presence=$1 WHERE id=$2`,[presence, req.user.id]);
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
