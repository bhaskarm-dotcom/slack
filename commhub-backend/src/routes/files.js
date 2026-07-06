const router = require('express').Router();
const db     = require('../db');

/* POST /api/files — upload (base64) */
router.post('/', async (req, res) => {
  const { name, mimeType, sizeBytes, data } = req.body;
  if (!name || !data) return res.status(400).json({ error: 'name and data required' });
  if ((sizeBytes || 0) > 8 * 1024 * 1024)
    return res.status(413).json({ error: 'File too large (max 8 MB)' });
  try {
    const { rows } = await db.query(
      `INSERT INTO files(name,mime_type,size_bytes,data,uploaded_by)
       VALUES($1,$2,$3,$4,$5) RETURNING id,name,size_bytes`,
      [name, mimeType||'application/octet-stream', sizeBytes||0, data, req.user.id]
    );
    res.json({ fileId: rows[0].id, name: rows[0].name, size: rows[0].size_bytes });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

/* GET /api/files/:id — download */
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT name,mime_type,data FROM files WHERE id=$1`, [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const buf = Buffer.from(rows[0].data, 'base64');
    res.setHeader('Content-Disposition', `attachment; filename="${rows[0].name}"`);
    res.setHeader('Content-Type', rows[0].mime_type);
    res.setHeader('Content-Length', buf.length);
    res.send(buf);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
