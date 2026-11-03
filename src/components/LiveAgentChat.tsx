import React, {useEffect, useState} from 'react';

type Message = {id:string; at:string; channel:string; sender:string; type:string; text?:string; taskId?:string; status?:string; exitCode?:number};
const channels = ['Wszyscy','Aria','Alex','Astyria','Aurelius'];

export default function LiveAgentChat({base='/api/live-chat'}:{base?:string}) {
  const [channel,setChannel] = useState('Wszyscy');
  const [messages,setMessages] = useState<Message[]>([]);
  const [draft,setDraft] = useState('');
  const [status,setStatus] = useState('Łączenie');
  const [error,setError] = useState('');
  const [sending,setSending] = useState(false);

  useEffect(()=>{
    let alive=true;
    setMessages([]);
    fetch(base+'/history?channel='+encodeURIComponent(channel),{credentials:'same-origin'})
      .then(r=>{if(!r.ok) throw new Error('Historia: HTTP '+r.status); return r.json();})
      .then(data=>{if(alive && Array.isArray(data)) setMessages(data);})
      .catch(e=>{if(alive) setError(String(e));});
    const events=new EventSource(base+'/events',{withCredentials:true});
    events.onopen=()=>{if(alive) setStatus('Połączono');};
    events.onerror=()=>{if(alive) setStatus('Rozłączono');};
    events.onmessage=(event)=>{
      try {
        const item=JSON.parse(event.data) as Message;
        if(alive && item.channel===channel) setMessages(old=>old.some(m=>m.id===item.id)?old:[...old,item].slice(-500));
      } catch { /* malformed event ignored */ }
    };
    return ()=>{alive=false;events.close();};
  },[base,channel]);

  async function send(event:React.FormEvent) {
    event.preventDefault();
    if(!draft.trim()||sending) return;
    setSending(true);setError('');
    try {
      const response=await fetch(base+'/messages',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({channel,text:draft.trim()})});
      if(!response.ok) throw new Error('Wysyłanie: HTTP '+response.status);
      setDraft('');
    } catch(e) {setError(String(e));}
    finally {setSending(false);}
  }

  return <section aria-label="Czat agentów" style={{display:'flex',flexDirection:'column',height:'80dvh',minHeight:360,background:'#0f172a',color:'#f8fafc',borderRadius:12,overflow:'hidden'}}>
    <header style={{padding:12,display:'flex',justifyContent:'space-between',borderBottom:'1px solid #334155'}}>
      <strong>Bastilla · AI Chat</strong><span role="status">{status}</span>
    </header>
    <nav aria-label="Kanały" style={{display:'flex',gap:6,overflowX:'auto',padding:8}}>
      {channels.map(name=><button key={name} type="button" aria-pressed={channel===name} onClick={()=>setChannel(name)} style={{padding:9,background:channel===name?'#2563eb':'#334155',color:'white',border:0,borderRadius:7}}>{name}</button>)}
    </nav>
    <div role="log" aria-live="polite" style={{flex:1,overflowY:'auto',padding:12}}>
      {messages.length===0&&<p>Brak wiadomości. Połączenie z agentami wymaga konfiguracji.</p>}
      {messages.map(item=><article key={item.id} style={{background:'#1e293b',padding:12,marginBottom:8,borderRadius:8}}>
        <strong>{item.sender}</strong> <small>{new Date(item.at).toLocaleTimeString('pl-PL')}</small>
        {item.type==='terminal'?<div><small>Terminal {item.taskId||''} {item.status||''} {item.exitCode===undefined?'':'exit '+item.exitCode}</small><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{item.text}</pre></div>:<p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{item.text||item.type}</p>}
      </article>)}
    </div>
    {error&&<p role="alert" style={{padding:8,color:'#fca5a5'}}>{error}</p>}
    <form onSubmit={send} style={{display:'flex',padding:12,gap:8,borderTop:'1px solid #334155'}}>
      <input aria-label="Wiadomość" value={draft} maxLength={8000} onChange={e=>setDraft(e.target.value)} placeholder={'Napisz do '+channel} style={{flex:1,minWidth:0,padding:12,background:'#334155',color:'white',border:0,borderRadius:8}}/>
      <button disabled={sending||!draft.trim()} style={{background:'#2563eb',color:'white',padding:12,border:0,borderRadius:8}}>Wyślij</button>
    </form>
  </section>;
}
