import { useState, useEffect } from 'react';
import { Mail, MapPin, Trash2, Building2, Loader2 } from 'lucide-react';
import { useTheme } from '../App';
import { supabase } from './supabaseClient';
import { toast } from 'sonner';

export function AdminList() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [admins, setAdmins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAdmins = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('admins').select('*');
    if (!error && data) setAdmins(data);
    setLoading(false);
  };

  useEffect(() => { fetchAdmins(); }, []);

  const handleDelete = async (id: string) => {
      if(!window.confirm("Are you sure? This removes admin access.")) return;
      const { error } = await supabase.from('admins').delete().eq('a_id', id);
      if(!error) {
          toast.success("Admin removed");
          fetchAdmins();
      } else {
          toast.error("Error removing admin");
      }
  };

  return (
    <div className={`h-full flex flex-col p-4 ${isDark ? 'bg-slate-900' : 'bg-slate-50'}`}>
      <div className="flex justify-between items-center mb-6">
        <h2 className={`text-xl font-bold ${isDark ? 'text-rose-300' : 'text-rose-900'}`}>System Admins</h2>
        <span className="bg-rose-100 text-rose-800 text-xs font-bold px-2 py-1 rounded-full">{admins.length} Total</span>
      </div>

      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center min-h-[320px]">
          <Loader2
            size={48}
            className={isDark ? 'text-rose-400' : 'text-rose-600'}
            style={{ animation: 'spin 1s linear infinite' }}
          />
          <p className={`mt-4 text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Loading admins...</p>
        </div>
      ) : (
      <div className="flex-1 overflow-y-auto space-y-3 pb-20">
        {admins.map((admin) => (
          <div key={admin.a_id} className={`p-4 rounded-xl border flex items-center gap-4 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100 shadow-md'}`}>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${
              isDark ? 'bg-rose-900 text-rose-200' : 'bg-rose-100 text-rose-700'
            }`}>
              {admin.a_name?.charAt(0).toUpperCase()}
            </div>
            
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className={`font-bold text-sm ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>{admin.a_name}</h3>
                <span className={`px-2.5 py-1 rounded-md text-[11px] uppercase font-bold ${
                  isDark ? 'bg-slate-700 text-indigo-200' : 'bg-blue-100 text-blue-800'
                }`}>
                  {admin.department_name || 'Department not assigned'}
                </span>
              </div>
              <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                <Mail size={12} /> {admin.a_email}
              </div>
              <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                <MapPin size={12} /> {admin.station} • {admin.district}
              </div>
            </div>

            <button onClick={() => handleDelete(admin.a_id)} className="text-red-500 hover:bg-red-50 p-2 rounded-full transition-colors">
               <Trash2 size={18} />
            </button>
          </div>
        ))}
      </div>
      )}
    </div>
  );
}
