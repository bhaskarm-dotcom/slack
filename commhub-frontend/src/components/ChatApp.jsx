import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Hash, Lock, Search, Send, Smile, Paperclip, Plus, Phone, Video,
         MoreHorizontal, X, ChevronDown, Reply, AtSign, Bold, Italic, Code,
         CornerDownLeft, LogOut, Loader2 } from 'lucide-react';
import api from '../lib/api';
import { getSocket } from '../lib/socket';

const PRESENCE = {
  online:  { color: 'bg-emerald-400', label: 'Active' },
  away:    { color: 'bg-amber-400',   label: 'Away'   },
  dnd:     { color: 'bg-rose-500',    label: 'Do not disturb' },
  offline: { color: 'bg-slate-400',   label: 'Offline' },
};
const EMOJIS = ['👍','🎉','❤️','😂','🔥','👀','✅','🙏','💯','👋','🚀','☕️'];

const fmtTime = t => new Date(t).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
const fmtDay  = t => {
  const d=new Date(t),today=new Date();
  if(d.toDateString()===today.toDateString()) return 'Today';
  const y=new Date(today); y.setDate(today.getDate()-1);
  if(d.toDateString()===y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([],{weekday:'long',month:'long',day:'numeric'});
};
function renderText(text) {
  const parts=[]; const regex=/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last=0,m,key=0;
  while((m=regex.exec(text))!==null){
    if(m.index>last) parts.push(text.slice(last,m.index));
    const tok=m[0];
    if(tok.startsWith('**')) parts.push(<strong key={key++}>{tok.slice(2,-2)}</strong>);
    else if(tok.startsWith('`')) parts.push(<code key={key++} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[13px] text-rose-600">{tok.slice(1,-1)}</code>);
    else parts.push(<em key={key++}>{tok.slice(1,-1)}</em>);
    last=regex.lastIndex;
  }
  if(last<text.length) parts.push(text.slice(last));
  return parts;
}

function Avatar({ user, size='h-9 w-9', showPresence=true }) {
  if(!user) return null;
  return (
    <div className="relative shrink-0">
      <div className={`${size} ${user.color||'bg-slate-500'} grid place-items-center rounded-md text-xs font-semibold text-white`}>{user.initials||'?'}</div>
      {showPresence && <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-white ${PRESENCE[user.presence]?.color||'bg-slate-400'}`}/>}
    </div>
  );
}

export default function ChatApp({ me, onLogout }) {
  const socket = getSocket();
  const [accounts, setAccounts]   = useState({});
  const [channels, setChannels]   = useState([]);
  const [messages, setMessages]   = useState([]);
  const [activeId, setActiveId]   = useState(null);
  const [threadOpen, setThreadOpen] = useState(null);
  const [draft, setDraft]         = useState('');
  const [search, setSearch]       = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [typing, setTyping]       = useState({});   // { channelId: Set<userId> }
  const [callBanner, setCallBanner] = useState(null);
  const [loading, setLoading]     = useState(true);
  const scrollRef = useRef(null);
  const inputRef  = useRef(null);

  /* ── Bootstrap ── */
  useEffect(() => {
    (async () => {
      const [usersRes, chansRes] = await Promise.all([api.get('/api/users'), api.get('/api/channels')]);
      setAccounts(usersRes.data);
      const chs = chansRes.data;
      setChannels(chs);
      const first = chs.find(c=>c.name==='general') || chs[0];
      if(first) { setActiveId(first.id); await loadMessages(first.id); }
      setLoading(false);
    })();
  }, []);

  /* ── Load messages when channel changes ── */
  const loadMessages = async (chId) => {
    const { data } = await api.get(`/api/messages/${chId}`);
    setMessages(data.messages || []);
  };
  useEffect(() => { if(activeId) loadMessages(activeId); }, [activeId]);

  /* ── Autoscroll ── */
  useEffect(() => { if(scrollRef.current) scrollRef.current.scrollTop=scrollRef.current.scrollHeight; }, [messages.length, activeId]);

  /* ── Socket events ── */
  useEffect(() => {
    if(!socket) return;
    const onMsgNew      = msg  => { if(msg.channelId===activeId) setMessages(p=>[...p,msg]); };
    const onThreadNew   = ({parentId,msg,threadCount}) => {
      setMessages(p=>p.map(m=>m.id===parentId?{...m,threadCount,thread:[...(m.thread||[]),msg]}:m));
    };
    const onReactUpdate = ({messageId,reactions}) => {
      setMessages(p=>p.map(m=>m.id===messageId?{...m,reactions}:m));
    };
    const onChanNew     = ch   => setChannels(p=>[...p,ch]);
    const onPresence    = ({userId,presence}) => setAccounts(p=>({...p,[userId]:p[userId]?{...p[userId],presence}:p[userId]}));
    const onTypingStart = ({userId,channelId}) => { if(channelId===activeId) setTyping(p=>({...p,[channelId]:new Set([...(p[channelId]||[]),userId])})); };
    const onTypingStop  = ({userId,channelId}) => { if(channelId===activeId) setTyping(p=>{const s=new Set(p[channelId]||[]);s.delete(userId);return{...p,[channelId]:s};}); };

    socket.on('message:new',   onMsgNew);
    socket.on('thread:new',    onThreadNew);
    socket.on('reaction:update', onReactUpdate);
    socket.on('channel:new',   onChanNew);
    socket.on('user:presence', onPresence);
    socket.on('typing:start',  onTypingStart);
    socket.on('typing:stop',   onTypingStop);
    return () => {
      socket.off('message:new',    onMsgNew);
      socket.off('thread:new',     onThreadNew);
      socket.off('reaction:update',onReactUpdate);
      socket.off('channel:new',    onChanNew);
      socket.off('user:presence',  onPresence);
      socket.off('typing:start',   onTypingStart);
      socket.off('typing:stop',    onTypingStop);
    };
  }, [socket, activeId]);

  const sorted = useMemo(()=>[...messages].sort((a,b)=>a.t-b.t),[messages]);

  const isDM        = activeId?.startsWith('d_');
  const activeChannel = channels.find(c=>c.id===activeId);
  const dmUserId    = isDM ? messages.find(Boolean)?.channelId?.split('__dm__')?.find(id=>id!==me.id) : null;
  const dmUser      = dmUserId ? accounts[dmUserId] : null;

  const sendMsg = (text, parentId=null) => {
    const clean=text.trim(); if(!clean||!activeId) return;
    socket?.emit('message:send', { channelId: activeId, text: clean, parentId });
    socket?.emit('typing:stop',  { channelId: activeId });
  };

  const handleTyping = (val) => {
    setDraft(val);
    if(val) socket?.emit('typing:start',{channelId:activeId});
    else    socket?.emit('typing:stop', {channelId:activeId});
  };

  const toggleReact = (messageId, emoji, parentId=null) => {
    socket?.emit('reaction:toggle',{ messageId, channelId: activeId, emoji });
    // optimistic update
    setMessages(p=>p.map(m=>{
      const apply=(msg)=>{
        const ex=msg.reactions.find(r=>r.emoji===emoji);
        let reactions;
        if(ex){const has=ex.users.includes(me.id);const users=has?ex.users.filter(u=>u!==me.id):[...ex.users,me.id];reactions=users.length?msg.reactions.map(r=>r.emoji===emoji?{...r,users}:r):msg.reactions.filter(r=>r.emoji!==emoji);}
        else reactions=[...msg.reactions,{emoji,users:[me.id]}];
        return{...msg,reactions};
      };
      if(parentId&&m.id===parentId) return{...m,thread:m.thread.map(tm=>tm.id===messageId?apply(tm):tm)};
      if(!parentId&&m.id===messageId) return apply(m);
      return m;
    }));
  };

  const createChannel = () => {
    const name = window.prompt('New channel name:'); if(!name) return;
    socket?.emit('channel:create',{name,type:'public',topic:''});
  };

  const openDM = async (userId) => {
    const { data } = await api.get(`/api/channels/dm/${userId}`);
    if(!channels.find(c=>c.id===data.id)) setChannels(p=>[...p,data]);
    setActiveId(data.id);
  };

  if(loading) return <div className="grid h-screen w-full place-items-center bg-white"><Loader2 className="animate-spin text-slate-400" size={24}/></div>;

  const myId    = me.id;
  const teammates = Object.values(accounts).filter(u=>u.id!==myId);
  const typingUsers = [...(typing[activeId]||[])].filter(id=>id!==myId).map(id=>accounts[id]?.name).filter(Boolean);
  const threadParent = threadOpen ? messages.find(m=>m.id===threadOpen) : null;
  const headerName = isDM ? (dmUser?.name || 'Direct message') : activeChannel?.name;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-white text-slate-800 antialiased" style={{fontFamily:"ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif"}}>
      {/* Workspace rail */}
      <nav className="flex w-16 shrink-0 flex-col items-center gap-3 bg-slate-900 py-4">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-teal-400 to-teal-600 font-bold text-white shadow-lg shadow-teal-900/40">CH</div>
        <div className="h-px w-8 bg-slate-700"/>
        <button className="grid h-10 w-10 place-items-center rounded-xl bg-slate-700 text-sm font-semibold text-white ring-2 ring-teal-400">WL</button>
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
          <button onClick={createChannel} className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-slate-700 text-white hover:bg-slate-600" title="New channel"><Plus size={16}/></button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-3">
          <p className="px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Channels</p>
          {channels.filter(c=>c.type!=='dm').map(c=>(
            <button key={c.id} onClick={()=>setActiveId(c.id)} className={`group flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition ${activeId===c.id?'bg-teal-500/15 text-white':'text-slate-300 hover:bg-slate-700/60'}`}>
              <span className="grid h-[18px] w-[18px] place-items-center text-slate-400">{c.type==='private'?<Lock size={15}/>:<Hash size={15}/>}</span>
              <span className="flex-1 truncate text-left">{c.name}</span>
            </button>
          ))}
          <button onClick={createChannel} className="mt-1 flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-slate-400 hover:bg-slate-700/60 hover:text-white">
            <span className="grid h-[18px] w-[18px] place-items-center"><Plus size={14}/></span> Add channel
          </button>
          <p className="mt-4 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Direct messages</p>
          {teammates.map(u=>(
            <button key={u.id} onClick={()=>openDM(u.id)} className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition hover:bg-slate-700/60`}>
              <span className={`block h-2.5 w-2.5 rounded-full ${PRESENCE[u.presence]?.color||'bg-slate-400'}`}/>
              <span className="flex-1 truncate text-left">{u.name}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* Main */}
      <main className="flex min-w-0 flex-1 flex-col bg-white">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {isDM?<Avatar user={dmUser} size="h-7 w-7"/>:<span className="grid h-7 w-7 place-items-center rounded-md bg-slate-100 text-slate-600">{activeChannel?.type==='private'?<Lock size={15}/>:<Hash size={15}/>}</span>}
            <div className="min-w-0">
              <div className="flex items-center gap-2"><h1 className="truncate font-bold text-slate-900">{headerName}</h1>{isDM&&dmUser&&<span className="text-xs text-slate-400">{PRESENCE[dmUser.presence]?.label}</span>}</div>
              <p className="truncate text-xs text-slate-400">{isDM?dmUser?.title||'Direct message':activeChannel?.topic||'No topic set'}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={()=>setCallBanner({kind:'voice'})} className="grid h-9 w-9 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-teal-600" title="Voice call"><Phone size={17}/></button>
            <button onClick={()=>setCallBanner({kind:'video'})} className="grid h-9 w-9 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-teal-600" title="Video call"><Video size={17}/></button>
            <div className="relative ml-2">
              <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"/>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search messages" className="w-44 rounded-md border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-sm outline-none transition focus:w-56 focus:border-teal-400 focus:bg-white focus:ring-2 focus:ring-teal-100"/>
            </div>
          </div>
        </header>

        {callBanner&&(
          <div className="flex items-center justify-between bg-teal-50 px-5 py-2.5 text-sm">
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
          {sorted.filter(m=>!search||m.text.toLowerCase().includes(search.toLowerCase())).map((m,i,arr)=>{
            const prev=arr[i-1];
            const grouped=prev&&prev.senderId===m.senderId&&m.t-prev.t<5*60000;
            const showDay=!prev||fmtDay(prev.t)!==fmtDay(m.t);
            return (
              <React.Fragment key={m.id}>
                {showDay&&<div className="my-3 flex items-center gap-3 px-3"><div className="h-px flex-1 bg-slate-100"/><span className="rounded-full border border-slate-200 px-3 py-0.5 text-xs font-semibold text-slate-500">{fmtDay(m.t)}</span><div className="h-px flex-1 bg-slate-100"/></div>}
                <MsgRow accounts={accounts} myId={myId} msg={m} grouped={grouped} onReact={e=>toggleReact(m.id,e)} onThread={()=>!isDM&&setThreadOpen(m.id)} canThread={!isDM}/>
              </React.Fragment>
            );
          })}
          {typingUsers.length>0&&(
            <div className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400">
              <span className="flex gap-1">{[0,120,240].map(d=><span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{animationDelay:`${d}ms`}}/>)}</span>
              {typingUsers.slice(0,2).join(', ')}{typingUsers.length>2?` and ${typingUsers.length-2} others`:''} {typingUsers.length===1?'is':'are'} typing…
            </div>
          )}
        </div>

        <Composer value={draft} setValue={handleTyping} onSend={t=>{sendMsg(t);setDraft('');setShowEmoji(false);}}
          placeholder={isDM?`Message ${headerName}`:`Message #${activeChannel?.name}`}
          showEmoji={showEmoji} setShowEmoji={setShowEmoji} onEmoji={e=>setDraft(d=>d+e)} inputRef={inputRef}/>
      </main>

      {threadParent&&(
        <ThreadPanel accounts={accounts} myId={myId} parent={threadParent} channelName={activeChannel?.name}
          onClose={()=>setThreadOpen(null)} onSend={t=>sendMsg(t,threadParent.id)} onReact={(mid,e)=>toggleReact(mid,e,threadParent.id)}/>
      )}
    </div>
  );
}

function MsgRow({accounts,myId,msg,grouped,onReact,onThread,canThread,inThread}) {
  const u=accounts[msg.senderId]||{initials:'?',color:'bg-slate-400',name:'Unknown',presence:'offline'};
  const [hover,setHover]=useState(false);
  const [picker,setPicker]=useState(false);
  return (
    <div onMouseEnter={()=>setHover(true)} onMouseLeave={()=>{setHover(false);setPicker(false);}} className={`group relative flex gap-3 px-3 ${grouped?'py-0.5':'mt-1 py-1.5'} hover:bg-slate-50`}>
      <div className="w-9 shrink-0">{!grouped?<Avatar user={u} showPresence={false}/>:<span className="block pt-1 text-center text-[10px] leading-4 text-transparent group-hover:text-slate-400">{fmtTime(msg.t)}</span>}</div>
      <div className="min-w-0 flex-1">
        {!grouped&&<div className="flex items-baseline gap-2"><span className="font-semibold text-slate-900">{u.name}</span><span className="text-xs text-slate-400">{fmtTime(msg.t)}</span></div>}
        <div className="text-[15px] leading-relaxed text-slate-700">{renderText(msg.text)}</div>
        {msg.reactions?.length>0&&(
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {msg.reactions.map(r=>{const mine=r.users?.includes(myId);return(
              <button key={r.emoji} onClick={()=>onReact(r.emoji)} className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition ${mine?'border-teal-300 bg-teal-50 text-teal-700':'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}><span className="text-sm leading-none">{r.emoji}</span><span className="font-medium">{r.users?.length}</span></button>);})}
            <button onClick={()=>setPicker(p=>!p)} className="grid h-6 w-6 place-items-center rounded-full border border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-600"><Smile size={13}/></button>
          </div>
        )}
        {!inThread&&msg.threadCount>0&&(
          <button onClick={onThread} className="mt-1.5 flex items-center gap-2 rounded-md px-1.5 py-1 text-xs font-medium text-teal-600 hover:bg-white">
            <span className="flex -space-x-1">{[...new Set(msg.thread?.map(t=>t.senderId)||[])].slice(0,3).map(id=>{const tu=accounts[id]||{color:'bg-slate-400',initials:'?'};return<span key={id} className={`${tu.color} grid h-4 w-4 place-items-center rounded text-[8px] font-bold text-white ring-1 ring-white`}>{tu.initials}</span>;})}</span>
            {msg.threadCount} repl{msg.threadCount===1?'y':'ies'} <span className="text-slate-400">· last {fmtTime(msg.thread?.[msg.thread.length-1]?.t||msg.t)}</span>
          </button>
        )}
      </div>
      {hover&&(
        <div className="absolute -top-3 right-3 flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
          {['👍','🎉','❤️'].map(e=><button key={e} onClick={()=>onReact(e)} className="grid h-7 w-7 place-items-center rounded-md text-sm hover:bg-slate-100">{e}</button>)}
          <button onClick={()=>setPicker(p=>!p)} className="grid h-7 w-7 place-items-center rounded-md text-slate-500 hover:bg-slate-100"><Smile size={15}/></button>
          {canThread&&!inThread&&<button onClick={onThread} className="grid h-7 w-7 place-items-center rounded-md text-slate-500 hover:bg-slate-100"><Reply size={15}/></button>}
          <button className="grid h-7 w-7 place-items-center rounded-md text-slate-500 hover:bg-slate-100"><MoreHorizontal size={15}/></button>
        </div>
      )}
      {picker&&<div className="absolute right-3 top-6 z-10 grid grid-cols-6 gap-0.5 rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg">{EMOJIS.map(e=><button key={e} onClick={()=>{onReact(e);setPicker(false);}} className="grid h-8 w-8 place-items-center rounded-md text-lg hover:bg-slate-100">{e}</button>)}</div>}
    </div>
  );
}

function Composer({value,setValue,onSend,placeholder,showEmoji,setShowEmoji,onEmoji,inputRef}) {
  const onKey=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();onSend(value);}};
  const wrap=(a,b=a)=>{const ta=inputRef.current;if(!ta)return;const s=ta.selectionStart,en=ta.selectionEnd;const sel=value.slice(s,en)||'text';setValue(value.slice(0,s)+a+sel+b+value.slice(en));};
  return (
    <div className="px-3 pb-3 pt-1">
      <div className="rounded-xl border border-slate-200 transition focus-within:border-teal-400 focus-within:ring-2 focus-within:ring-teal-100">
        <div className="flex items-center gap-0.5 border-b border-slate-100 px-2 py-1">
          <FmtBtn icon={<Bold size={14}/>} onClick={()=>wrap('**')}/><FmtBtn icon={<Italic size={14}/>} onClick={()=>wrap('*')}/><FmtBtn icon={<Code size={14}/>} onClick={()=>wrap('`')}/>
        </div>
        <textarea ref={inputRef} rows={1} value={value} onChange={e=>setValue(e.target.value)} onKeyDown={onKey} placeholder={placeholder} className="block max-h-32 w-full resize-none bg-transparent px-3 py-2.5 text-[15px] outline-none placeholder:text-slate-400"/>
        <div className="relative flex items-center justify-between px-2 py-1.5">
          <div className="flex items-center gap-0.5"><FmtBtn icon={<Plus size={17}/>}/><FmtBtn icon={<Paperclip size={16}/>} title="Attach (Phase 2)"/><FmtBtn icon={<Smile size={16}/>} onClick={()=>setShowEmoji(s=>!s)}/><FmtBtn icon={<AtSign size={16}/>} onClick={()=>setValue(value+'@')}/></div>
          <button onClick={()=>onSend(value)} disabled={!value.trim()} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${value.trim()?'bg-teal-600 text-white hover:bg-teal-700':'bg-slate-100 text-slate-400'}`}><Send size={14}/> Send</button>
          {showEmoji&&<div className="absolute bottom-11 right-2 z-10 grid grid-cols-6 gap-0.5 rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg">{EMOJIS.map(e=><button key={e} onClick={()=>onEmoji(e)} className="grid h-8 w-8 place-items-center rounded-md text-lg hover:bg-slate-100">{e}</button>)}</div>}
        </div>
      </div>
      <p className="mt-1 flex items-center gap-1 px-1 text-[11px] text-slate-400"><CornerDownLeft size={11}/> Enter to send · Shift+Enter for a new line · **bold** *italic* `code`</p>
    </div>
  );
}
function FmtBtn({icon,onClick,title}){return <button onClick={onClick} title={title} className="grid h-7 w-7 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700">{icon}</button>;}

function ThreadPanel({accounts,myId,parent,channelName,onClose,onSend,onReact}) {
  const [draft,setDraft]=useState('');
  const ref=useRef(null);
  useEffect(()=>{if(ref.current)ref.current.scrollTop=ref.current.scrollHeight;},[parent.thread?.length]);
  return (
    <section className="flex w-96 shrink-0 flex-col border-l border-slate-200 bg-white">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><div><h3 className="font-bold text-slate-900">Thread</h3><p className="text-xs text-slate-400">#{channelName}</p></div><button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100"><X size={18}/></button></header>
      <div ref={ref} className="flex-1 overflow-y-auto py-2">
        <MsgRow accounts={accounts} myId={myId} msg={parent} grouped={false} onReact={e=>onReact(parent.id,e)} canThread={false} inThread/>
        <div className="my-2 flex items-center gap-3 px-4"><div className="h-px flex-1 bg-slate-100"/><span className="text-xs font-medium text-slate-400">{parent.thread?.length||0} repl{(parent.thread?.length||0)===1?'y':'ies'}</span><div className="h-px flex-1 bg-slate-100"/></div>
        {(parent.thread||[]).map((tm,i)=>{const prev=(parent.thread||[])[i-1];const grouped=prev&&prev.senderId===tm.senderId&&tm.t-prev.t<5*60000;return<MsgRow key={tm.id} accounts={accounts} myId={myId} msg={tm} grouped={grouped} onReact={e=>onReact(tm.id,e)} canThread={false} inThread/>;  })}
      </div>
      <div className="px-3 pb-3 pt-1">
        <div className="rounded-xl border border-slate-200 focus-within:border-teal-400 focus-within:ring-2 focus-within:ring-teal-100">
          <textarea rows={1} value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();if(draft.trim()){onSend(draft);setDraft('');}}}} placeholder="Reply…" className="block max-h-28 w-full resize-none bg-transparent px-3 py-2.5 text-[15px] outline-none placeholder:text-slate-400"/>
          <div className="flex justify-end px-2 py-1.5"><button onClick={()=>{if(draft.trim()){onSend(draft);setDraft('');}}} disabled={!draft.trim()} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold ${draft.trim()?'bg-teal-600 text-white hover:bg-teal-700':'bg-slate-100 text-slate-400'}`}><Send size={14}/> Reply</button></div>
        </div>
      </div>
    </section>
  );
}

