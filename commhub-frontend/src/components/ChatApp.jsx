import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Hash, Lock, Search, Send, Smile, Paperclip, Plus, Phone, Video,
         MoreHorizontal, X, ChevronDown, Reply, AtSign, Bold, Italic, Code,
         CornerDownLeft, LogOut, Loader2, Info, Star, Copy, EyeOff,
         ExternalLink, Columns2, Bell, UserCircle, FileText, Pencil,
         Trash2, Forward, Bookmark, Download, Check } from 'lucide-react';
import api from '../lib/api';
import { getSocket } from '../lib/socket';

/* ─────────── constants ─────────── */
const PRESENCE = {
  online:  { color: 'bg-emerald-400', label: 'Active' },
  away:    { color: 'bg-amber-400',   label: 'Away'   },
  dnd:     { color: 'bg-rose-500',    label: 'Do not disturb' },
  offline: { color: 'bg-slate-400',   label: 'Offline' },
};
const EMOJIS = ['👍','🎉','❤️','😂','🔥','👀','✅','🙏','💯','👋','🚀','☕️'];

/* ─────────── helpers ─────────── */
const parseT  = t => parseFloat(t) || 0;
const fmtTime = t => { const n=parseT(t); return n?new Date(n).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'' };
const fmtDay  = t => {
  const n=parseT(t); if(!n) return '';
  const d=new Date(n),today=new Date();
  if(d.toDateString()===today.toDateString()) return 'Today';
  const y=new Date(today); y.setDate(today.getDate()-1);
  if(d.toDateString()===y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([],{weekday:'long',month:'long',day:'numeric'});
};
const fmtSize = b => b>1048576?`${(b/1048576).toFixed(1)} MB`:`${(b/1024).toFixed(0)} KB`;

/* parse [FILE:id:name:size] markers + **bold** *italic* `code` */
function renderText(text, apiBase) {
  if (!text) return null;
  const parts = [];
  const fileRe = /\[FILE:([^:]+):([^:]+):(\d+)\]/g;
  const fmtRe  = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0, m, key = 0;

  // first pass: file tokens
  const segments = [];
  let lf = 0;
  while ((m = fileRe.exec(text)) !== null) {
    if (m.index > lf) segments.push({ type: 'text', val: text.slice(lf, m.index) });
    segments.push({ type: 'file', fileId: m[1], name: m[2], size: parseInt(m[3]) });
    lf = fileRe.lastIndex;
  }
  if (lf < text.length) segments.push({ type: 'text', val: text.slice(lf) });

  segments.forEach(seg => {
    if (seg.type === 'file') {
      parts.push(
        <a key={key++} href={`${apiBase}/api/files/${seg.fileId}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-sm text-teal-700 hover:bg-teal-50 hover:border-teal-200 transition"
          download={seg.name}>
          <Paperclip size={13}/> <span className="font-medium">{seg.name}</span>
          <span className="text-slate-400">·</span>
          <span className="text-xs text-slate-500">{fmtSize(seg.size)}</span>
          <Download size={12} className="ml-1 text-teal-400"/>
        </a>
      );
    } else {
      // second pass: formatting in text segment
      const txt = seg.val;
      let ll = 0;
      let fm;
      fmtRe.lastIndex = 0;
      while ((fm = fmtRe.exec(txt)) !== null) {
        if (fm.index > ll) parts.push(txt.slice(ll, fm.index));
        const tok = fm[0];
        if (tok.startsWith('**')) parts.push(<strong key={key++}>{tok.slice(2,-2)}</strong>);
        else if (tok.startsWith('`')) parts.push(<code key={key++} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[13px] text-rose-600">{tok.slice(1,-1)}</code>);
        else parts.push(<em key={key++}>{tok.slice(1,-1)}</em>);
        ll = fmtRe.lastIndex;
      }
      if (ll < txt.length) parts.push(txt.slice(ll));
    }
  });
  return parts;
}

/* ─────────── Avatar ─────────── */
function Avatar({ user, size='h-9 w-9', showPresence=true }) {
  if (!user) return null;
  return (
    <div className="relative shrink-0">
      <div className={`${size} ${user.color||'bg-slate-500'} grid place-items-center rounded-md text-xs font-semibold text-white select-none`}>{user.initials||'?'}</div>
      {showPresence && <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-white ${PRESENCE[user.presence]?.color||'bg-slate-400'}`}/>}
    </div>
  );
}

/* ─────────── Context Menu (⋮ header button) ─────────── */
function ContextMenu({ onClose, isDM, targetName }) {
  const items = [
    { icon: <Info size={15}/>,         label: 'Conversation details', sub: true },
    { icon: <UserCircle size={15}/>,   label: isDM?'View full profile':'View members' },
    { icon: <Copy size={15}/>,         label: 'Copy link' },
    { icon: <Star size={15}/>,         label: 'Star conversation' },
    { icon: <Bell size={15}/>,         label: 'Mute notifications' },
    null,
    { icon: <FileText size={15}/>,     label: 'Summarize conversation', sub: true },
    null,
    { icon: <Columns2 size={15}/>,     label: 'Open in split view' },
    { icon: <ExternalLink size={15}/>, label: 'Open in new window' },
    null,
    { icon: <EyeOff size={15}/>,       label: 'Hide conversation', danger: true },
  ];
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose}/>
      <div className="absolute right-0 top-12 z-50 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Options</p>
          <p className="mt-0.5 truncate text-sm font-bold text-slate-800">{targetName}</p>
        </div>
        <div className="py-1.5">
          {items.map((item,i) => item===null
            ? <div key={i} className="my-1 h-px bg-slate-100"/>
            : <button key={i} onClick={onClose}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-sm transition hover:bg-slate-50 ${item.danger?'text-rose-500':'text-slate-700'}`}>
                <span className={item.danger?'text-rose-400':'text-slate-400'}>{item.icon}</span>
                <span className="flex-1 text-left">{item.label}</span>
                {item.sub && <ChevronDown size={13} className="-rotate-90 text-slate-300"/>}
              </button>
          )}
        </div>
      </div>
    </>
  );
}

