import { useState, useEffect } from 'react';
import { Mail, MapPin, Trash2, Building2, UserPlus } from 'lucide-react';
import { useTheme } from '../App';
import { supabase } from './supabaseClient';
import { toast } from 'sonner';
import { BlurredVideoLoader } from './ui/blurred-video-loader';
import { AddAdminModal } from './AddAdminModal';
import { clearBrowserCache, SUPER_ADMIN_CACHE_PREFIX } from '../utils/browserCache';

interface AdminListProps {
  /**
   * Called after an admin is added or removed so the super admin dashboard can
   * refresh its "Total Admins" counter.
   */
  onAdminsChanged?: () => void;
}

export function AdminList({ onAdminsChanged }: AdminListProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [admins, setAdmins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const fetchAdmins = async () => {
    setLoading(true);
    try {
      // Bounded so the list loader can never spin forever when the query
      // stalls (the same class of hang that used to freeze the Add Admin modal).
      const { data, error } = await Promise.race([
        supabase.from('admins').select('*'),
        new Promise<never>((_, reject) =>
          window.setTimeout(() => reject(new Error('Timed out while loading admins')), 15_000),
        ),
      ]);

      if (error) {
        toast.error(`Could not load admins: ${error.message}`);
      } else if (data) {
        setAdmins(data);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Could not load admins');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAdmins(); }, []);

  // The dashboard caches its overview snapshot, so clear it and tell the parent
  // to recompute the admin count whenever the list changes.
  const notifyAdminsChanged = () => {
    clearBrowserCache([SUPER_ADMIN_CACHE_PREFIX]);
    onAdminsChanged?.();
  };

  const handleAdminCreated = () => {
    void fetchAdmins();
    notifyAdminsChanged();
  };

  const handleDelete = async (id: string) => {
      if(!window.confirm("Are you sure? This removes admin access.")) return;
      const { error } = await supabase.from('admins').delete().eq('a_id', id);
      if(!error) {
          toast.success("Admin removed");
          void fetchAdmins();
          notifyAdminsChanged();
      } else {
          toast.error("Error removing admin");
      }
  };

  return (
    <div className={`flex flex-col p-4 ${isDark ? 'bg-slate-900' : 'bg-slate-50'}`}>
      <div className="flex justify-between items-center gap-3 mb-6">
        <h2 className={`text-xl font-bold ${isDark ? 'text-rose-300' : 'text-rose-900'}`}>System Admins ({admins.length})</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors shadow-sm ${
              isDark ? 'bg-purple-600 text-white hover:bg-purple-500' : 'bg-purple-700 text-white hover:bg-purple-800'
            }`}
          >
            <UserPlus size={16} />
            Add Admin
          </button>
        </div>
      </div>

      {loading ? (
        <BlurredVideoLoader
          label="Loading admins..."
          containerClassName="flex-1 flex min-h-[320px] items-center justify-center rounded-xl"
          cardClassName="flex flex-col items-center gap-3"
          textClassName={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}
        />
      ) : (
      <div className="space-y-3 pb-6">
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
              {(admin.location || admin.station || admin.district) && (
                <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                  <MapPin size={12} /> {admin.location || admin.station}
                  {!admin.location && admin.station && admin.district ? ' • ' : ''}
                  {!admin.location && admin.district}
                </div>
              )}
            </div>

            <button onClick={() => handleDelete(admin.a_id)} className="text-red-500 hover:bg-red-50 p-2 rounded-full transition-colors">
               <Trash2 size={18} />
            </button>
          </div>
        ))}
      </div>
      )}

      <AddAdminModal
        open={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onCreated={handleAdminCreated}
      />
    </div>
  );
}
