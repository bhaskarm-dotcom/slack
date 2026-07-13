const { verifySocketToken } = require('./middleware/auth');
const db = require('./db');

function setupSocket(io) {
  /* Auth middleware — every socket must send a valid JWT */
  io.use((socket, next) => {
    try {
      socket.user = verifySocketToken(socket.handshake.auth?.token);
      next();
    } catch {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.user.id;
    socket.data.userId = userId;  // survives io.fetchSockets()
    console.log(`[socket] ${socket.user.name} connected`);

    /* Set presence online and join channel rooms */
    try {
      await db.query(`UPDATE users SET presence='online' WHERE id=$1`, [userId]);
      const { rows } = await db.query(
        `SELECT channel_id FROM channel_members WHERE user_id=$1`, [userId]
      );
      for (const r of rows) socket.join(r.channel_id);
      io.emit('user:presence', { userId, presence: 'online' });
    } catch (err) { console.error(err); }

    /* ── Send a message ── */
    socket.on('message:send', async ({ channelId, text, parentId }) => {
      if (!text?.trim() || !channelId) return;
      try {
        const { rows } = await db.query(
          `INSERT INTO messages(channel_id,sender_id,text,parent_id)
           VALUES($1,$2,$3,$4)
           RETURNING id, channel_id AS "channelId", sender_id AS "senderId", text,
                     parent_id AS "parentId", thread_count AS "threadCount",
                     EXTRACT(EPOCH FROM created_at)*1000 AS t`,
          [channelId, userId, text.trim(), parentId || null]
        );
        const msg = { ...rows[0], t: parseFloat(rows[0].t), reactions: [], thread: [] };
        if (parentId) {
          const upd = await db.query(
            `UPDATE messages SET thread_count=thread_count+1 WHERE id=$1
             RETURNING thread_count AS "threadCount"`,
            [parentId]
          );
          io.to(channelId).emit('thread:new', { parentId, msg, threadCount: upd.rows[0].threadCount });
        } else {
          io.to(channelId).emit('message:new', msg);
        }
      } catch (err) { console.error(err); }
    });

    /* ── Edit message ── */
    socket.on('message:edit', async ({ id, channelId, text }) => {
      if (!text?.trim() || !id) return;
      try {
        const { rows } = await db.query(
          `UPDATE messages SET text=$1, edited_at=NOW()
           WHERE id=$2 AND sender_id=$3 AND deleted=FALSE
           RETURNING id, text, EXTRACT(EPOCH FROM edited_at)*1000 AS "editedAt"`,
          [text.trim(), id, userId]
        );
        if (rows.length) {
          io.to(channelId).emit('message:edited', {
            id, channelId, text: rows[0].text, editedAt: parseFloat(rows[0].editedAt)
          });
        }
      } catch (err) { console.error('edit error', err); }
    });

    /* ── Delete message (soft delete) ── */
    socket.on('message:delete', async ({ id, channelId }) => {
      if (!id) return;
      try {
        const { rows } = await db.query(
          `UPDATE messages SET deleted=TRUE, text='[message deleted]'
           WHERE id=$1 AND sender_id=$2 RETURNING id`,
          [id, userId]
        );
        if (rows.length) io.to(channelId).emit('message:deleted', { id, channelId });
      } catch (err) { console.error('delete error', err); }
    });

    /* ── Forward message ── */
    socket.on('message:forward', async ({ text, toChannelId }) => {
      if (!text || !toChannelId) return;
      try {
        const { rows } = await db.query(
          `INSERT INTO messages(channel_id,sender_id,text)
           VALUES($1,$2,$3)
           RETURNING id, channel_id AS "channelId", sender_id AS "senderId", text,
                     EXTRACT(EPOCH FROM created_at)*1000 AS t`,
          [toChannelId, userId, text]
        );
        if (rows.length) {
          const msg = { ...rows[0], t: parseFloat(rows[0].t), reactions: [], thread: [], threadCount: 0 };
          io.to(toChannelId).emit('message:new', msg);
        }
      } catch (err) { console.error('forward error', err); }
    });

    /* ── Toggle reaction ── */
    socket.on('reaction:toggle', async ({ messageId, channelId, emoji }) => {
      try {
        const ex = await db.query(
          `SELECT 1 FROM reactions WHERE message_id=$1 AND user_id=$2 AND emoji=$3`,
          [messageId, userId, emoji]
        );
        if (ex.rows.length) {
          await db.query(`DELETE FROM reactions WHERE message_id=$1 AND user_id=$2 AND emoji=$3`,[messageId,userId,emoji]);
        } else {
          await db.query(`INSERT INTO reactions(message_id,user_id,emoji) VALUES($1,$2,$3)`,[messageId,userId,emoji]);
        }
        const { rows } = await db.query(
          `SELECT emoji, array_agg(user_id::text) AS users FROM reactions WHERE message_id=$1 GROUP BY emoji`,
          [messageId]
        );
        io.to(channelId).emit('reaction:update', { messageId, reactions: rows });
      } catch (err) { console.error(err); }
    });

    /* ── Create channel ── */
    socket.on('channel:create', async ({ name, type = 'public', topic = '', memberIds = [] }) => {
      const cleanName = name.trim().toLowerCase().replace(/\s+/g,'-');
      if (!cleanName) return;
      try {
        const ex = await db.query(`SELECT id FROM channels WHERE name=$1`,[cleanName]);
        if (ex.rows.length) { socket.emit('channel:error', { error: 'Channel already exists' }); return; }
        const { rows } = await db.query(
          `INSERT INTO channels(name,type,topic,created_by) VALUES($1,$2,$3,$4) RETURNING id,name,type,topic`,
          [cleanName,type,topic,userId]
        );
        const ch = rows[0];

        // Determine the member set
        let memberSet;
        if (type === 'public') {
          const users = await db.query(`SELECT id FROM users`);
          memberSet = users.rows.map(u => u.id);
        } else {
          // private: creator + explicitly selected members only
          memberSet = Array.from(new Set([userId, ...(Array.isArray(memberIds) ? memberIds : [])]));
        }

        for (const uid of memberSet) {
          await db.query(
            `INSERT INTO channel_members(channel_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,
            [ch.id, uid]
          );
        }

        const members = await db.query(`SELECT user_id FROM channel_members WHERE channel_id=$1`,[ch.id]);
        const full = { ...ch, members: members.rows.map(r=>r.user_id) };

        // Join only the sockets of members to this room, and notify only them
        const sockets = await io.fetchSockets();
        const memberIdStrs = memberSet.map(String);
        for (const s of sockets) {
          if (memberIdStrs.includes(String(s.data?.userId))) {
            s.join(ch.id);
            s.emit('channel:new', full);
          }
        }
      } catch (err) { console.error('channel:create error', err); }
    });

    /* ── Join a channel room (needed for DMs created after connect) ── */
    socket.on('channel:join', async ({ channelId }) => {
      try {
        const { rows } = await db.query(
          `SELECT 1 FROM channel_members WHERE channel_id=$1 AND user_id=$2`,
          [channelId, userId]
        );
        if (rows.length) socket.join(channelId);
      } catch (err) { console.error(err); }
    });

    /* ── Add members to an existing channel ── */
    socket.on('channel:addMembers', async ({ channelId, memberIds }) => {
      if (!channelId || !Array.isArray(memberIds) || !memberIds.length) return;
      try {
        // only a current member can add others
        const isMember = await db.query(
          `SELECT 1 FROM channel_members WHERE channel_id=$1 AND user_id=$2`,
          [channelId, userId]
        );
        if (!isMember.rows.length) return;

        for (const uid of memberIds) {
          await db.query(
            `INSERT INTO channel_members(channel_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,
            [channelId, uid]
          );
        }
        // fetch full channel + members
        const chRes = await db.query(`SELECT id,name,type,topic FROM channels WHERE id=$1`,[channelId]);
        if (!chRes.rows.length) return;
        const memRes = await db.query(`SELECT user_id FROM channel_members WHERE channel_id=$1`,[channelId]);
        const full = { ...chRes.rows[0], members: memRes.rows.map(r=>r.user_id) };

        // notify + join the newly added sockets, and update existing members
        const sockets = await io.fetchSockets();
        const memberIdStrs = full.members.map(String);
        for (const s of sockets) {
          if (memberIdStrs.includes(String(s.data?.userId))) {
            s.join(channelId);
            s.emit('channel:new', full);
          }
        }
      } catch (err) { console.error('addMembers error', err); }
    });

    /* ── Leave a channel ── */
    socket.on('channel:leave', async ({ channelId }) => {
      if (!channelId) return;
      try {
        await db.query(`DELETE FROM channel_members WHERE channel_id=$1 AND user_id=$2`,[channelId,userId]);
        socket.leave(channelId);
        socket.emit('channel:left', { channelId });
      } catch (err) { console.error('leave error', err); }
    });

    /* ── Edit channel settings (name + topic) ── */
    socket.on('channel:update', async ({ channelId, name, topic }) => {
      if (!channelId) return;
      try {
        const isMember = await db.query(
          `SELECT 1 FROM channel_members WHERE channel_id=$1 AND user_id=$2`,
          [channelId, userId]
        );
        if (!isMember.rows.length) return;

        const sets=[], vals=[]; let i=1;
        if (name && name.trim()) {
          const clean = name.trim().toLowerCase().replace(/\s+/g,'-');
          // ensure no other channel already has this name
          const dup = await db.query(`SELECT 1 FROM channels WHERE name=$1 AND id<>$2`,[clean,channelId]);
          if (dup.rows.length) { socket.emit('channel:error',{error:'A channel with that name already exists'}); return; }
          sets.push(`name=$${i++}`); vals.push(clean);
        }
        if (topic !== undefined) { sets.push(`topic=$${i++}`); vals.push(topic||''); }
        if (!sets.length) return;
        vals.push(channelId);
        const { rows } = await db.query(
          `UPDATE channels SET ${sets.join(',')} WHERE id=$${i} RETURNING id,name,type,topic`,
          vals
        );
        const memRes = await db.query(`SELECT user_id FROM channel_members WHERE channel_id=$1`,[channelId]);
        const full = { ...rows[0], members: memRes.rows.map(r=>r.user_id) };
        io.to(channelId).emit('channel:updated', full);
      } catch (err) { console.error('channel:update error', err); }
    });

    /* ── Typing indicators ── */
    socket.on('typing:start', ({ channelId }) => {
      socket.to(channelId).emit('typing:start', { userId, channelId });
    });
    socket.on('typing:stop', ({ channelId }) => {
      socket.to(channelId).emit('typing:stop', { userId, channelId });
    });

    /* ── Presence change ── */
    /* ── Call start — relay to others in channel ── */
    socket.on('call:start', ({ channelId, kind, from }) => {
      if (!channelId) return;
      socket.to(channelId).emit('call:start', { channelId, kind, from });
    });

    socket.on('presence:set', async ({ presence }) => {
      const valid = ['online','away','dnd'];
      if (!valid.includes(presence)) return;
      try {
        await db.query(`UPDATE users SET presence=$1 WHERE id=$2`,[presence,userId]);
        io.emit('user:presence', { userId, presence });
      } catch (err) { console.error(err); }
    });

    /* ── Disconnect ── */
    socket.on('disconnect', async () => {
      console.log(`[socket] ${socket.user.name} disconnected`);
      try {
        await db.query(`UPDATE users SET presence='offline' WHERE id=$1`,[userId]);
        io.emit('user:presence', { userId, presence: 'offline' });
      } catch (err) { console.error(err); }
    });
  });
}

module.exports = { setupSocket };
