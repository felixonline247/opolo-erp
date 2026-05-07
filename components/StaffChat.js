import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function StaffChat({ currentUser }) {
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [isNew, setIsNew] = useState(false) // For visual notification pulse
  const scrollRef = useRef()
  const audioRef = useRef(null)

  // Standard notification sound URL
  const NOTIFICATION_SOUND = "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3"

  useEffect(() => {
    fetchMessages()

    // Initialize Audio
    audioRef.current = new Audio(NOTIFICATION_SOUND)

    const channel = supabase
      .channel('staff_room')
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'staff_messages' 
      }, async (payload) => {
        // Trigger Sound and Visuals if message is from someone else
        if (payload.new.sender_id !== currentUser.id) {
          playNotification()
        }
        fetchMessages() 
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentUser.id])

  // Auto-scroll to bottom
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const playNotification = () => {
    // 1. Play Sound
    audioRef.current?.play().catch(e => console.log("Audio play blocked by browser interact policy"))
    
    // 2. Visual Pulse
    setIsNew(true)
    setTimeout(() => setIsNew(false), 3000)

    // 3. Browser Tab Notification
    const originalTitle = document.title
    document.title = "🔔 New Staff Message!"
    setTimeout(() => { document.title = originalTitle }, 4000)
  }

  const fetchMessages = async () => {
    const { data } = await supabase
      .from('staff_messages')
      .select(`
        id, content, created_at, sender_id,
        profiles(full_name, role)
      `)
      .order('created_at', { ascending: true })
      .limit(50)
    
    if (data) setMessages(data)
  }

  const sendMessage = async (e) => {
    e.preventDefault()
    if (!newMessage.trim()) return

    const { error } = await supabase
      .from('staff_messages')
      .insert({ 
        content: newMessage, 
        sender_id: currentUser.id 
      })

    if (!error) setNewMessage('')
  }

  return (
    <div className={`bg-white flex flex-col h-full overflow-hidden transition-all duration-500 ${isNew ? 'bg-blue-50/30' : 'bg-white'}`}>
      
      {/* Header */}
      <div className="p-6 border-b bg-white flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-900 rounded-2xl flex items-center justify-center text-white">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zm-4 0H9v2h2V9z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <h3 className="text-xs font-black text-blue-950 uppercase tracking-widest">Command Chat</h3>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Real-time Staff Coordination</p>
          </div>
        </div>
        
        {isNew && (
          <span className="flex items-center gap-2 bg-blue-50 text-blue-600 px-4 py-1.5 rounded-full text-[9px] font-black uppercase animate-bounce">
            New Message
          </span>
        )}
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-8 space-y-6 bg-slate-50/50">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col ${msg.sender_id === currentUser.id ? 'items-end' : 'items-start'}`}>
            <div className="flex items-center gap-2 mb-1 px-1">
               <span className={`text-[9px] font-black uppercase ${msg.sender_id === currentUser.id ? 'text-blue-900' : 'text-slate-400'}`}>
                {msg.profiles?.full_name}
              </span>
              <span className="text-[8px] font-bold text-slate-300 bg-slate-100 px-2 py-0.5 rounded text-[7px] uppercase">
                {msg.profiles?.role}
              </span>
            </div>
            
            <div className={`max-w-[85%] p-4 rounded-[1.8rem] text-sm font-medium shadow-sm transition-all ${
              msg.sender_id === currentUser.id 
                ? 'bg-blue-950 text-white rounded-tr-none' 
                : 'bg-white text-blue-950 border border-slate-200 rounded-tl-none'
            }`}>
              {msg.content}
            </div>
            
            <span className="text-[7px] font-bold text-slate-300 uppercase mt-1 px-2">
              {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))}
        <div ref={scrollRef} />
      </div>

      {/* Input Area */}
      <form onSubmit={sendMessage} className="p-6 bg-white border-t flex gap-3">
        <input 
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Broadcast a message to staff..."
          className="flex-1 bg-slate-100 border-none rounded-2xl px-5 py-4 text-sm font-bold text-blue-950 outline-none ring-2 ring-transparent focus:ring-blue-900 transition-all placeholder:text-slate-400"
        />
        <button type="submit" className="bg-blue-900 text-white px-8 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-blue-800 hover:shadow-lg active:scale-95 transition-all">
          Send
        </button>
      </form>
    </div>
  )
}