/* ─────────── Forward Modal ─────────── */
function ForwardModal({ channels, accounts, me, onForward, onClose }) {
  const [q, setQ] = useState('');
  const dms = Object.values(accounts).filter(u => u.id !== me.id);
  const filtered = [
    ...channels.filter(c=>c.type!=='dm'&&c.name.includes(q.toLowerCase())),
    ...dms.filter(u=>u.name.toLowerCase().includes(q.toLowerCase()))
  ];
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm" onClick={onClose}/>
      <div className="fixed left-1/2 top-1/2 z-50 w-80 -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 className="font-bold text-slate-900">Forward message</h3>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100"><X size={16}/></button>
        </div>
        <div className="px-4 py-3">
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search channels or people…"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100" autoFocus/>
        </div>
        <div className="max-h-56 overflow-y-auto px-2 pb-3">
          {filtered.map(item => {
            const isDMItem = !!item.presence;
            return (
              <button key={item.id} onClick={()=>onForward(item.id)}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm hover:bg-slate-50">
                {isDMItem
                  ? <Avatar user={item} size="h-7 w-7" showPresence={false}/>
                  : <span className="grid h-7 w-7 place-items-center rounded-md bg-slate-100 text-slate-500"><Hash size={14}/></span>
                }
                <span className="font-medium text-slate-800">{isDMItem ? item.name : item.name}</span>
              </button>
            );
          })}
          {filtered.length===0 && <p className="px-3 py-4 text-center text-sm text-slate-400">No results</p>}
        </div>
      </div>
    </>
  );
}

/* ─────────── Main ChatApp ─────────── */
const API_BASE = import.meta.env.VITE_API_URL || '';

