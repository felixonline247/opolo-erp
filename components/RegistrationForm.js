import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { logActivity } from '../lib/logger';

export default function RegistrationForm({ services, onSelect }) {
  const [loading, setLoading] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [isExistingStudent, setIsExistingStudent] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  
  const [formData, setFormData] = useState({ 
    name: '', 
    phone: '', 
    jambCode: '', 
    regNumber: '',
    service_id: '' 
  });

  const handleSearch = async (query) => {
    setFormData({ ...formData, name: query });
    if (query.length < 3) {
      setSearchResults([]);
      setIsExistingStudent(false);
      return;
    }

    const { data, error } = await supabase
      .from('students')
      .select('id, full_name, phone_number, jamb_profile_code, reg_number')
      .or(`full_name.ilike.%${query}%,phone_number.ilike.%${query}%`)
      .limit(5);

    if (!error) setSearchResults(data);
  };

  const selectStudent = (student) => {
    setFormData({
      name: student.full_name,
      phone: student.phone_number,
      jambCode: student.jamb_profile_code || '',
      regNumber: student.reg_number || '',
      service_id: formData.service_id 
    });
    setSelectedStudentId(student.id);
    setIsExistingStudent(true);
    setSearchResults([]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.service_id) return alert("Please select a service.");
    setLoading(true);

    try {
      const selectedService = services.find(s => String(s.id) === String(formData.service_id));
      const totalCost = Number(selectedService?.price || 0); 
      const instCost = Number(selectedService?.institution_cost || 0);

      // PAYLOAD: We remove 'id' entirely because we want a NEW row every time
      const studentPayload = {
        full_name: formData.name, 
        phone_number: formData.phone, 
        jamb_profile_code: formData.jambCode,
        reg_number: formData.regNumber,
        service_id: formData.service_id,
        status: 'Awaiting Payment', // Changed from Pending to match Dashboard filter
        amount_paid: totalCost,
        institution_cost: instCost,
        is_deleted: false,
        created_at: new Date()
      };

      // USE .insert() instead of .upsert()
      const { data: studentRecord, error: studentError } = await supabase
        .from('students')
        .insert([studentPayload])
        .select()
        .single();
      
      if (studentError) throw studentError;
      
      await logActivity("Registration", `New Service Request: ${formData.name} for ${selectedService?.service_name}`);
      alert("Success! Request sent to Account Office.");
      
      // Reset Form
      setFormData({ name: '', phone: '', jambCode: '', regNumber: '', service_id: '' });
      setIsExistingStudent(false);
      setSelectedStudentId(null);
      if (onSelect) onSelect(); // Refresh dashboard list

    } catch (error) {
      console.error("Submission Error:", error);
      alert("Error: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 rounded-3xl shadow-xl border border-slate-100 w-full">
      <h2 className="text-xl font-black text-blue-900 mb-6 border-b pb-2 tracking-tight uppercase">Stage 1: Intake</h2>
      
      <div className="space-y-4">
        <div>
          <label className="block text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1 ml-1">Required Service</label>
          <select
            required
            className="w-full px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold text-blue-900"
            value={formData.service_id}
            onChange={(e) => setFormData({...formData, service_id: e.target.value})}
          >
            <option value="">-- Choose Service --</option>
            {services?.map(svc => (
              <option key={svc.id} value={svc.id}>{svc.service_name} (₦{svc.price?.toLocaleString()})</option>
            ))}
          </select>
        </div>

        <div className="relative">
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Full Name (Search Existing)</label>
          <input 
            type="text" required
            className={`mt-1 block w-full border rounded-xl p-2.5 text-sm outline-none ${isExistingStudent ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-gray-200'}`}
            value={formData.name}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Type name or phone to search..."
          />
          {searchResults.length > 0 && (
            <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-xl mt-1 shadow-2xl overflow-hidden">
              {searchResults.map(s => (
                <div 
                  key={s.id} 
                  onClick={() => selectStudent(s)}
                  className="p-3 hover:bg-blue-50 cursor-pointer border-b last:border-0 text-sm"
                >
                  <p className="font-bold text-blue-900">{s.full_name}</p>
                  <p className="text-xs text-gray-500">{s.phone_number} | {s.jamb_profile_code}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Phone Number</label>
          <input 
            type="text" required
            className="mt-1 block w-full border border-gray-200 bg-slate-50 rounded-xl p-2.5 text-sm outline-none"
            value={formData.phone}
            onChange={(e) => setFormData({...formData, phone: e.target.value})}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Profile Code</label>
            <input 
              type="text"
              className="mt-1 block w-full border border-gray-200 bg-slate-50 rounded-xl p-2.5 text-sm outline-none"
              value={formData.jambCode}
              onChange={(e) => setFormData({...formData, jambCode: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Reg Number</label>
            <input 
              type="text"
              className="mt-1 block w-full border border-gray-200 bg-slate-50 rounded-xl p-2.5 text-sm outline-none"
              value={formData.regNumber}
              onChange={(e) => setFormData({...formData, regNumber: e.target.value})}
            />
          </div>
        </div>

        <button 
          type="submit" disabled={loading}
          className={`w-full py-4 px-4 rounded-xl text-white font-black transition-all shadow-lg uppercase tracking-tighter ${loading ? 'bg-gray-400' : 'bg-blue-900 hover:bg-black'}`}
        >
          {loading ? "Processing..." : "Send to Account Office"}
        </button>
      </div>
    </form>
  );
}