import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Hash, Lock, Search, Send, Smile, Paperclip, Plus, Phone, Video,
         MoreHorizontal, X, ChevronDown, Reply, AtSign, Bold, Italic,
         Underline, Strikethrough, Link, List, ListOrdered, Code,
         CornerDownLeft, LogOut, Loader2, Info, Star, EyeOff, Bell,
         ExternalLink, Columns2, UserCircle, FileText, Pencil, Trash2,
         Forward, Bookmark, Download, Check, Camera, Terminal, Quote, Copy } from 'lucide-react';
import api from '../lib/api';
import { getSocket } from '../lib/socket';

/* ── constants ── */
const PRESENCE = {
  online:  { color: 'bg-emerald-400', label: 'Active' },
  away:    { color: 'bg-amber-400',   label: 'Away'   },
  dnd:     { color: 'bg-rose-500',    label: 'Do not disturb' },
  offline: { color: 'bg-slate-400',   label: 'Offline' },
};
const EMOJIS = ['👍','🎉','❤️','😂','🔥','👀','✅','🙏','💯','👋','🚀','☕️'];
const COLORS = ['bg-teal-500','bg-indigo-500','bg-rose-500','bg-amber-500',
                'bg-emerald-500','bg-violet-500','bg-cyan-600','bg-orange-500',
                'bg-pink-500','bg-sky-500','bg-lime-600','bg-slate-600'];
const API_BASE = import.meta.env.VITE_API_URL || '';

/* ── Rich text styles (injected once) ── */
const RICH_CSS = `
.rich-content b,.rich-content strong{font-weight:600}
.rich-content i,.rich-content em{font-style:italic}
.rich-content u{text-decoration:underline}
.rich-content s,.rich-content strike,.rich-content del{text-decoration:line-through}
.rich-content a{color:#0d9488;text-decoration:underline}
.rich-content a:hover{color:#0f766e}
.rich-content ul{list-style:disc;padding-left:1.5em;margin:0.25em 0}
.rich-content ol{list-style:decimal;padding-left:1.5em;margin:0.25em 0}
.rich-content li{margin:0.1em 0}
.rich-content blockquote{border-left:3px solid #cbd5e1;padding-left:0.75em;color:#64748b;margin:0.25em 0;font-style:italic}
.rich-content code{background:#f1f5f9;color:#e11d48;padding:0.1em 0.35em;border-radius:4px;font-family:monospace;font-size:0.875em}
.rich-content pre{background:#1e293b;color:#e2e8f0;padding:0.75em 1em;border-radius:8px;overflow-x:auto;margin:0.25em 0;font-size:0.875em}
.rich-content pre code{background:none;color:inherit;padding:0}
.rich-content p{margin:0}
.rich-editor{outline:none;min-height:24px}
.rich-editor:empty:before{content:attr(data-ph);color:#94a3b8;pointer-events:none;display:block}
.rich-editor ul{list-style:disc;padding-left:1.5em}
.rich-editor ol{list-style:decimal;padding-left:1.5em}
.rich-editor blockquote{border-left:3px solid #cbd5e1;padding-left:0.75em;color:#64748b;font-style:italic}
.rich-editor code{background:#f1f5f9;color:#e11d48;padding:0.1em 0.35em;border-radius:4px;font-family:monospace;font-size:0.875em}
.rich-editor pre{background:#1e293b;color:#e2e8f0;padding:0.75em 1em;border-radius:8px;overflow-x:auto;font-size:0.875em}
.rich-editor pre code{background:none;color:inherit;padding:0}
.rich-editor a{color:#0d9488;text-decoration:underline}
`;

function injectStyles() {
  if (document.getElementById('commhub-rich-css')) return;
  const s = document.createElement('style');
  s.id = 'commhub-rich-css';
  s.textContent = RICH_CSS;
  document.head.appendChild(s);
}

/* ── HTML sanitizer ── */
const SAFE_TAGS = new Set(['b','strong','i','em','u','s','strike','del','a','ul','ol','li',
  'blockquote','code','pre','br','p','div','span']);

function sanitize(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  function clean(node) {
    if (node.nodeType === 3) return; // text node
    if (node.nodeType !== 1) { node.parentNode?.removeChild(node); return; }
    const tag = node.tagName.toLowerCase();
    if (!SAFE_TAGS.has(tag)) {
      const frag = document.createDocumentFragment();
      [...node.childNodes].forEach(c => frag.appendChild(c));
      node.parentNode?.replaceChild(frag, node);
      [...frag.childNodes].forEach(clean);
      return;
    }
    [...node.attributes].forEach(a => {
      if (tag === 'a' && (a.name === 'href' || a.name === 'target' || a.name === 'rel')) return;
      node.removeAttribute(a.name);
    });
    if (tag === 'a') { node.setAttribute('target','_blank'); node.setAttribute('rel','noopener noreferrer'); }
    [...node.childNodes].forEach(clean);
  }
  [...doc.body.childNodes].forEach(clean);
  return doc.body.innerHTML;
}

/* ── helpers ── */
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
const isHtmlMsg = t => /<[a-z][\s\S]*>/i.test(t) && !t.startsWith('[FILE:');

/* ── File download ── */
async function downloadFile(fileId, fileName) {
  try {
    const token = localStorage.getItem('commhub_token');
    const res = await fetch(`${API_BASE}/api/files/${fileId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error('Download failed');
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href=url; a.download=fileName;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  } catch(e) { alert('Download failed: '+e.message); }
}

function DownloadButton({ fileId, name, size }) {
  const [loading,setLoading]=useState(false);
  return (
    <button onClick={async()=>{setLoading(true);await downloadFile(fileId,name);setLoading(false);}} disabled={loading}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm text-teal-700 transition hover:border-teal-200 hover:bg-teal-50">
      <Paperclip size={13}/><span className="font-medium">{name}</span>
      <span className="text-slate-400">·</span><span className="text-xs text-slate-500">{fmtSize(size)}</span>
      {loading?<Loader2 size={12} className="ml-1 animate-spin"/>:<Download size={12} className="ml-1 text-teal-400"/>}
    </button>
  );
}

/* ── renderText — handles FILE markers + markdown (legacy) ── */
function renderText(text) {
  if(!text) return null;
  const parts=[], fileRe=/\[FILE:([^:]+):([^:]+):(\d+)\]/g, fmtRe=/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let key=0, lf=0, m;
  const segments=[];
  while((m=fileRe.exec(text))!==null){
    if(m.index>lf) segments.push({type:'text',val:text.slice(lf,m.index)});
    segments.push({type:'file',fileId:m[1],name:m[2],size:parseInt(m[3])});
    lf=fileRe.lastIndex;
  }
  if(lf<text.length) segments.push({type:'text',val:text.slice(lf)});
  segments.forEach(seg=>{
    if(seg.type==='file'){
      parts.push(<DownloadButton key={key++} fileId={seg.fileId} name={seg.name} size={seg.size}/>);
    } else {
      let ll=0,fm; fmtRe.lastIndex=0;
      while((fm=fmtRe.exec(seg.val))!==null){
        if(fm.index>ll) parts.push(seg.val.slice(ll,fm.index));
        const tok=fm[0];
        if(tok.startsWith('**')) parts.push(<strong key={key++}>{tok.slice(2,-2)}</strong>);
        else if(tok.startsWith('`')) parts.push(<code key={key++} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[13px] text-rose-600">{tok.slice(1,-1)}</code>);
        else parts.push(<em key={key++}>{tok.slice(1,-1)}</em>);
        ll=fmtRe.lastIndex;
      }
      if(ll<seg.val.length) parts.push(seg.val.slice(ll));
    }
  });
  return parts;
}

/* ── MessageContent: routes between HTML and plain text/FILE ── */
function MessageContent({ text }) {
  if (!text) return null;
  if (text === '[message deleted]') return <span className="italic text-slate-400">[message deleted]</span>;
  if (text.includes('[FILE:')) return <div className="flex flex-wrap gap-2">{renderText(text)}</div>;
  if (isHtmlMsg(text)) return <div className="rich-content text-[15px] leading-relaxed" dangerouslySetInnerHTML={{ __html: sanitize(text) }}/>;
  return <div className="text-[15px] leading-relaxed whitespace-pre-wrap text-slate-700">{renderText(text)}</div>;
}