export default function ChatApp({ me, onLogout }) {
  const socket = getSocket();
  const [accounts, setAccounts]           = useState({});
  const [channels, setChannels]           = useState([]);
  const [messages, setMessages]           = useState([]);
  const [activeId, setActiveId]           = useState(null);
  const [threadOpen, setThreadOpen]       = useState(null);
  const [draft, setDraft]                 = useState('');
  const [search, setSearch]               = useState('');
  const [showEmoji, setShowEmoji]         = useState(false);
  const [typing, setTyping]               = useState({});
  const [callBanner, setCallBanner]       = useState(null);
  const [loading, setLoading]             = useState(true);
  const [showMenu, setShowMenu]           = useState(false);
  const [unread, setUnread]               = useState({});
  const [activeDMUserId, setActiveDMUserId] = useState(null);
  const [attachments, setAttachments]     = useState([]);   // [{name,size,type,fileId?,uploading?}]
  const [forwardMsg, setForwardMsg]       = useState(null); // message to forward
  const scrollRef = useRef(null);
  const inputRef  = useRef(null);
  const fileRef   = useRef(null);

  /* ── Notification permission ── */
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  }, []);

  /* ── Bootstrap ── */
  useEffect(() => {
    (async () => {
      const [usersRes, chansRes] = await Promise.all([api.get('/api/users'), api.get('/api/channels')]);
      setAccounts(usersRes.data);
      const chs = chansRes.data;
      setChannels(chs);
      const first = chs.find(c=>c.name==='general') || chs[0];
      if (first) { setActiveId(first.id); await loadMessages(first.id); }
      setLoading(false);
    })();
  }, []);

  const loadMessages = async chId => {
    const { data } = await api.get(`/api/messages/${chId}`);
    setMessages(data.messages || []);
  };
  useEffect(() => { if (activeId) loadMessages(activeId); }, [activeId]);
  useEffect(() => { if (activeId) setUnread(p=>{ const n={...p}; delete n[activeId]; return n; }); }, [activeId]);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages.length, activeId]);

  /* ── Socket events ── */
  useEffect(() => {
    if (!socket) return;
    const onMsgNew = msg => {
      if (msg.channelId === activeId) setMessages(p=>[...p,msg]);
      else {
        setUnread(p=>({...p,[msg.channelId]:(p[msg.channelId]||0)+1}));
        if ('Notification' in window && Notification.permission==='granted' && document.hidden) {
          const sender = Object.values(accounts).find(u=>u.id===msg.senderId);
          const n = new Notification(sender?.name||'New message',{ body: msg.text?.slice(0,80), icon:'/favicon.ico' });
          n.onclick = ()=>{ window.focus(); setActiveId(msg.channelId); n.close(); };
        }
      }
    };
    const onMsgEdited  = ({ id, text, editedAt }) => setMessages(p=>p.map(m=>m.id===id?{...m,text,editedAt}:m));
    const onMsgDeleted = ({ id }) => setMessages(p=>p.map(m=>m.id===id?{...m,text:'[message deleted]',deleted:true}:m));
    const onThreadNew  = ({parentId,msg,threadCount}) => setMessages(p=>p.map(m=>m.id===parentId?{...m,threadCount,thread:[...(m.thread||[]),msg]}:m));
    const onReactUpdate = ({messageId,reactions}) => setMessages(p=>p.map(m=>m.id===messageId?{...m,reactions}:m));
    const onChanNew    = ch => setChannels(p=>[...p,ch]);
    const onPresence   = ({userId,presence}) => setAccounts(p=>({...p,[userId]:p[userId]?{...p[userId],presence}:p[userId]}));
    const onTypingStart = ({userId,channelId}) => { if(channelId===activeId) setTyping(p=>({...p,[channelId]:new Set([...(p[channelId]||[]),userId])})); };
    const onTypingStop  = ({userId,channelId}) => { if(channelId===activeId) setTyping(p=>{const s=new Set(p[channelId]||[]);s.delete(userId);return{...p,[channelId]:s};}); };

    socket.on('message:new',     onMsgNew);
    socket.on('message:edited',  onMsgEdited);
    socket.on('message:deleted', onMsgDeleted);
    socket.on('thread:new',      onThreadNew);
    socket.on('reaction:update', onReactUpdate);
    socket.on('channel:new',     onChanNew);
    socket.on('user:presence',   onPresence);
    socket.on('typing:start',    onTypingStart);
    socket.on('typing:stop',     onTypingStop);
    return () => {
      socket.off('message:new',     onMsgNew);
      socket.off('message:edited',  onMsgEdited);
      socket.off('message:deleted', onMsgDeleted);
      socket.off('thread:new',      onThreadNew);
      socket.off('reaction:update', onReactUpdate);
      socket.off('channel:new',     onChanNew);
      socket.off('user:presence',   onPresence);
      socket.off('typing:start',    onTypingStart);
      socket.off('typing:stop',     onTypingStop);
    };
  }, [socket, activeId, accounts]);

  const sorted = useMemo(()=>[...messages].sort((a,b)=>parseT(a.t)-parseT(b.t)),[messages]);

  const activeChannel = channels.find(c=>c.id===activeId);
  const isDM          = activeChannel?.type === 'dm';
  const dmUserId      = isDM ? activeChannel?.members?.find(id=>id!==me.id) : null;
  const dmUser        = dmUserId ? accounts[dmUserId] : null;
  const headerName    = isDM ? (dmUser?.name||'Direct message') : activeChannel?.name;

  const sendMsg = useCallback((text, parentId=null) => {
    let clean = text.trim();
    if (attachments.length && !parentId) {
      const tags = attachments
        .filter(a=>a.fileId)
        .map(a=>`[FILE:${a.fileId}:${a.name}:${a.size}]`)
        .join('\n');
      clean = [clean, tags].filter(Boolean).join('\n');
    }
    if (!clean || !activeId) return;
    socket?.emit('message:send', { channelId: activeId, text: clean, parentId });
    socket?.emit('typing:stop',  { channelId: activeId });
    setAttachments([]);
  }, [activeId, attachments, socket]);

  const handleTyping = val => {
    setDraft(val);
    if (val) socket?.emit('typing:start',{channelId:activeId});
    else     socket?.emit('typing:stop', {channelId:activeId});
  };

  const toggleReact = (msgId, emoji, parentId=null) => {
    socket?.emit('reaction:toggle',{ messageId:msgId, channelId:activeId, emoji });
    setMessages(p=>p.map(m=>{
      const apply=msg=>{
        const ex=msg.reactions.find(r=>r.emoji===emoji);
        let reactions;
        if(ex){const has=ex.users.includes(me.id);const users=has?ex.users.filter(u=>u!==me.id):[...ex.users,me.id];reactions=users.length?msg.reactions.map(r=>r.emoji===emoji?{...r,users}:r):msg.reactions.filter(r=>r.emoji!==emoji);}
        else reactions=[...msg.reactions,{emoji,users:[me.id]}];
        return{...msg,reactions};
      };
      if(parentId&&m.id===parentId) return{...m,thread:m.thread.map(tm=>tm.id===msgId?apply(tm):tm)};
      if(!parentId&&m.id===msgId) return apply(m);
      return m;
    }));
  };

  const editMsg = (id, text) => socket?.emit('message:edit',{ id, channelId:activeId, text });
  const deleteMsg = id => socket?.emit('message:delete',{ id, channelId:activeId });
  const forwardTo = toChannelId => {
    if (!forwardMsg) return;
    socket?.emit('message:forward',{ text: forwardMsg.text, toChannelId });
    setForwardMsg(null);
  };

  const createChannel = () => {
    const name=window.prompt('New channel name:'); if(!name) return;
    socket?.emit('channel:create',{name,type:'public',topic:''});
  };

  const openDM = async userId => {
    const { data } = await api.get(`/api/channels/dm/${userId}`);
    if (!channels.find(c=>c.id===data.id)) setChannels(p=>[...p,data]);
    socket?.emit('channel:join',{channelId:data.id});
    setActiveDMUserId(userId);
    setActiveId(data.id);
  };

  /* file attach — reads as base64, uploads, then stores fileId */
  const onFileChange = async e => {
    const files = Array.from(e.target.files||[]);
    if (!files.length) return;
    e.target.value = '';
    for (const f of files) {
      const placeholder = { name:f.name, size:f.size, type:f.type, uploading:true };
      setAttachments(p=>[...p,placeholder]);
      try {
        const b64 = await new Promise((res,rej)=>{
          const r=new FileReader();
          r.onload=()=>res(r.result.split(',')[1]);
          r.onerror=rej;
          r.readAsDataURL(f);
        });
        const { data } = await api.post('/api/files',{
          name: f.name, mimeType: f.type, sizeBytes: f.size, data: b64
        });
        setAttachments(p=>p.map(a=>a.name===f.name&&a.uploading?{...a,fileId:data.fileId,uploading:false}:a));
      } catch {
        setAttachments(p=>p.filter(a=>!(a.name===f.name&&a.uploading)));
      }
    }
  };

  if (loading) return <div className="grid h-screen w-full place-items-center bg-white"><Loader2 className="animate-spin text-slate-400" size={24}/></div>;

  const myId        = me.id;
  const teammates   = Object.values(accounts).filter(u=>u.id!==myId);
  const typingUsers = [...(typing[activeId]||[])].filter(id=>id!==myId).map(id=>accounts[id]?.name).filter(Boolean);
  const threadParent = threadOpen ? messages.find(m=>m.id===threadOpen) : null;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-white text-slate-800 antialiased"
      style={{fontFamily:"ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif"}}>

      {/* Workspace rail */}
      <nav className="flex w-16 shrink-0 flex-col items-center gap-3 bg-slate-900 py-4">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-teal-400 to-teal-600 font-bold text-white shadow-lg shadow-teal-900/40">CH</div>
        <div className="h-px w-8 bg-slate-700"/>
        <button className="grid h-10 w-10 place-items-center rounded-xl bg-slate-700 text-sm font-semibold text-white ring-2 ring-teal-400">WL</button>
        <button className="grid h-10 w-10 place-items-center rounded-xl bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white"><Plus size={18}/></button>
        <div className="mt-auto flex flex-col items-center gap-2">
          <button onClick={onLogout} title="Log out" className="grid h-9 w-9 place-items-center rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white"><LogOut size={16}/></button>
          <Avatar user={me} size="h-9 w-9"/>
        </div>
      </nav>

      {/* Sidebar */}
      <aside className="flex w-64 shrink-0 flex-col bg-slate-800 text-slate-300">
        <div className="flex items-center justify-between border-b border-slate-700/60 px-4 py-3.5">
          <div className="min-w-0">
            <div className="flex items-center gap-1 font-bold text-white">My Workspace <ChevronDown size={15}/></div>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400"><span className="h-2 w-2 rounded-full bg-emerald-400"/> <span className="truncate">{me.name}</span></div>
          </div>
          <button onClick={createChannel} className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-slate-700 text-white hover:bg-slate-600"><Plus size={16}/></button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-3">
          <p className="px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Channels</p>
          {channels.filter(c=>c.type!=='dm').map(c=>{
            const cnt=unread[c.id]||0;
            return (
              <button key={c.id} onClick={()=>{setActiveDMUserId(null);setActiveId(c.id);}}
                className={`group flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition ${activeId===c.id?'bg-teal-500/15 text-white':cnt?'font-semibold text-white hover:bg-slate-700/60':'text-slate-300 hover:bg-slate-700/60'}`}>
                <span className="grid h-[18px] w-[18px] place-items-center text-slate-400">{c.type==='private'?<Lock size={15}/>:<Hash size={15}/>}</span>
                <span className="flex-1 truncate text-left">{c.name}</span>
                {cnt>0&&<span className="grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white">{cnt}</span>}
              </button>
            );
          })}
          <button onClick={createChannel} className="mt-1 flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-slate-400 hover:bg-slate-700/60 hover:text-white">
            <span className="grid h-[18px] w-[18px] place-items-center"><Plus size={14}/></span> Add channel
          </button>
          <p className="mt-4 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Direct messages</p>
          {teammates.map(u=>{
            const dmChanId=channels.find(c=>c.type==='dm'&&c.members?.includes(u.id)&&c.members?.includes(myId))?.id;
            const cnt=dmChanId?(unread[dmChanId]||0):0;
            const active=activeDMUserId===u.id||(isDM&&dmUserId===u.id);
            return (
              <button key={u.id} onClick={()=>openDM(u.id)}
                className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition ${active?'bg-teal-500/15 text-white':cnt?'font-semibold text-white hover:bg-slate-700/60':'text-slate-300 hover:bg-slate-700/60'}`}>
                <span className={`block h-2.5 w-2.5 shrink-0 rounded-full ${PRESENCE[u.presence]?.color||'bg-slate-400'}`}/>
                <span className="flex-1 truncate text-left">{u.name}</span>
                {cnt>0&&<span className="grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white">{cnt}</span>}
              </button>
            );
          })}
          {teammates.length===0&&<p className="px-2.5 py-2 text-xs text-slate-500">Teammates appear here when they sign up.</p>}
        </div>
      </aside>

      {/* Main */}
      <main className="flex min-w-0 flex-1 flex-col bg-white">
        <header className="relative flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {isDM?<Avatar user={dmUser} size="h-7 w-7"/>:<span className="grid h-7 w-7 place-items-center rounded-md bg-slate-100 text-slate-600">{activeChannel?.type==='private'?<Lock size={15}/>:<Hash size={15}/>}</span>}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate font-bold text-slate-900">{headerName}</h1>
                {isDM&&dmUser&&<span className={`h-2 w-2 rounded-full ${PRESENCE[dmUser.presence]?.color||'bg-slate-400'}`}/>}
                {isDM&&dmUser&&<span className="text-xs text-slate-400">{PRESENCE[dmUser.presence]?.label}</span>}
              </div>
              <p className="truncate text-xs text-slate-400">{isDM?dmUser?.title||'Direct message':activeChannel?.topic||'No topic set'}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={()=>setCallBanner({kind:'voice'})} className="grid h-9 w-9 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-teal-600" title="Voice call"><Phone size={17}/></button>
            <button onClick={()=>setCallBanner({kind:'video'})} className="grid h-9 w-9 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-teal-600" title="Video call"><Video size={17}/></button>
            <div className="relative ml-1">
              <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"/>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search"
                className="w-36 rounded-md border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-sm outline-none transition focus:w-48 focus:border-teal-400 focus:bg-white focus:ring-2 focus:ring-teal-100"/>
            </div>
            <button onClick={()=>setShowMenu(s=>!s)} className={`grid h-9 w-9 place-items-center rounded-md transition ${showMenu?'bg-slate-100 text-slate-800':'text-slate-500 hover:bg-slate-100'}`}><MoreHorizontal size={17}/></button>
            {showMenu&&<ContextMenu onClose={()=>setShowMenu(false)} isDM={isDM} targetName={headerName||''}/>}
          </div>
        </header>

        {callBanner&&(
          <div className="flex items-center justify-between border-b border-teal-100 bg-teal-50 px-5 py-2.5 text-sm">
            <span className="flex items-center gap-2 font-medium text-teal-800">{callBanner.kind==='video'?<Video size={16}/>:<Phone size={16}/>}{callBanner.kind==='video'?'Video':'Voice'} call started · connecting…</span>
            <button onClick={()=>setCallBanner(null)} className="rounded-md bg-rose-500 px-3 py-1 text-xs font-semibold text-white hover:bg-rose-600">Leave</button>
          </div>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 py-4">
          <div className="mb-4 px-3">
            <div className={`grid h-12 w-12 place-items-center rounded-xl ${isDM&&dmUser?dmUser.color:'bg-slate-100 text-slate-500'} text-white`}>{isDM&&dmUser?dmUser.initials:<Hash size={22}/>}</div>
            <h2 className="mt-3 text-lg font-bold text-slate-900">{isDM?headerName:`Welcome to #${activeChannel?.name}`}</h2>
            <p className="text-sm text-slate-500">{isDM?`This is the start of your conversation with ${headerName}.`:`This is the very beginning of #${activeChannel?.name}.`}</p>
          </div>

          {sorted.filter(m=>!search||m.text?.toLowerCase().includes(search.toLowerCase())).map((m,i,arr)=>{
            const prev=arr[i-1];
            const grouped=prev&&prev.senderId===m.senderId&&parseT(m.t)-parseT(prev.t)<5*60000;
            const showDay=!prev||fmtDay(prev.t)!==fmtDay(m.t);
            return (
              <React.Fragment key={m.id}>
                {showDay&&fmtDay(m.t)&&<div className="my-3 flex items-center gap-3 px-3"><div className="h-px flex-1 bg-slate-100"/><span className="rounded-full border border-slate-200 px-3 py-0.5 text-xs font-semibold text-slate-500">{fmtDay(m.t)}</span><div className="h-px flex-1 bg-slate-100"/></div>}
                <MsgRow apiBase={API_BASE} accounts={accounts} myId={myId} msg={m} grouped={grouped}
                  onReact={e=>toggleReact(m.id,e)} onThread={()=>!isDM&&setThreadOpen(m.id)} canThread={!isDM}
                  onEdit={editMsg} onDelete={deleteMsg} onForward={()=>setForwardMsg(m)}/>
              </React.Fragment>
            );
          })}

          {typingUsers.length>0&&(
            <div className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400">
              <span className="flex gap-1">{[0,120,240].map(d=><span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{animationDelay:`${d}ms`}}/>)}</span>
              {typingUsers.slice(0,2).join(', ')}{typingUsers.length>2?` +${typingUsers.length-2} more`:''} {typingUsers.length===1?'is':'are'} typing…
            </div>
          )}
        </div>

        <Composer value={draft} setValue={handleTyping}
          onSend={t=>{sendMsg(t);setDraft('');setShowEmoji(false);}}
          placeholder={isDM?`Message ${headerName}`:`Message #${activeChannel?.name}`}
          showEmoji={showEmoji} setShowEmoji={setShowEmoji} onEmoji={e=>setDraft(d=>d+e)}
          inputRef={inputRef} fileRef={fileRef} onFileChange={onFileChange}
          attachments={attachments} onRemoveAttachment={i=>setAttachments(p=>p.filter((_,j)=>j!==i))}/>
      </main>

      {threadParent&&(
        <ThreadPanel apiBase={API_BASE} accounts={accounts} myId={myId} parent={threadParent}
          channelName={activeChannel?.name} onClose={()=>setThreadOpen(null)}
          onSend={t=>sendMsg(t,threadParent.id)} onReact={(mid,e)=>toggleReact(mid,e,threadParent.id)}
          onEdit={editMsg} onDelete={deleteMsg} onForward={m=>setForwardMsg(m)}/>
      )}

      {forwardMsg&&(
        <ForwardModal channels={channels} accounts={accounts} me={me}
          onForward={forwardTo} onClose={()=>setForwardMsg(null)}/>
      )}
    </div>
  );
}

/* ─────────── Message Row ─────────── */
function MsgRow({apiBase,accounts,myId,msg,grouped,onReact,onThread,canThread,inThread,onEdit,onDelete,onForward}) {
  const u=accounts[msg.senderId]||{initials:'?',color:'bg-slate-400',name:'Unknown',presence:'offline'};
  const [hover,setHover]=useState(false);
  const [picker,setPicker]=useState(false);
  const [editing,setEditing]=useState(false);
  const [editVal,setEditVal]=useState(msg.text);
  const [showMore,setShowMore]=useState(false);
  const isDeleted = msg.deleted || msg.text==='[message deleted]';
  const isOwn = msg.senderId === myId;

  const submitEdit = () => {
    if (editVal.trim() && editVal !== msg.text) onEdit(msg.id, editVal);
    setEditing(false);
  };

  return (
    <div onMouseEnter={()=>setHover(true)} onMouseLeave={()=>{setHover(false);setPicker(false);setShowMore(false);}}
      className={`group relative flex gap-3 px-3 ${grouped?'py-0.5':'mt-1 py-1.5'} hover:bg-slate-50`}>
      <div className="w-9 shrink-0">
        {!grouped?<Avatar user={u} showPresence={false}/>:<span className="block pt-1 text-center text-[10px] leading-4 text-transparent group-hover:text-slate-400">{fmtTime(msg.t)}</span>}
      </div>
      <div className="min-w-0 flex-1">
        {!grouped&&(
          <div className="flex items-baseline gap-2">
            <span className="font-semibold text-slate-900">{u.name}</span>
            <span className="text-xs text-slate-400">{fmtTime(msg.t)}</span>
            {msg.editedAt&&<span className="text-[11px] text-slate-400">(edited)</span>}
          </div>
        )}

        {/* Message content or edit textarea */}
        {editing?(
          <div className="mt-1">
            <textarea value={editVal} onChange={e=>setEditVal(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();submitEdit();}if(e.key==='Escape')setEditing(false);}}
              className="w-full rounded-lg border border-teal-400 bg-white px-3 py-2 text-[15px] outline-none ring-2 ring-teal-100"
              rows={2} autoFocus/>
            <div className="mt-1.5 flex gap-2 text-xs">
              <button onClick={submitEdit} className="flex items-center gap-1 rounded-md bg-teal-600 px-2.5 py-1 font-semibold text-white hover:bg-teal-700"><Check size={12}/> Save</button>
              <button onClick={()=>setEditing(false)} className="rounded-md border border-slate-200 px-2.5 py-1 text-slate-600 hover:bg-slate-50">Cancel</button>
            </div>
          </div>
        ):(
          <div className={`text-[15px] leading-relaxed whitespace-pre-wrap ${isDeleted?'italic text-slate-400':'text-slate-700'}`}>
            {renderText(msg.text, apiBase)}
          </div>
        )}

        {/* Reactions */}
        {!isDeleted&&msg.reactions?.length>0&&(
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {msg.reactions.map(r=>{const mine=r.users?.includes(myId);return(
              <button key={r.emoji} onClick={()=>onReact(r.emoji)}
                className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition ${mine?'border-teal-300 bg-teal-50 text-teal-700':'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                <span className="text-sm leading-none">{r.emoji}</span><span className="font-medium">{r.users?.length}</span>
              </button>);})}
          </div>
        )}

        {/* Thread indicator */}
        {!inThread&&msg.threadCount>0&&(
          <button onClick={onThread} className="mt-1.5 flex items-center gap-2 rounded-md px-1.5 py-1 text-xs font-medium text-teal-600 hover:bg-white">
            <span className="flex -space-x-1">{[...new Set(msg.thread?.map(t=>t.senderId)||[])].slice(0,3).map(id=>{const tu=accounts[id]||{color:'bg-slate-400',initials:'?'};return<span key={id} className={`${tu.color} grid h-4 w-4 place-items-center rounded text-[8px] font-bold text-white ring-1 ring-white`}>{tu.initials}</span>;})}</span>
            {msg.threadCount} repl{msg.threadCount===1?'y':'ies'}<span className="text-slate-400">· last {fmtTime(msg.thread?.[msg.thread.length-1]?.t||msg.t)}</span>
          </button>
        )}
      </div>

      {/* Hover toolbar — matches screenshot: emoji · reply-thread · forward · bookmark · ⋮ */}
      {hover&&!editing&&!isDeleted&&(
        <div className="absolute -top-4 right-3 flex items-center gap-0.5 rounded-xl border border-slate-200 bg-white p-1 shadow-md">
          <ToolBtn icon={<Smile size={16}/>}     title="Add reaction"     onClick={()=>setPicker(p=>!p)}/>
          {canThread&&!inThread&&<ToolBtn icon={<Reply size={16}/>} title="Reply in thread" onClick={onThread}/>}
          <ToolBtn icon={<Forward size={16}/>}   title="Forward message"  onClick={onForward}/>
          <ToolBtn icon={<Bookmark size={16}/>}  title="Save for later"   onClick={()=>{}}/>
          <div className="relative">
            <ToolBtn icon={<MoreHorizontal size={16}/>} title="More actions" onClick={()=>setShowMore(p=>!p)}/>
            {showMore&&(
              <>
                <div className="fixed inset-0 z-30" onClick={()=>setShowMore(false)}/>
                <div className="absolute right-0 top-9 z-40 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                  {isOwn&&<button onClick={()=>{setEditing(true);setEditVal(msg.text);setShowMore(false);}} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50"><Pencil size={14} className="text-slate-400"/> Edit message</button>}
                  <button onClick={()=>{if(window.confirm('Delete this message?'))onDelete(msg.id);setShowMore(false);}} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-rose-600 hover:bg-rose-50"><Trash2 size={14} className="text-rose-400"/> Delete message</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {picker&&!isDeleted&&(
        <div className="absolute right-3 top-8 z-10 grid grid-cols-6 gap-0.5 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
          {EMOJIS.map(e=><button key={e} onClick={()=>{onReact(e);setPicker(false);}} className="grid h-8 w-8 place-items-center rounded-md text-lg hover:bg-slate-100">{e}</button>)}
        </div>
      )}
    </div>
  );
}
function ToolBtn({icon,onClick,title}){
  return <button onMouseDown={e=>{e.preventDefault();onClick();}} title={title} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition">{icon}</button>;
}

/* ─────────── Composer ─────────── */
function Composer({value,setValue,onSend,placeholder,showEmoji,setShowEmoji,onEmoji,inputRef,fileRef,onFileChange,attachments,onRemoveAttachment}) {
  const onKey=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();onSend(value);}};
  // FmtBtn uses onMouseDown+preventDefault to keep textarea focus & preserve selection
  const wrap=(a,b=a)=>{
    const ta=inputRef.current; if(!ta) return;
    const s=ta.selectionStart, en=ta.selectionEnd;
    const sel=value.slice(s,en)||'text';
    const next=value.slice(0,s)+a+sel+b+value.slice(en);
    setValue(next);
    // restore cursor after state update
    requestAnimationFrame(()=>{ ta.focus(); ta.setSelectionRange(s+a.length, s+a.length+sel.length); });
  };
  const canSend = value.trim() || attachments.filter(a=>a.fileId).length>0;
  const uploading = attachments.some(a=>a.uploading);
  return (
    <div className="px-3 pb-3 pt-1">
      <div className="rounded-xl border border-slate-200 transition focus-within:border-teal-400 focus-within:ring-2 focus-within:ring-teal-100">
        <div className="flex items-center gap-0.5 border-b border-slate-100 px-2 py-1">
          <FmtBtn icon={<Bold size={14}/>}   onClick={()=>wrap('**')}   title="Bold (**text**)"/>
          <FmtBtn icon={<Italic size={14}/>} onClick={()=>wrap('*')}    title="Italic (*text*)"/>
          <FmtBtn icon={<Code size={14}/>}   onClick={()=>wrap('`')}    title="Code (`text`)"/>
        </div>

        {attachments.length>0&&(
          <div className="flex flex-wrap gap-1.5 border-b border-slate-100 px-3 py-2">
            {attachments.map((f,i)=>(
              <div key={i} className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs ${f.uploading?'border-amber-200 bg-amber-50 text-amber-700':'border-slate-200 bg-slate-50 text-slate-700'}`}>
                {f.uploading?<Loader2 size={11} className="animate-spin"/>:<Paperclip size={11} className="text-slate-400"/>}
                <span className="max-w-[120px] truncate font-medium">{f.name}</span>
                <span className="text-slate-400">{fmtSize(f.size)}</span>
                {!f.uploading&&<button onMouseDown={e=>{e.preventDefault();onRemoveAttachment(i);}} className="ml-1 text-slate-400 hover:text-rose-500"><X size={11}/></button>}
              </div>
            ))}
          </div>
        )}

        <textarea ref={inputRef} rows={1} value={value} onChange={e=>setValue(e.target.value)} onKeyDown={onKey}
          placeholder={placeholder}
          className="block max-h-32 w-full resize-none bg-transparent px-3 py-2.5 text-[15px] outline-none placeholder:text-slate-400"/>

        <div className="relative flex items-center justify-between px-2 py-1.5">
          <div className="flex items-center gap-0.5">
            <FmtBtn icon={<Plus size={17}/>}/>
            <input ref={fileRef} type="file" multiple className="hidden" onChange={onFileChange}/>
            <FmtBtn icon={<Paperclip size={16}/>} onClick={()=>fileRef.current?.click()} title="Attach file"/>
            <FmtBtn icon={<Smile size={16}/>} onClick={()=>setShowEmoji(s=>!s)}/>
            <FmtBtn icon={<AtSign size={16}/>} onClick={()=>setValue(value+'@')}/>
          </div>
          <button onClick={()=>onSend(value)} disabled={!canSend||uploading}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${canSend&&!uploading?'bg-teal-600 text-white hover:bg-teal-700':'bg-slate-100 text-slate-400'}`}>
            {uploading?<Loader2 size={14} className="animate-spin"/>:<Send size={14}/>}
            {uploading?'Uploading…':'Send'}
          </button>
          {showEmoji&&<div className="absolute bottom-11 right-2 z-10 grid grid-cols-6 gap-0.5 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">{EMOJIS.map(e=><button key={e} onClick={()=>onEmoji(e)} className="grid h-8 w-8 place-items-center rounded-md text-lg hover:bg-slate-100">{e}</button>)}</div>}
        </div>
      </div>
      <p className="mt-1 flex items-center gap-1 px-1 text-[11px] text-slate-400"><CornerDownLeft size={11}/> Enter to send · Shift+Enter new line · **bold** *italic* `code`</p>
    </div>
  );
}
function FmtBtn({icon,onClick,title}){
  return <button onMouseDown={e=>{e.preventDefault();onClick?.();}} title={title} className="grid h-7 w-7 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700">{icon}</button>;
}

/* ─────────── Thread Panel ─────────── */
function ThreadPanel({apiBase,accounts,myId,parent,channelName,onClose,onSend,onReact,onEdit,onDelete,onForward}) {
  const [draft,setDraft]=useState('');
  const ref=useRef(null);
  useEffect(()=>{if(ref.current)ref.current.scrollTop=ref.current.scrollHeight;},[parent.thread?.length]);
  return (
    <section className="flex w-96 shrink-0 flex-col border-l border-slate-200 bg-white">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div><h3 className="font-bold text-slate-900">Thread</h3><p className="text-xs text-slate-400">#{channelName}</p></div>
        <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100"><X size={18}/></button>
      </header>
      <div ref={ref} className="flex-1 overflow-y-auto py-2">
        <MsgRow apiBase={apiBase} accounts={accounts} myId={myId} msg={parent} grouped={false}
          onReact={e=>onReact(parent.id,e)} canThread={false} inThread
          onEdit={onEdit} onDelete={onDelete} onForward={()=>onForward(parent)}/>
        <div className="my-2 flex items-center gap-3 px-4"><div className="h-px flex-1 bg-slate-100"/><span className="text-xs font-medium text-slate-400">{parent.thread?.length||0} repl{(parent.thread?.length||0)===1?'y':'ies'}</span><div className="h-px flex-1 bg-slate-100"/></div>
        {(parent.thread||[]).map((tm,i)=>{
          const prev=(parent.thread||[])[i-1];
          const grouped=prev&&prev.senderId===tm.senderId&&parseT(tm.t)-parseT(prev.t)<5*60000;
          return <MsgRow key={tm.id} apiBase={apiBase} accounts={accounts} myId={myId} msg={tm} grouped={grouped}
            onReact={e=>onReact(tm.id,e)} canThread={false} inThread
            onEdit={onEdit} onDelete={onDelete} onForward={()=>onForward(tm)}/>;
        })}
      </div>
      <div className="px-3 pb-3 pt-1">
        <div className="rounded-xl border border-slate-200 focus-within:border-teal-400 focus-within:ring-2 focus-within:ring-teal-100">
          <textarea rows={1} value={draft} onChange={e=>setDraft(e.target.value)}
            onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();if(draft.trim()){onSend(draft);setDraft('');}}}}
            placeholder="Reply…" className="block max-h-28 w-full resize-none bg-transparent px-3 py-2.5 text-[15px] outline-none placeholder:text-slate-400"/>
          <div className="flex justify-end px-2 py-1.5">
            <button onClick={()=>{if(draft.trim()){onSend(draft);setDraft('');}}} disabled={!draft.trim()}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold ${draft.trim()?'bg-teal-600 text-white hover:bg-teal-700':'bg-slate-100 text-slate-400'}`}>
              <Send size={14}/> Reply
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