/* ── Avatar ── */
function Avatar({user,size='h-9 w-9',showPresence=true}){
  if(!user) return null;
  return (
    <div className="relative shrink-0">
      {user.avatar_url
        ?<img src={`${API_BASE}${user.avatar_url}`} alt={user.name} className={`${size} rounded-md object-cover`}/>
        :<div className={`${size} ${user.color||'bg-slate-500'} grid place-items-center rounded-md text-xs font-semibold text-white select-none`}>{user.initials||'?'}</div>
      }
      {showPresence&&<span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-white ${PRESENCE[user.presence]?.color||'bg-slate-400'}`}/>}
    </div>
  );
}

/* ── Edit Channel Settings Modal ── */
function EditChannelModal({channel,onSave,onClose}){
  const [name,setName]=useState(channel.name||'');
  const [topic,setTopic]=useState(channel.topic||'');
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={onClose}/>
      <div className="fixed left-1/2 top-1/2 z-50 w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between px-6 pt-6">
          <h2 className="text-xl font-bold text-slate-900">Edit settings</h2>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-slate-100"><X size={18}/></button>
        </div>
        <div className="px-6 py-5">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">Channel name</span>
            <div className="flex items-center rounded-lg border border-slate-200 px-3 focus-within:border-teal-400 focus-within:ring-2 focus-within:ring-teal-100">
              <Hash size={15} className="text-slate-400"/>
              <input value={name} onChange={e=>setName(e.target.value)} autoFocus
                className="w-full bg-transparent px-2 py-2.5 text-sm outline-none"/>
            </div>
          </label>
          <label className="mt-4 block">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">Topic</span>
            <input value={topic} onChange={e=>setTopic(e.target.value)} placeholder="What's this channel about?"
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100"/>
          </label>
          <div className="mt-6 flex justify-end gap-2">
            <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
            <button onClick={()=>onSave({name:name.trim(),topic:topic.trim()})} disabled={!name.trim()}
              className={`rounded-lg px-5 py-2 text-sm font-semibold ${name.trim()?'bg-teal-600 text-white hover:bg-teal-700':'bg-slate-100 text-slate-400'}`}>Save changes</button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Add People Modal (shown after creating a private channel) ── */
function AddPeopleModal({channel,teammates,onAdd,onClose}){
  const [selected,setSelected]=useState([]);
  const [q,setQ]=useState('');
  const filtered=teammates.filter(u=>u.name.toLowerCase().includes(q.toLowerCase()));
  const toggle=id=>setSelected(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={onClose}/>
      <div className="fixed left-1/2 top-1/2 z-50 w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between px-6 pt-6">
          <div>
            <h2 className="flex items-center gap-1.5 text-xl font-bold text-slate-900"><Lock size={17}/> Add people to {channel.name}</h2>
            <p className="mt-0.5 text-sm text-slate-400">#{channel.name}</p>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-slate-100"><X size={18}/></button>
        </div>
        <div className="px-6 py-5">
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="ex. Nathalie, or search a name…" autoFocus
            className="w-full rounded-lg border-2 border-teal-400 px-3 py-2.5 text-sm outline-none ring-2 ring-teal-100"/>
          {selected.length>0&&(
            <div className="mt-2 flex flex-wrap gap-1.5">
              {selected.map(id=>{const u=teammates.find(t=>t.id===id);if(!u)return null;return(
                <span key={id} className="flex items-center gap-1 rounded-md bg-teal-50 px-2 py-1 text-xs font-medium text-teal-700">
                  {u.name}<button onClick={()=>toggle(id)} className="text-teal-400 hover:text-teal-600"><X size={11}/></button>
                </span>);})}
            </div>
          )}
          <div className="mt-3 max-h-52 overflow-y-auto rounded-lg border border-slate-200">
            {filtered.length===0&&<p className="px-3 py-4 text-center text-xs text-slate-400">No people found</p>}
            {filtered.map(u=>(
              <button key={u.id} onClick={()=>toggle(u.id)} className="flex w-full items-center gap-2.5 px-3 py-2 text-sm hover:bg-slate-50">
                <Avatar user={u} size="h-7 w-7" showPresence={false}/>
                <span className="flex-1 text-left text-slate-700">{u.name}</span>
                <span className={`grid h-5 w-5 place-items-center rounded-md border ${selected.includes(u.id)?'border-teal-600 bg-teal-600 text-white':'border-slate-300'}`}>
                  {selected.includes(u.id)&&<Check size={13}/>}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Skip for now</button>
            <button onClick={()=>onAdd(selected)} disabled={selected.length===0}
              className={`rounded-lg px-5 py-2 text-sm font-semibold ${selected.length>0?'bg-teal-600 text-white hover:bg-teal-700':'bg-slate-100 text-slate-400'}`}>
              Add {selected.length>0?`(${selected.length})`:''}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Create Channel Modal (2-step: name/topic → visibility + members) ── */
function CreateChannelModal({onCreate,onClose}){
  const [step,setStep]=useState(1);
  const [name,setName]=useState('');
  const [topic,setTopic]=useState('');
  const [type,setType]=useState('public');
  const canNext = name.trim().length>0;

  const create=()=>{
    if(!name.trim()) return;
    onCreate({ name: name.trim(), type, topic: topic.trim() });
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={onClose}/>
      <div className="fixed left-1/2 top-1/2 z-50 w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Create a channel</h2>
            {name&&<p className="mt-0.5 text-sm text-slate-400">#{name.trim().toLowerCase().replace(/\s+/g,'-')}</p>}
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-slate-100"><X size={18}/></button>
        </div>

        {step===1?(
          <div className="px-6 py-5">
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-slate-700">Name</span>
              <div className="flex items-center rounded-lg border border-slate-200 px-3 focus-within:border-teal-400 focus-within:ring-2 focus-within:ring-teal-100">
                <Hash size={15} className="text-slate-400"/>
                <input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. marketing" autoFocus
                  onKeyDown={e=>{if(e.key==='Enter'&&canNext)setStep(2);}}
                  className="w-full bg-transparent px-2 py-2.5 text-sm outline-none"/>
              </div>
            </label>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-sm font-semibold text-slate-700">Topic <span className="font-normal text-slate-400">(optional)</span></span>
              <input value={topic} onChange={e=>setTopic(e.target.value)} placeholder="What's this channel about?"
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100"/>
            </label>
            <div className="mt-6 flex items-center justify-between">
              <span className="text-xs text-slate-400">Step 1 of 2</span>
              <button onClick={()=>setStep(2)} disabled={!canNext}
                className={`rounded-lg px-5 py-2 text-sm font-semibold ${canNext?'bg-teal-600 text-white hover:bg-teal-700':'bg-slate-100 text-slate-400'}`}>Next</button>
            </div>
          </div>
        ):(
          <div className="px-6 py-5">
            <p className="mb-2 text-sm font-semibold text-slate-700">Visibility</p>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
              <input type="radio" checked={type==='public'} onChange={()=>setType('public')} className="mt-0.5 accent-teal-600"/>
              <div><p className="text-sm font-medium text-slate-800">Public — anyone can join</p><p className="text-xs text-slate-500">All members of the workspace will be added</p></div>
            </label>
            <label className="mt-2 flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
              <input type="radio" checked={type==='private'} onChange={()=>setType('private')} className="mt-0.5 accent-teal-600"/>
              <div><p className="text-sm font-medium text-slate-800">Private — only specific people</p><p className="text-xs text-slate-500">Only invited members can view or join</p></div>
            </label>

            <div className="mt-6 flex items-center justify-between">
              <span className="text-xs text-slate-400">Step 2 of 2</span>
              <div className="flex gap-2">
                <button onClick={()=>setStep(1)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Back</button>
                <button onClick={create}
                  className="rounded-lg bg-teal-600 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-700">Create</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function ContextMenu({onClose,isDM,targetName,starred,muted,hidden,onAction}){
  const [copyOpen,setCopyOpen]=useState(false);
  const items=[
    {icon:<Info size={15}/>,label:isDM?'Conversation details':'Channel details',action:'details',sub:true},
    {icon:<UserCircle size={15}/>,label:isDM?'View full profile':'View members',action:'profile'},
    {icon:<Copy size={15}/>,label:'Copy',action:'copy',sub:true},
    {icon:<Star size={15}/>,label:starred?(isDM?'Unstar conversation':'Unstar channel'):(isDM?'Star conversation':'Star channel'),action:'star'},
    {icon:<Bell size={15}/>,label:muted?'Unmute notifications':'Mute notifications',action:'mute'},
    null,
    {icon:<FileText size={15}/>,label:isDM?'Summarize conversation':'Summarize channel',action:'summarize',sub:true},
    null,
    ...(isDM?[]:[{icon:<Pencil size={15}/>,label:'Edit settings',action:'editsettings'}]),
    {icon:<ExternalLink size={15}/>,label:'Open in new window',action:'newwindow'},
    null,
    isDM
      ? {icon:<EyeOff size={15}/>,label:hidden?'Unhide conversation':'Hide conversation',action:'hide',danger:true}
      : {icon:<LogOut size={15}/>,label:'Leave channel',action:'leave',danger:true},
  ];
  const handle=(action)=>{
    if(action==='copy'){ setCopyOpen(o=>!o); return; }
    onAction(action);
    if(action!=='star'&&action!=='mute') onClose();
  };
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose}/>
      <div className="absolute right-0 top-12 z-50 w-64 overflow-visible rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Options</p>
          <p className="mt-0.5 truncate text-sm font-bold text-slate-800">{targetName}</p>
        </div>
        <div className="py-1.5">
          {items.map((item,i)=>item===null
            ?<div key={i} className="my-1 h-px bg-slate-100"/>
            :<div key={i} className="relative">
              <button onClick={()=>handle(item.action)} className={`flex w-full items-center gap-3 px-4 py-2.5 text-sm transition hover:bg-slate-50 ${item.danger?'text-rose-500':'text-slate-700'} ${item.action==='copy'&&copyOpen?'bg-slate-50':''}`}>
                <span className={item.danger?'text-rose-400':'text-slate-400'}>{item.icon}</span>
                <span className="flex-1 text-left">{item.label}</span>
                {(item.action==='star'&&starred)||(item.action==='mute'&&muted)?<Check size={14} className="text-teal-500"/>:item.sub?<ChevronDown size={13} className="-rotate-90 text-slate-300"/>:null}
              </button>
              {item.action==='copy'&&copyOpen&&(
                <div className="absolute right-full top-0 mr-1 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                  <button onClick={()=>{onAction('copy:name');onClose();}} className="flex w-full items-center px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">Copy name</button>
                  <button onClick={()=>{onAction('copy:link');onClose();}} className="flex w-full items-center px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">Copy link</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function ForwardModal({channels,accounts,me,onForward,onClose}){
  const [q,setQ]=useState('');
  const dmChannels=channels.filter(c=>c.type==='dm'&&c.members?.includes(me.id)).map(c=>{
    const otherId=c.members?.find(id=>id!==me.id);
    const other=accounts[otherId];
    return other?{id:c.id,name:other.name,color:other.color,initials:other.initials,type:'dm',presence:other.presence}:null;
  }).filter(Boolean);
  const allTargets=[...channels.filter(c=>c.type!=='dm'),...dmChannels];
  const filtered=allTargets.filter(t=>t.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm" onClick={onClose}/>
      <div className="fixed left-1/2 top-1/2 z-50 w-80 -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 className="font-bold text-slate-900">Forward message</h3>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100"><X size={16}/></button>
        </div>
        <div className="px-4 py-3">
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search channels or people…" autoFocus
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100"/>
        </div>
        <div className="max-h-56 overflow-y-auto px-2 pb-3">
          {filtered.map(item=>(
            <button key={item.id} onClick={()=>onForward(item.id)}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm hover:bg-slate-50">
              {item.type==='dm'
                ?<div className={`${item.color} grid h-7 w-7 place-items-center rounded-md text-[11px] font-semibold text-white`}>{item.initials}</div>
                :<span className="grid h-7 w-7 place-items-center rounded-md bg-slate-100 text-slate-500">{item.type==='private'?<Lock size={14}/>:<Hash size={14}/>}</span>
              }
              <span className="font-medium text-slate-800">{item.name}</span>
              {item.type==='dm'&&<span className={`ml-auto h-2 w-2 rounded-full ${PRESENCE[item.presence]?.color||'bg-slate-400'}`}/>}
            </button>
          ))}
          {filtered.length===0&&<p className="px-3 py-4 text-center text-sm text-slate-400">No results</p>}
        </div>
      </div>
    </>
  );
}

function ProfilePanel({user,onClose,onSave}){
  const [name,setName]=useState(user.name||'');
  const [title,setTitle]=useState(user.title||'');
  const [color,setColor]=useState(user.color||COLORS[0]);
  const [saving,setSaving]=useState(false);
  const [photoUp,setPhotoUp]=useState(false);
  const photoRef=useRef(null);
  const save=async()=>{
    setSaving(true);
    try{ const {data}=await api.patch('/api/users/me',{name,title,color}); onSave(data); onClose(); }
    catch{ alert('Save failed'); }
    setSaving(false);
  };
  const uploadPhoto=async e=>{
    const f=e.target.files?.[0]; if(!f) return;
    setPhotoUp(true);
    try{
      const b64=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(',')[1]);r.onerror=rej;r.readAsDataURL(f);});
      const {data:fData}=await api.post('/api/files',{name:f.name,mimeType:f.type,sizeBytes:f.size,data:b64});
      const {data:uData}=await api.patch('/api/users/me',{avatarFileId:fData.fileId});
      onSave(uData);
    }catch{ alert('Photo upload failed'); }
    setPhotoUp(false);
  };
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm" onClick={onClose}/>
      <div className="fixed left-1/2 top-1/2 z-50 w-80 -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 className="font-bold text-slate-900">Edit profile</h3>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100"><X size={16}/></button>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar user={{...user,color}} size="h-16 w-16" showPresence={false}/>
              <button onClick={()=>photoRef.current?.click()} className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full bg-teal-600 text-white shadow-md hover:bg-teal-700">
                {photoUp?<Loader2 size={11} className="animate-spin"/>:<Camera size={11}/>}
              </button>
              <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={uploadPhoto}/>
            </div>
            <div><p className="font-semibold text-slate-800">{name||user.name}</p><p className="text-xs text-slate-400">{user.email}</p></div>
          </div>
          <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">Display name</span>
            <input value={name} onChange={e=>setName(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100"/>
          </label>
          <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">What I do</span>
            <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Designer, Developer…" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100"/>
          </label>
          <div><p className="mb-2 text-xs font-semibold text-slate-600">Avatar colour</p>
            <div className="flex flex-wrap gap-2">
              {COLORS.map(c=><button key={c} onMouseDown={e=>{e.preventDefault();setColor(c);}} className={`h-7 w-7 rounded-lg ${c} transition ${color===c?'ring-2 ring-offset-2 ring-teal-400 scale-110':''}`}/>)}
            </div>
          </div>
          <button onClick={save} disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-lg bg-teal-600 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60">
            {saving?<Loader2 size={15} className="animate-spin"/>:<Check size={15}/>} Save changes
          </button>
        </div>
      </div>
    </>
  );
}

/* ── Conversation Details / Profile panel ── */
function DetailsPanel({isDM,dmUser,channel,accounts,messageCount,onClose}){
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm" onClick={onClose}/>
      <div className="fixed right-4 top-4 bottom-4 z-50 w-80 overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 className="font-bold text-slate-900">{isDM?'Profile':'Conversation details'}</h3>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100"><X size={16}/></button>
        </div>
        <div className="p-5">
          {isDM&&dmUser?(
            <div className="text-center">
              <div className="mx-auto"><Avatar user={dmUser} size="h-20 w-20" showPresence={false}/></div>
              <h2 className="mt-3 text-lg font-bold text-slate-900">{dmUser.name}</h2>
              {dmUser.title&&<p className="text-sm text-slate-500">{dmUser.title}</p>}
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                <span className={`h-2 w-2 rounded-full ${PRESENCE[dmUser.presence]?.color||'bg-slate-400'}`}/>
                {PRESENCE[dmUser.presence]?.label||'Offline'}
              </div>
              {dmUser.email&&<div className="mt-4 rounded-lg border border-slate-200 p-3 text-left"><p className="text-xs font-semibold text-slate-400">Email</p><p className="text-sm text-slate-700">{dmUser.email}</p></div>}
              <div className="mt-2 rounded-lg border border-slate-200 p-3 text-left"><p className="text-xs font-semibold text-slate-400">Messages</p><p className="text-sm text-slate-700">{messageCount} in this conversation</p></div>
            </div>
          ):(
            <div>
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-slate-100 text-slate-500">{channel?.type==='private'?<Lock size={22}/>:<Hash size={22}/>}</span>
                <div><h2 className="text-lg font-bold text-slate-900">{channel?.name}</h2><p className="text-xs text-slate-400">{channel?.type==='private'?'Private channel':'Public channel'}</p></div>
              </div>
              <div className="mt-4 rounded-lg border border-slate-200 p-3"><p className="text-xs font-semibold text-slate-400">Topic</p><p className="text-sm text-slate-700">{channel?.topic||'No topic set'}</p></div>
              <div className="mt-2 rounded-lg border border-slate-200 p-3"><p className="text-xs font-semibold text-slate-400">Members</p><p className="text-sm text-slate-700">{channel?.members?.length||0} member{(channel?.members?.length||0)===1?'':'s'}</p></div>
              <div className="mt-2 rounded-lg border border-slate-200 p-3"><p className="text-xs font-semibold text-slate-400">Messages</p><p className="text-sm text-slate-700">{messageCount} in this channel</p></div>
              {channel?.members?.length>0&&(
                <div className="mt-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Members</p>
                  <div className="space-y-1.5">
                    {channel.members.map(id=>{const u=accounts[id];if(!u)return null;return(
                      <div key={id} className="flex items-center gap-2.5"><Avatar user={u} size="h-7 w-7"/><span className="text-sm text-slate-700">{u.name}</span></div>
                    );})}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ── Summary modal ── */
function SummaryModal({summary,title,onClose}){
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm" onClick={onClose}/>
      <div className="fixed left-1/2 top-1/2 z-50 w-96 max-h-[80vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 className="flex items-center gap-2 font-bold text-slate-900"><FileText size={16} className="text-teal-600"/> Summary</h3>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100"><X size={16}/></button>
        </div>
        <div className="p-5">
          {summary.error?(
            <p className="text-sm text-slate-500">{summary.error}</p>
          ):(
            <>
              <p className="text-sm text-slate-500">Overview of <span className="font-semibold text-slate-700">{title}</span></p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-slate-50 p-3"><p className="text-2xl font-bold text-slate-800">{summary.total}</p><p className="text-xs text-slate-500">Messages</p></div>
                <div className="rounded-lg bg-slate-50 p-3"><p className="text-2xl font-bold text-slate-800">{summary.fileCount}</p><p className="text-xs text-slate-500">Files shared</p></div>
              </div>
              <div className="mt-3">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Participants</p>
                <div className="space-y-1">
                  {summary.participants.map(([name,count])=>(
                    <div key={name} className="flex items-center justify-between text-sm"><span className="text-slate-700">{name}</span><span className="text-slate-400">{count} msg{count===1?'':'s'}</span></div>
                  ))}
                </div>
              </div>
              <div className="mt-3">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Recent activity</p>
                <div className="space-y-1 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                  {summary.recent.map((line,i)=><p key={i} className="truncate">{line}</p>)}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

/* ── Call Modal — opens real Jitsi call in a new tab (no iframe limits) ── */
function CallModal({ kind, roomName, displayName, isVideo, onClose }){
  const room = roomName.replace(/[^a-zA-Z0-9-]/g,'');
  const [opened,setOpened]=useState(false);

  const buildUrl=()=>{
    const params=new URLSearchParams();
    if(displayName) params.set('userInfo.displayName', displayName);
    const cfg = isVideo ? '' : '#config.startWithVideoMuted=true';
    return `https://meet.jit.si/${room}${cfg}`;
  };

  const openCall=()=>{
    window.open(buildUrl(), '_blank', 'noopener,noreferrer');
    setOpened(true);
  };

  // auto-open once when the modal mounts
  useEffect(()=>{ openCall(); /* eslint-disable-next-line */ },[]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm">
      <div className="w-96 rounded-2xl bg-white p-6 shadow-2xl text-center">
        <div className={`mx-auto grid h-14 w-14 place-items-center rounded-full ${isVideo?'bg-teal-100 text-teal-600':'bg-indigo-100 text-indigo-600'}`}>
          {isVideo?<Video size={26}/>:<Phone size={26}/>}
        </div>
        <h3 className="mt-4 text-lg font-bold text-slate-900">{isVideo?'Video call':'Voice call'} started</h3>
        <p className="mt-1 text-sm text-slate-500">Your call opened in a new tab. Share this conversation so others can join the same room.</p>
        <div className="mt-4 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-600 break-all">
          Room: <span className="font-mono font-semibold">{room}</span>
        </div>
        <div className="mt-5 flex flex-col gap-2">
          <button onClick={openCall} className="flex items-center justify-center gap-2 rounded-lg bg-teal-600 py-2.5 text-sm font-semibold text-white hover:bg-teal-700">
            {isVideo?<Video size={15}/>:<Phone size={15}/>} {opened?'Reopen call tab':'Open call'}
          </button>
          <button onClick={onClose} className="rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   MAIN CHAT APP
══════════════════════════════════════════════════════════ */
export default function ChatApp({me:initMe,onLogout}){
  const socket=getSocket();
  const [me,setMe]=useState(initMe);
  const [accounts,setAccounts]=useState({});
  const [channels,setChannels]=useState([]);
  const [messages,setMessages]=useState([]);
  const [activeId,setActiveId]=useState(null);
  const [threadOpen,setThreadOpen]=useState(null);
  const [search,setSearch]=useState('');
  const [typing,setTyping]=useState({});
  const [callBanner,setCallBanner]=useState(null);
  const [incomingCall,setIncomingCall]=useState(null);
  const [loading,setLoading]=useState(true);
  const [showMenu,setShowMenu]=useState(false);
  const [starred,setStarred]=useState(()=>{try{return JSON.parse(localStorage.getItem('commhub_starred')||'[]');}catch{return[];}});
  const [muted,setMuted]=useState(()=>{try{return JSON.parse(localStorage.getItem('commhub_muted')||'[]');}catch{return[];}});
  const [hidden,setHidden]=useState(()=>{try{return JSON.parse(localStorage.getItem('commhub_hidden')||'[]');}catch{return[];}});
  const [showDetails,setShowDetails]=useState(false);
  const [summary,setSummary]=useState(null);
  const [showProfile,setShowProfile]=useState(false);
  const [showCreateChannel,setShowCreateChannel]=useState(false);
  const [addPeopleChannel,setAddPeopleChannel]=useState(null);
  const [editChannel,setEditChannel]=useState(null);
  const pendingPrivateRef=useRef(null);
  const [unread,setUnread]=useState({});
  const [activeDMUserId,setActiveDMUserId]=useState(null);
  const [attachments,setAttachments]=useState([]);
  const [forwardMsg,setForwardMsg]=useState(null);
  const scrollRef=useRef(null);
  const fileRef=useRef(null);

  useEffect(()=>{ injectStyles(); },[]);
  useEffect(()=>{ if('Notification' in window&&Notification.permission==='default') Notification.requestPermission(); },[]);

  const loadMessages=useCallback(async chId=>{
    const {data}=await api.get(`/api/messages/${chId}`);
    setMessages(data.messages||[]);
  },[]);

  useEffect(()=>{
    (async()=>{
      const [usersRes,chansRes]=await Promise.all([api.get('/api/users'),api.get('/api/channels')]);
      setAccounts(usersRes.data);
      const chs=chansRes.data; setChannels(chs);
      const first=chs.find(c=>c.name==='general')||chs[0];
      if(first){setActiveId(first.id);await loadMessages(first.id);}
      setLoading(false);
    })();
  },[]);

  useEffect(()=>{ if(activeId) loadMessages(activeId); },[activeId]);
  useEffect(()=>{ if(activeId) setUnread(p=>{const n={...p};delete n[activeId];return n;}); },[activeId]);
  useEffect(()=>{ if(scrollRef.current) scrollRef.current.scrollTop=scrollRef.current.scrollHeight; },[messages.length,activeId]);

  useEffect(()=>{
    if(!socket) return;
    const onMsgNew=msg=>{
      if(msg.channelId===activeId) setMessages(p=>[...p,msg]);
      else{
        setUnread(p=>({...p,[msg.channelId]:(p[msg.channelId]||0)+1}));
        if('Notification' in window&&Notification.permission==='granted'&&document.hidden){
          const sender=Object.values(accounts).find(u=>u.id===msg.senderId);
          const n=new Notification(sender?.name||'New message',{body:new DOMParser().parseFromString(msg.text,'text/html').body.textContent?.slice(0,80),icon:'/favicon.ico'});
          n.onclick=()=>{window.focus();setActiveId(msg.channelId);n.close();};
        }
      }
    };
    const onMsgEdited=({id,text,editedAt})=>setMessages(p=>p.map(m=>m.id===id?{...m,text,editedAt}:m));
    const onMsgDeleted=({id})=>setMessages(p=>p.map(m=>m.id===id?{...m,text:'[message deleted]',deleted:true}:m));
    const onThreadNew=({parentId,msg,threadCount})=>setMessages(p=>p.map(m=>m.id===parentId?{...m,threadCount,thread:[...(m.thread||[]),msg]}:m));
    const onReactUpdate=({messageId,reactions})=>setMessages(p=>p.map(m=>m.id===messageId?{...m,reactions}:m));
    const onChanNew=ch=>{
      setChannels(p=>p.find(c=>c.id===ch.id)?p.map(c=>c.id===ch.id?ch:c):[...p,ch]);
      if(pendingPrivateRef.current && ch.name===pendingPrivateRef.current){
        pendingPrivateRef.current=null;
        setActiveId(ch.id);
        setAddPeopleChannel(ch);
      }
    };
    const onPresence=({userId,presence})=>setAccounts(p=>({...p,[userId]:p[userId]?{...p[userId],presence}:p[userId]}));
    const onTypingStart=({userId,channelId})=>{if(channelId===activeId) setTyping(p=>({...p,[channelId]:new Set([...(p[channelId]||[]),userId])}));};
    const onTypingStop=({userId,channelId})=>{if(channelId===activeId) setTyping(p=>{const s=new Set(p[channelId]||[]);s.delete(userId);return{...p,[channelId]:s};});};
    const onCallStart=({channelId,kind,from})=>{
      if(from===me.name) return;
      setIncomingCall({channelId,kind,from});
      if('Notification' in window&&Notification.permission==='granted'){
        const n=new Notification(`Incoming ${kind} call`,{body:`${from} is calling`,icon:'/favicon.ico'});
        n.onclick=()=>{window.focus();n.close();};
      }
    };
    socket.on('message:new',onMsgNew); socket.on('message:edited',onMsgEdited);
    socket.on('message:deleted',onMsgDeleted); socket.on('thread:new',onThreadNew);
    socket.on('reaction:update',onReactUpdate); socket.on('channel:new',onChanNew);
    socket.on('user:presence',onPresence); socket.on('typing:start',onTypingStart);
    socket.on('typing:stop',onTypingStop);
    socket.on('call:start',onCallStart);
    const onChanLeft=({channelId})=>setChannels(p=>p.filter(c=>c.id!==channelId));
    socket.on('channel:left',onChanLeft);
    const onChanUpdated=(ch)=>setChannels(p=>p.map(c=>c.id===ch.id?ch:c));
    socket.on('channel:updated',onChanUpdated);
    return()=>{
      socket.off('message:new',onMsgNew); socket.off('message:edited',onMsgEdited);
      socket.off('message:deleted',onMsgDeleted); socket.off('thread:new',onThreadNew);
      socket.off('reaction:update',onReactUpdate); socket.off('channel:new',onChanNew);
      socket.off('user:presence',onPresence); socket.off('typing:start',onTypingStart);
      socket.off('typing:stop',onTypingStop);
      socket.off('call:start',onCallStart); socket.off('channel:left',onChanLeft); socket.off('channel:updated',onChanUpdated);
    };
  },[socket,activeId,accounts]);

  const sorted=useMemo(()=>[...messages].sort((a,b)=>parseT(a.t)-parseT(b.t)),[messages]);
  const activeChannel=channels.find(c=>c.id===activeId);
  const isDM=activeChannel?.type==='dm';
  const dmUserId=isDM?activeChannel?.members?.find(id=>id!==me.id):null;
  const dmUser=dmUserId?accounts[dmUserId]:null;
  const headerName=isDM?(dmUser?.name||'Direct message'):activeChannel?.name;

  const sendMsg=useCallback((html,parentId=null)=>{
    let clean=html.trim();
    if(attachments.length&&!parentId){
      const tags=attachments.filter(a=>a.fileId).map(a=>`[FILE:${a.fileId}:${a.name}:${a.size}]`).join('\n');
      clean=[clean,tags].filter(Boolean).join('\n');
    }
    if(!clean||!activeId) return;
    socket?.emit('message:send',{channelId:activeId,text:clean,parentId});
    socket?.emit('typing:stop',{channelId:activeId});
    setAttachments([]);
  },[activeId,attachments,socket]);

  const toggleReact=(msgId,emoji,parentId=null)=>{
    socket?.emit('reaction:toggle',{messageId:msgId,channelId:activeId,emoji});
    setMessages(p=>p.map(m=>{
      const apply=msg=>{
        const ex=msg.reactions.find(r=>r.emoji===emoji); let reactions;
        if(ex){const has=ex.users.includes(me.id);const users=has?ex.users.filter(u=>u!==me.id):[...ex.users,me.id];reactions=users.length?msg.reactions.map(r=>r.emoji===emoji?{...r,users}:r):msg.reactions.filter(r=>r.emoji!==emoji);}
        else reactions=[...msg.reactions,{emoji,users:[me.id]}];
        return{...msg,reactions};
      };
      if(parentId&&m.id===parentId) return{...m,thread:m.thread.map(tm=>tm.id===msgId?apply(tm):tm)};
      if(!parentId&&m.id===msgId) return apply(m);
      return m;
    }));
  };

  const editMsg=(id,text)=>socket?.emit('message:edit',{id,channelId:activeId,text});
  const deleteMsg=id=>socket?.emit('message:delete',{id,channelId:activeId});

  const forwardTo=async toChannelId=>{
    if(!forwardMsg) return;
    socket?.emit('channel:join',{channelId:toChannelId});
    socket?.emit('message:forward',{text:forwardMsg.text,toChannelId});
    setForwardMsg(null);
    await loadMessages(toChannelId);
    setActiveId(toChannelId);
    const targetChan=channels.find(c=>c.id===toChannelId);
    if(targetChan?.type==='dm'){const otherId=targetChan.members?.find(id=>id!==me.id);if(otherId)setActiveDMUserId(otherId);}
    else setActiveDMUserId(null);
  };

  const startCall=(kind)=>{
    setCallBanner({kind});
    // notify everyone else in this channel that a call started
    socket?.emit('call:start',{ channelId:activeId, kind, from:me.name });
  };

  const createChannel=()=>setShowCreateChannel(true);
  const submitChannel=({name,type,topic})=>{
    // remember if this was private so we prompt to add people once it's created
    const slug=name.trim().toLowerCase().replace(/\s+/g,'-');
    pendingPrivateRef.current = type==='private' ? slug : null;
    socket?.emit('channel:create',{name,type,topic,memberIds:[]});
    setShowCreateChannel(false);
  };
  const openDM=async userId=>{
    const {data}=await api.get(`/api/channels/dm/${userId}`);
    if(!channels.find(c=>c.id===data.id)) setChannels(p=>[...p,data]);
    socket?.emit('channel:join',{channelId:data.id});
    setActiveDMUserId(userId); setActiveId(data.id);
  };
  const uploadFiles=async(fileList)=>{
    const files=Array.from(fileList||[]); if(!files.length) return;
    for(const f of files){
      if(f.size>8*1024*1024){ alert(`"${f.name}" is ${(f.size/1048576).toFixed(1)}MB — max is 8MB`); continue; }
      setAttachments(p=>[...p,{name:f.name,size:f.size,type:f.type,uploading:true}]);
      try{
        const b64=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(',')[1]);r.onerror=rej;r.readAsDataURL(f);});
        const {data}=await api.post('/api/files',{name:f.name,mimeType:f.type,sizeBytes:f.size,data:b64});
        setAttachments(p=>p.map(a=>a.name===f.name&&a.uploading?{...a,fileId:data.fileId,uploading:false}:a));
      }catch(err){ setAttachments(p=>p.filter(a=>!(a.name===f.name&&a.uploading))); alert(`Upload failed for "${f.name}"`); }
    }
  };
  const onFileChange=async e=>{ await uploadFiles(e.target.files); e.target.value=''; };

  // ── Context menu actions ──
  const persist=(key,arr)=>{ try{localStorage.setItem(key,JSON.stringify(arr));}catch{} };
  const toggleStar=()=>{ setStarred(p=>{const n=p.includes(activeId)?p.filter(x=>x!==activeId):[...p,activeId];persist('commhub_starred',n);return n;}); };
  const toggleMute=()=>{ setMuted(p=>{const n=p.includes(activeId)?p.filter(x=>x!==activeId):[...p,activeId];persist('commhub_muted',n);return n;}); };
  const toggleHide=()=>{ setHidden(p=>{const n=p.includes(activeId)?p.filter(x=>x!==activeId):[...p,activeId];persist('commhub_hidden',n);return n;}); };

  const summarizeConversation=()=>{
    const msgs=[...messages].sort((a,b)=>parseT(a.t)-parseT(b.t));
    if(!msgs.length){ setSummary({error:'No messages to summarize yet.'}); return; }
    // Build a plain-text digest client-side (no external AI needed)
    const strip=t=>new DOMParser().parseFromString(t||'','text/html').body.textContent||'';
    const byUser={};
    let fileCount=0, firstT=msgs[0].t, lastT=msgs[msgs.length-1].t;
    msgs.forEach(m=>{
      if(m.text?.includes('[FILE:')) fileCount++;
      const name=accounts[m.senderId]?.name||'Someone';
      byUser[name]=(byUser[name]||0)+1;
    });
    const participants=Object.entries(byUser).sort((a,b)=>b[1]-a[1]);
    const recent=msgs.slice(-8).map(m=>{
      const name=accounts[m.senderId]?.name||'Someone';
      const txt=strip(m.text).slice(0,100);
      return `• ${name}: ${txt}${txt.length>=100?'…':''}`;
    });
    setSummary({
      total: msgs.length,
      participants,
      fileCount,
      span: `${fmtDay(firstT)} – ${fmtDay(lastT)}`,
      recent,
    });
  };

  const handleMenuAction=(action)=>{
    switch(action){
      case 'details':   setShowDetails(true); break;
      case 'profile':   setShowDetails(true); break;
      case 'star':      toggleStar(); break;
      case 'mute':      toggleMute(); break;
      case 'summarize': summarizeConversation(); break;
      case 'editsettings': setEditChannel(activeChannel); break;
      case 'newwindow': window.open(window.location.href,'_blank'); break;
      case 'copy:name': navigator.clipboard?.writeText(headerName||'').catch(()=>{}); break;
      case 'copy:link': navigator.clipboard?.writeText(`${window.location.origin}/?c=${activeId}`).catch(()=>{}); break;
      case 'leave':
        if(window.confirm(`Leave #${activeChannel?.name}?`)){
          socket?.emit('channel:leave',{channelId:activeId});
          setChannels(p=>p.filter(c=>c.id!==activeId));
          const other=channels.find(c=>c.id!==activeId&&c.type!=='dm');
          if(other) setActiveId(other.id);
        }
        break;
      case 'hide':      toggleHide(); if(!hidden.includes(activeId)){ const other=channels.find(c=>c.id!==activeId); if(other) setActiveId(other.id); } break;
      default: break;
    }
  };

  if(loading) return <div className="grid h-screen w-full place-items-center bg-white"><Loader2 className="animate-spin text-slate-400" size={24}/></div>;

  const myId=me.id;
  const teammates=Object.values(accounts).filter(u=>u.id!==myId);
  const typingUsers=[...(typing[activeId]||[])].filter(id=>id!==myId).map(id=>accounts[id]?.name).filter(Boolean);
  const threadParent=threadOpen?messages.find(m=>m.id===threadOpen):null;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-white text-slate-800 antialiased" style={{fontFamily:"ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif"}}>
      {/* Rail */}
      <nav className="flex w-16 shrink-0 flex-col items-center gap-3 bg-slate-900 py-4">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-teal-400 to-teal-600 font-bold text-white shadow-lg shadow-teal-900/40">CH</div>
        <div className="h-px w-8 bg-slate-700"/>
        <button className="grid h-10 w-10 place-items-center rounded-xl bg-slate-700 text-sm font-semibold text-white ring-2 ring-teal-400">WL</button>
        <button className="grid h-10 w-10 place-items-center rounded-xl bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white"><Plus size={18}/></button>
        <div className="mt-auto flex flex-col items-center gap-2">
          <button onClick={onLogout} title="Log out" className="grid h-9 w-9 place-items-center rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white"><LogOut size={16}/></button>
          <button onClick={()=>setShowProfile(true)} title="Edit profile"><Avatar user={me} size="h-9 w-9"/></button>
        </div>
      </nav>

      {/* Sidebar */}
      <aside className="flex w-64 shrink-0 flex-col bg-slate-800 text-slate-300">
        <div className="flex items-center justify-between border-b border-slate-700/60 px-4 py-3.5">
          <div className="min-w-0">
            <div className="flex items-center gap-1 font-bold text-white">My Workspace<ChevronDown size={15}/></div>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400"><span className="h-2 w-2 rounded-full bg-emerald-400"/><span className="truncate">{me.name}</span></div>
          </div>
          <button onClick={createChannel} className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-slate-700 text-white hover:bg-slate-600"><Plus size={16}/></button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-3">
          <p className="px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Channels</p>
          {channels.filter(c=>c.type!=='dm'&&!hidden.includes(c.id)).map(c=>{
            const cnt=unread[c.id]||0;
            return <button key={c.id} onClick={()=>{setActiveDMUserId(null);setActiveId(c.id);}}
              className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition ${activeId===c.id?'bg-teal-500/15 text-white':cnt?'font-semibold text-white hover:bg-slate-700/60':'text-slate-300 hover:bg-slate-700/60'}`}>
              <span className="grid h-[18px] w-[18px] place-items-center text-slate-400">{c.type==='private'?<Lock size={15}/>:<Hash size={15}/>}</span>
              <span className="flex-1 truncate text-left">{c.name}</span>
              {cnt>0&&<span className="grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white">{cnt}</span>}
            </button>;
          })}
          <button onClick={createChannel} className="mt-1 flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-slate-400 hover:bg-slate-700/60 hover:text-white">
            <span className="grid h-[18px] w-[18px] place-items-center"><Plus size={14}/></span> Add channel
          </button>
          <p className="mt-4 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Direct messages</p>
          {teammates.map(u=>{
            const dmChanId=channels.find(c=>c.type==='dm'&&c.members?.includes(u.id)&&c.members?.includes(myId))?.id;
            const cnt=dmChanId?(unread[dmChanId]||0):0;
            const active=activeDMUserId===u.id||(isDM&&dmUserId===u.id);
            return <button key={u.id} onClick={()=>openDM(u.id)}
              className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition ${active?'bg-teal-500/15 text-white':cnt?'font-semibold text-white hover:bg-slate-700/60':'text-slate-300 hover:bg-slate-700/60'}`}>
              <div className="relative shrink-0">
                {u.avatar_url?<img src={`${API_BASE}${u.avatar_url}`} alt={u.name} className="h-7 w-7 rounded-md object-cover"/>
                  :<div className={`h-7 w-7 ${u.color||'bg-slate-500'} grid place-items-center rounded-md text-[10px] font-bold text-white`}>{u.initials||'?'}</div>}
                <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-slate-800 ${PRESENCE[u.presence]?.color||'bg-slate-400'}`}/>
              </div>
              <span className="flex-1 truncate text-left">{u.name}</span>
              {cnt>0&&<span className="grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white">{cnt}</span>}
            </button>;
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
                {isDM&&dmUser&&<><span className={`h-2 w-2 rounded-full ${PRESENCE[dmUser.presence]?.color||'bg-slate-400'}`}/><span className="text-xs text-slate-400">{PRESENCE[dmUser.presence]?.label}</span></>}
              </div>
              <p className="truncate text-xs text-slate-400">{isDM?dmUser?.title||'Direct message':activeChannel?.topic||'No topic set'}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={()=>startCall('voice')} className="grid h-9 w-9 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-teal-600"><Phone size={17}/></button>
            <button onClick={()=>startCall('video')} className="grid h-9 w-9 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-teal-600"><Video size={17}/></button>
            <div className="relative ml-1">
              <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"/>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search" className="w-36 rounded-md border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-sm outline-none transition focus:w-48 focus:border-teal-400 focus:bg-white focus:ring-2 focus:ring-teal-100"/>
            </div>
            <button onClick={()=>setShowMenu(s=>!s)} className={`grid h-9 w-9 place-items-center rounded-md transition ${showMenu?'bg-slate-100 text-slate-800':'text-slate-500 hover:bg-slate-100'}`}><MoreHorizontal size={17}/></button>
            {showMenu&&<ContextMenu onClose={()=>setShowMenu(false)} isDM={isDM} targetName={headerName||''} starred={starred.includes(activeId)} muted={muted.includes(activeId)} hidden={hidden.includes(activeId)} onAction={handleMenuAction}/>}
          </div>
        </header>

        {callBanner&&(
          <CallModal kind={callBanner.kind} roomName={`CommHub-${activeId}`}
            displayName={me.name} isVideo={callBanner.kind==='video'}
            onClose={()=>setCallBanner(null)}/>
        )}
        {incomingCall&&!callBanner&&(
          <div className="flex items-center justify-between border-b border-teal-100 bg-teal-50 px-5 py-2.5 text-sm">
            <span className="flex items-center gap-2 font-medium text-teal-800">
              {incomingCall.kind==='video'?<Video size={16}/>:<Phone size={16}/>}
              <span className="font-bold">{incomingCall.from}</span> started a {incomingCall.kind} call
            </span>
            <div className="flex gap-2">
              <button onClick={()=>{setCallBanner({kind:incomingCall.kind});setActiveId(incomingCall.channelId);setIncomingCall(null);}}
                className="rounded-md bg-teal-600 px-3 py-1 text-xs font-semibold text-white hover:bg-teal-700">Join</button>
              <button onClick={()=>setIncomingCall(null)}
                className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">Dismiss</button>
            </div>
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
                <MsgRow accounts={accounts} myId={myId} msg={m} grouped={grouped}
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

        <RichComposer
          onSend={sendMsg}
          placeholder={isDM?`Message ${headerName}`:`Message #${activeChannel?.name}`}
          fileRef={fileRef} onFileChange={onFileChange} onDropFiles={uploadFiles}
          attachments={attachments} onRemoveAttachment={i=>setAttachments(p=>p.filter((_,j)=>j!==i))}
          onTypingStart={()=>socket?.emit('typing:start',{channelId:activeId})}
          onTypingStop={()=>socket?.emit('typing:stop',{channelId:activeId})}
        />
      </main>

      {threadParent&&(
        <ThreadPanel accounts={accounts} myId={myId} parent={threadParent}
          channelName={activeChannel?.name} onClose={()=>setThreadOpen(null)}
          onSend={t=>sendMsg(t,threadParent.id)} onReact={(mid,e)=>toggleReact(mid,e,threadParent.id)}
          onEdit={editMsg} onDelete={deleteMsg} onForward={m=>setForwardMsg(m)}/>
      )}
      {forwardMsg&&<ForwardModal channels={channels} accounts={accounts} me={me} onForward={forwardTo} onClose={()=>setForwardMsg(null)}/>}
      {showProfile&&<ProfilePanel user={me} onClose={()=>setShowProfile(false)} onSave={updated=>{setMe(updated);setAccounts(p=>({...p,[updated.id]:updated}));}}/>}
      {showDetails&&<DetailsPanel isDM={isDM} dmUser={dmUser} channel={activeChannel} accounts={accounts} messageCount={messages.length} onClose={()=>setShowDetails(false)}/>}
      {summary&&<SummaryModal summary={summary} title={headerName} onClose={()=>setSummary(null)}/>}
      {showCreateChannel&&<CreateChannelModal onCreate={submitChannel} onClose={()=>setShowCreateChannel(false)}/>}
      {addPeopleChannel&&<AddPeopleModal channel={addPeopleChannel} teammates={teammates}
        onAdd={(ids)=>{ socket?.emit('channel:addMembers',{channelId:addPeopleChannel.id,memberIds:ids}); setAddPeopleChannel(null); }}
        onClose={()=>setAddPeopleChannel(null)}/>}
      {editChannel&&<EditChannelModal channel={editChannel}
        onSave={({name,topic})=>{ socket?.emit('channel:update',{channelId:editChannel.id,name,topic}); setEditChannel(null); }}
        onClose={()=>setEditChannel(null)}/>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   RICH COMPOSER
══════════════════════════════════════════════════════════ */
function RichComposer({onSend,placeholder,fileRef,onFileChange,onDropFiles,attachments,onRemoveAttachment,onTypingStart,onTypingStop}){
  const editorRef=useRef(null);
  const [dragOver,setDragOver]=useState(false);
  const savedRangeRef=useRef(null);
  const [isEmpty,setIsEmpty]=useState(true);
  const [showEmoji,setShowEmoji]=useState(false);
  const [showLink,setShowLink]=useState(false);
  const [linkUrl,setLinkUrl]=useState('');
  const uploading=attachments.some(a=>a.uploading);

  // save current selection range before it gets lost to input focus
  const saveSelection=()=>{
    const sel=window.getSelection();
    if(sel&&sel.rangeCount>0){
      const range=sel.getRangeAt(0);
      // only save if selection is actually inside our editor
      if(editorRef.current&&editorRef.current.contains(range.commonAncestorContainer)){
        savedRangeRef.current=range.cloneRange();
      }
    }
  };
  const restoreSelection=()=>{
    if(savedRangeRef.current){
      const sel=window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedRangeRef.current);
    }
  };

  const exec=cmd=>{
    editorRef.current?.focus();
    document.execCommand(cmd,false,null);
    checkEmpty();
  };

  const checkEmpty=()=>{
    const text=editorRef.current?.textContent?.trim()||'';
    const html=editorRef.current?.innerHTML||'';
    setIsEmpty(!text&&html!=='<br>'&&!html.includes('<'));
  };

  const getHtml=()=>{
    const h=editorRef.current?.innerHTML||'';
    return (h==='<br>'||h==='<div><br></div>') ? '' : h;
  };

  const handleSend=()=>{
    const html=getHtml();
    if(!html&&!attachments.filter(a=>a.fileId).length) return;
    onSend(html||'');
    if(editorRef.current){ editorRef.current.innerHTML=''; setIsEmpty(true); }
    onTypingStop();
  };

  const handleKeyDown=e=>{
    if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); handleSend(); return; }
    onTypingStart();
    setTimeout(checkEmpty,0);
  };

  const handlePaste=e=>{
    e.preventDefault();
    const html=e.clipboardData.getData('text/html');
    const text=e.clipboardData.getData('text/plain');
    if(html){ document.execCommand('insertHTML',false,sanitize(html)); }
    else{ document.execCommand('insertText',false,text); }
    checkEmpty();
  };

  const insertLink=()=>{
    if(!linkUrl.trim()) return;
    const url=linkUrl.startsWith('http')?linkUrl:'https://'+linkUrl;
    editorRef.current?.focus();
    restoreSelection();
    const sel=window.getSelection();
    if(sel&&sel.rangeCount>0&&!sel.getRangeAt(0).collapsed){
      // text was selected — turn it into a link
      document.execCommand('createLink',false,url);
    } else {
      // no selection — insert the URL itself as a clickable link
      const a=document.createElement('a');
      a.href=url; a.textContent=url; a.target='_blank'; a.rel='noopener noreferrer';
      const range=savedRangeRef.current;
      if(range){
        range.deleteContents();
        range.insertNode(a);
        range.setStartAfter(a); range.collapse(true);
        sel.removeAllRanges(); sel.addRange(range);
      } else {
        document.execCommand('insertHTML',false,`<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
      }
    }
    checkEmpty();
    savedRangeRef.current=null;
    setShowLink(false); setLinkUrl('');
  };

  const insertInlineCode=()=>{
    const sel=window.getSelection();
    if(!sel||!sel.rangeCount) return;
    const range=sel.getRangeAt(0);
    const text=range.toString()||'code';
    const code=document.createElement('code');
    code.textContent=text;
    range.deleteContents(); range.insertNode(code);
    editorRef.current?.focus();
    checkEmpty();
  };

  const insertCodeBlock=()=>{
    const sel=window.getSelection();
    if(!sel||!sel.rangeCount) return;
    const range=sel.getRangeAt(0);
    const text=range.toString()||'// code here';
    const pre=document.createElement('pre');
    const code=document.createElement('code');
    code.textContent=text; pre.appendChild(code);
    range.deleteContents(); range.insertNode(pre);
    editorRef.current?.focus();
    checkEmpty();
  };

  const canSend=!isEmpty||attachments.filter(a=>a.fileId).length>0;

  return (
    <div className="px-3 pb-3 pt-1">
      <div
        onDragOver={e=>{e.preventDefault();setDragOver(true);}}
        onDragLeave={e=>{e.preventDefault();setDragOver(false);}}
        onDrop={e=>{e.preventDefault();setDragOver(false);onDropFiles(e.dataTransfer.files);}}
        className={`relative rounded-xl border transition focus-within:border-teal-400 focus-within:ring-2 focus-within:ring-teal-100 ${dragOver?'border-teal-400 border-dashed bg-teal-50/50':'border-slate-200'}`}>

        {dragOver&&(
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-teal-50/80">
            <span className="flex items-center gap-2 text-sm font-semibold text-teal-700"><Paperclip size={16}/> Drop files to attach</span>
          </div>
        )}

        {/* ── Toolbar ── */}
        <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-100 px-2 py-1.5">
          <TBtn icon={<Bold size={14}/>}        title="Bold (Ctrl+B)"        onClick={()=>exec('bold')}/>
          <TBtn icon={<Italic size={14}/>}      title="Italic (Ctrl+I)"      onClick={()=>exec('italic')}/>
          <TBtn icon={<Underline size={14}/>}   title="Underline (Ctrl+U)"   onClick={()=>exec('underline')}/>
          <TBtn icon={<Strikethrough size={14}/>} title="Strikethrough"      onClick={()=>exec('strikethrough')}/>
          <div className="mx-1 h-5 w-px bg-slate-200"/>
          <TBtn icon={<Link size={14}/>}        title="Insert link"          onClick={()=>{saveSelection();setShowLink(s=>!s);}}/>
          <TBtn icon={<ListOrdered size={14}/>} title="Numbered list"        onClick={()=>exec('insertOrderedList')}/>
          <TBtn icon={<List size={14}/>}        title="Bullet list"          onClick={()=>exec('insertUnorderedList')}/>
          <div className="mx-1 h-5 w-px bg-slate-200"/>
          <TBtn icon={<Quote size={14}/>}       title="Block quote"          onClick={()=>{ editorRef.current?.focus(); document.execCommand('formatBlock',false,'blockquote'); checkEmpty(); }}/>
          <TBtn icon={<Code size={14}/>}        title="Inline code"          onClick={insertInlineCode}/>
          <TBtn icon={<Terminal size={14}/>}    title="Code block"           onClick={insertCodeBlock}/>
        </div>

        {/* ── Link input ── */}
        {showLink&&(
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
            <input value={linkUrl} onChange={e=>setLinkUrl(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();insertLink();}if(e.key==='Escape')setShowLink(false);}}
              placeholder="https://example.com" autoFocus
              className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-teal-400"/>
            <button onClick={insertLink} className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700">Add link</button>
            <button onClick={()=>setShowLink(false)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50">Cancel</button>
          </div>
        )}

        {/* ── Attachments ── */}
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

        {/* ── Editor ── */}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          data-ph={placeholder}
          onInput={checkEmpty}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          className="rich-editor max-h-40 overflow-y-auto px-3 py-2.5 text-[15px] text-slate-800"
        />

        {/* ── Bottom bar ── */}
        <div className="relative flex items-center justify-between px-2 py-1.5">
          <div className="flex items-center gap-0.5">
            <FmtBtn icon={<Plus size={17}/>} onClick={()=>{}}/>
            <input ref={fileRef} type="file" multiple className="hidden" onChange={onFileChange}/>
            <FmtBtn icon={<Paperclip size={16}/>} onClick={()=>fileRef.current?.click()} title="Attach file"/>
            <FmtBtn icon={<Smile size={16}/>} onClick={()=>setShowEmoji(s=>!s)} title="Emoji"/>
            <FmtBtn icon={<AtSign size={16}/>} onClick={()=>{ editorRef.current?.focus(); document.execCommand('insertText',false,'@'); }} title="Mention"/>
          </div>
          <button onClick={handleSend} disabled={!canSend||uploading}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${canSend&&!uploading?'bg-teal-600 text-white hover:bg-teal-700':'bg-slate-100 text-slate-400'}`}>
            {uploading?<Loader2 size={14} className="animate-spin"/>:<Send size={14}/>}
            {uploading?'Uploading…':'Send'}
          </button>
          {showEmoji&&(
            <div className="absolute bottom-11 right-2 z-10 grid grid-cols-6 gap-0.5 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
              {EMOJIS.map(e=>(
                <button key={e} onClick={()=>{ editorRef.current?.focus(); document.execCommand('insertText',false,e); setShowEmoji(false); checkEmpty(); }}
                  className="grid h-8 w-8 place-items-center rounded-md text-lg hover:bg-slate-100">{e}</button>
              ))}
            </div>
          )}
        </div>
      </div>
      <p className="mt-1 flex items-center gap-1 px-1 text-[11px] text-slate-400"><CornerDownLeft size={11}/> Enter to send · Shift+Enter new line · Select text then click B / I / U</p>
    </div>
  );
}
function TBtn({icon,onClick,title}){
  return <button onMouseDown={e=>{e.preventDefault();onClick();}} title={title}
    className="grid h-7 w-7 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition text-[13px] font-semibold">{icon}</button>;
}
function FmtBtn({icon,onClick,title}){
  return <button onMouseDown={e=>{e.preventDefault();onClick?.();}} title={title}
    className="grid h-7 w-7 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700">{icon}</button>;
}

/* ══════════════════════════════════════════════════════════
   MESSAGE ROW
══════════════════════════════════════════════════════════ */
function MsgRow({accounts,myId,msg,grouped,onReact,onThread,canThread,inThread,onEdit,onDelete,onForward}){
  const u=accounts[msg.senderId]||{initials:'?',color:'bg-slate-400',name:'Unknown',presence:'offline'};
  const [hover,setHover]=useState(false);
  const [picker,setPicker]=useState(false);
  const [editing,setEditing]=useState(false);
  const [showMore,setShowMore]=useState(false);
  const [confirmDelete,setConfirmDelete]=useState(false);
  const editRef=useRef(null);
  const hideRef=useRef(null);
  const showMoreRef=useRef(false);
  const isDeleted=msg.deleted||msg.text==='[message deleted]';
  const isOwn=String(msg.senderId)===String(myId);

  useEffect(()=>{ showMoreRef.current=showMore; },[showMore]);

  // toolbar never auto-hides while the "more" dropdown is open —
  // prevents the dropdown vanishing before Edit/Delete click registers
  const onEnter=useCallback(()=>{ clearTimeout(hideRef.current); setHover(true); },[]);
  const onLeave=useCallback(()=>{
    hideRef.current=setTimeout(()=>{
      if(showMoreRef.current) return; // keep toolbar+dropdown alive
      setHover(false); setPicker(false);
    },200);
  },[]);

  const startEdit=()=>{
    setEditing(true);
    setTimeout(()=>{
      if(editRef.current){
        editRef.current.innerHTML=msg.text;
        editRef.current.focus();
        // place cursor at end
        const range=document.createRange(); range.selectNodeContents(editRef.current); range.collapse(false);
        const sel=window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
      }
    },50);
  };

  const submitEdit=()=>{
    const html=editRef.current?.innerHTML||'';
    const clean=(html==='<br>'||html==='<div><br></div>')?'':html;
    if(clean&&clean!==msg.text) onEdit(msg.id,clean);
    setEditing(false);
  };

  return (
    <div onMouseEnter={onEnter} onMouseLeave={onLeave}
      className={`group relative flex gap-3 px-3 ${grouped?'py-0.5':'mt-1 py-1.5'} hover:bg-slate-50`}>
      <div className="w-9 shrink-0">
        {!grouped?<Avatar user={u} showPresence={false}/>
          :<span className="block pt-1 text-center text-[10px] leading-4 text-transparent group-hover:text-slate-400">{fmtTime(msg.t)}</span>}
      </div>
      <div className="min-w-0 flex-1">
        {!grouped&&(
          <div className="flex items-baseline gap-2">
            <span className="font-semibold text-slate-900">{u.name}</span>
            <span className="text-xs text-slate-400">{fmtTime(msg.t)}</span>
            {msg.editedAt&&<span className="text-[11px] text-slate-400">(edited)</span>}
          </div>
        )}

        {editing?(
          <div className="mt-1">
            <div ref={editRef} contentEditable suppressContentEditableWarning
              onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();submitEdit();}if(e.key==='Escape')setEditing(false);}}
              className="rich-editor w-full rounded-lg border border-teal-400 bg-white px-3 py-2 text-[15px] ring-2 ring-teal-100 min-h-[36px]"/>
            <div className="mt-1.5 flex gap-2">
              <button onClick={submitEdit} className="flex items-center gap-1 rounded-md bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700"><Check size={12}/> Save</button>
              <button onClick={()=>setEditing(false)} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">Cancel</button>
            </div>
          </div>
        ):(
          <MessageContent text={msg.text}/>
        )}

        {!isDeleted&&msg.reactions?.length>0&&(
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {msg.reactions.map(r=>{const mine=r.users?.includes(myId);return(
              <button key={r.emoji} onClick={()=>onReact(r.emoji)}
                className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition ${mine?'border-teal-300 bg-teal-50 text-teal-700':'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                <span className="text-sm leading-none">{r.emoji}</span><span className="font-medium">{r.users?.length}</span>
              </button>);})}
          </div>
        )}

        {!inThread&&msg.threadCount>0&&(
          <button onClick={onThread} className="mt-1.5 flex items-center gap-2 rounded-md px-1.5 py-1 text-xs font-medium text-teal-600 hover:bg-white">
            <span className="flex -space-x-1">{[...new Set(msg.thread?.map(t=>t.senderId)||[])].slice(0,3).map(id=>{const tu=accounts[id]||{color:'bg-slate-400',initials:'?'};return<span key={id} className={`${tu.color} grid h-4 w-4 place-items-center rounded text-[8px] font-bold text-white ring-1 ring-white`}>{tu.initials}</span>;})}</span>
            {msg.threadCount} repl{msg.threadCount===1?'y':'ies'} <span className="text-slate-400">· last {fmtTime(msg.thread?.[msg.thread.length-1]?.t||msg.t)}</span>
          </button>
        )}

        {confirmDelete&&(
          <div className="mt-2 flex items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
            <span className="text-sm font-medium text-rose-700">Delete this message?</span>
            <button onClick={()=>{onDelete(msg.id);setConfirmDelete(false);}} className="ml-auto rounded-md bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-600">Delete</button>
            <button onClick={()=>setConfirmDelete(false)} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
          </div>
        )}
      </div>

      {hover&&!editing&&!isDeleted&&(
        <div onMouseEnter={onEnter} onMouseLeave={onLeave}
          className="absolute -top-4 right-3 flex items-center gap-0.5 rounded-xl border border-slate-200 bg-white p-1 shadow-md">
          <ToolBtn icon={<Smile size={16}/>}    title="Add reaction"    onClick={()=>setPicker(p=>!p)}/>
          {canThread&&!inThread&&<ToolBtn icon={<Reply size={16}/>} title="Reply in thread" onClick={onThread}/>}
          <ToolBtn icon={<Forward size={16}/>}  title="Forward"         onClick={onForward}/>
          <ToolBtn icon={<Bookmark size={16}/>} title="Save"            onClick={()=>{}}/>
          {isOwn&&(
            <div className="relative" onMouseEnter={onEnter}>
              <ToolBtn icon={<MoreHorizontal size={16}/>} title="More" onClick={()=>{onEnter();setShowMore(p=>!p);}}/>
              {showMore&&(
                <>
                  <div className="fixed inset-0 z-30" onMouseDown={()=>setShowMore(false)}/>
                  <div onMouseEnter={onEnter} className="absolute right-0 top-9 z-40 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                    <button onMouseDown={e=>{e.preventDefault();startEdit();setShowMore(false);}} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
                      <Pencil size={14} className="text-slate-400"/> Edit message
                    </button>
                    <button onMouseDown={e=>{e.preventDefault();setConfirmDelete(true);setShowMore(false);setHover(false);}} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-rose-600 hover:bg-rose-50">
                      <Trash2 size={14} className="text-rose-400"/> Delete message
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
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
function ToolBtn({icon,onClick,title}){return <button onMouseDown={e=>{e.preventDefault();onClick();}} title={title} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition">{icon}</button>;}

/* ══════════════════════════════════════════════════════════
   THREAD PANEL
══════════════════════════════════════════════════════════ */
function ThreadPanel({accounts,myId,parent,channelName,onClose,onSend,onReact,onEdit,onDelete,onForward}){
  const editorRef=useRef(null);
  const [isEmpty,setIsEmpty]=useState(true);
  const ref=useRef(null);

  useEffect(()=>{if(ref.current)ref.current.scrollTop=ref.current.scrollHeight;},[parent.thread?.length]);

  const checkEmpty=()=>{
    const text=editorRef.current?.textContent?.trim()||'';
    setIsEmpty(!text);
  };
  const handleSend=()=>{
    const html=editorRef.current?.innerHTML||'';
    if(!html||html==='<br>') return;
    onSend(html);
    editorRef.current.innerHTML=''; setIsEmpty(true);
  };

  return (
    <section className="flex w-96 shrink-0 flex-col border-l border-slate-200 bg-white">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div><h3 className="font-bold text-slate-900">Thread</h3><p className="text-xs text-slate-400">#{channelName}</p></div>
        <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100"><X size={18}/></button>
      </header>
      <div ref={ref} className="flex-1 overflow-y-auto py-2">
        <MsgRow accounts={accounts} myId={myId} msg={parent} grouped={false}
          onReact={e=>onReact(parent.id,e)} canThread={false} inThread
          onEdit={onEdit} onDelete={onDelete} onForward={()=>onForward(parent)}/>
        <div className="my-2 flex items-center gap-3 px-4"><div className="h-px flex-1 bg-slate-100"/><span className="text-xs font-medium text-slate-400">{parent.thread?.length||0} repl{(parent.thread?.length||0)===1?'y':'ies'}</span><div className="h-px flex-1 bg-slate-100"/></div>
        {(parent.thread||[]).map((tm,i)=>{
          const prev=(parent.thread||[])[i-1];
          const grouped=prev&&prev.senderId===tm.senderId&&parseT(tm.t)-parseT(prev.t)<5*60000;
          return <MsgRow key={tm.id} accounts={accounts} myId={myId} msg={tm} grouped={grouped}
            onReact={e=>onReact(tm.id,e)} canThread={false} inThread
            onEdit={onEdit} onDelete={onDelete} onForward={()=>onForward(tm)}/>;
        })}
      </div>
      <div className="px-3 pb-3 pt-1">
        <div className="rounded-xl border border-slate-200 focus-within:border-teal-400 focus-within:ring-2 focus-within:ring-teal-100">
          <div ref={editorRef} contentEditable suppressContentEditableWarning data-ph="Reply…"
            onInput={checkEmpty}
            onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();handleSend();}}}
            className="rich-editor max-h-28 overflow-y-auto px-3 py-2.5 text-[15px] text-slate-800"/>
          <div className="flex justify-end px-2 py-1.5">
            <button onClick={handleSend} disabled={isEmpty}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold ${!isEmpty?'bg-teal-600 text-white hover:bg-teal-700':'bg-slate-100 text-slate-400'}`}>
              <Send size={14}/> Reply
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
