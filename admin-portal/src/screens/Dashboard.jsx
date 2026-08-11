import { useState, useEffect } from 'react';
import { LayoutDashboard, CheckCircle, XCircle, LogOut, ChevronRight } from 'lucide-react';
import api from '../lib/api';

export default function Dashboard() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeSport, setActiveSport] = useState(null);
  const [selectedSub, setSelectedSub] = useState(null); // For the modal
  const [extracting, setExtracting] = useState(false);
  const [editableData, setEditableData] = useState({});
  const [fullscreenImage, setFullscreenImage] = useState(null);

  const [error, setError] = useState(null);

  const fetchData = async () => {
    try {
      const res = await api.get('/admin/historical-stats');
      setData(res.data.data);
      if (res.data.data.length > 0 && !activeSport) {
        setActiveSport(res.data.data[0].sport);
      }
      setLoading(false);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || err.message || 'An error occurred fetching data');
      setLoading(false);
      if (err.response?.status === 401 || err.response?.status === 403) {
        localStorage.removeItem('token');
        window.location.href = '/login';
      }
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    window.location.href = '/login';
  };

  const handleApprove = async (id) => {
    try {
      await api.post(`/admin/historical-stats/${id}/approve`, {
        editedData: editableData
      });
      setSelectedSub(null);
      fetchData(); // refresh list
    } catch (err) {
      alert('Error approving');
    }
  };

  const handleExtract = async (id) => {
    setExtracting(true);
    try {
      const res = await api.post(`/admin/historical-stats/${id}/extract`);
      if (res.data.extractedData) {
        setEditableData(res.data.extractedData);
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to extract data via AI');
    } finally {
      setExtracting(false);
    }
  };

  const handleDataChange = (key, val) => {
    setEditableData(prev => ({
      ...prev,
      [key]: val
    }));
  };

  const handleReject = async (id) => {
    const reason = window.prompt('Why are you rejecting this upload? (Optional)');
    if (reason === null) return; // User cancelled

    try {
      await api.post(`/admin/historical-stats/${id}/reject`, {
        adminNote: reason
      });
      setSelectedSub(null);
      fetchData(); // refresh list
    } catch (err) {
      alert('Error rejecting');
    }
  };

  const activeGroup = data.find(g => g.sport === activeSport) || { submissions: [] };

  if (loading) return <div className="p-8 text-center text-gray-500 font-medium">Loading Admin Portal...</div>;

  if (error) return (
    <div className="p-8 text-center">
      <div className="bg-red-50 text-red-600 p-4 rounded-lg inline-block font-medium">
        {error}
      </div>
      <button onClick={handleLogout} className="block mx-auto mt-4 text-sm text-gray-500 hover:text-gray-800">
        Return to Login
      </button>
    </div>
  );

  return (
    <div className="flex h-screen bg-surfaceHigh font-sans">
      
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-100 flex items-center gap-3">
          <div className="w-8 h-8 bg-cricket rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">LL</span>
          </div>
          <h1 className="font-bold text-gray-900">Admin Portal</h1>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 px-2">Pending Approvals</div>
          
          {data.length === 0 && (
            <div className="px-2 text-sm text-gray-500">No pending requests</div>
          )}

          {data.map(group => (
            <button
              key={group.sport}
              onClick={() => setActiveSport(group.sport)}
              className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors ${
                activeSport === group.sport ? 'bg-cricket text-white' : 'hover:bg-gray-50 text-gray-700'
              }`}
            >
              <div className="flex items-center gap-3 capitalize font-medium">
                <LayoutDashboard size={18} opacity={0.8} />
                {group.sport}
              </div>
              <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                activeSport === group.sport ? 'bg-white/20 text-white' : 'bg-red-100 text-red-600'
              }`}>
                {group.count}
              </span>
            </button>
          ))}
        </div>

        <div className="p-4 border-t border-gray-200">
          <button onClick={handleLogout} className="flex items-center gap-2 text-gray-500 hover:text-red-500 transition-colors w-full p-2">
            <LogOut size={18} />
            <span className="font-medium">Sign Out</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <header className="bg-white border-b border-gray-200 p-6 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-800 capitalize">
            {activeSport ? `${activeSport} Approvals` : 'Dashboard'}
          </h2>
        </header>

        <main className="flex-1 overflow-y-auto p-8">
          {activeGroup.submissions.length === 0 ? (
            <div className="text-center text-gray-500 mt-20">
              No pending submissions for this sport.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {activeGroup.submissions.map(sub => (
                <div key={sub.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 bg-gray-100 rounded-full overflow-hidden">
                        <div className="w-full h-full flex items-center justify-center text-gray-400 font-bold text-xl uppercase">
                          {sub.player.name.charAt(0)}
                        </div>
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900">{sub.player.name}</h3>
                      <p className="text-sm text-gray-500">Submitted {new Date(sub.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  
                  <div className="bg-gray-50 rounded-lg p-3 mb-4 flex items-center justify-center gap-2">
                    <CheckCircle size={16} className="text-gray-400" />
                    <span className="text-sm font-medium text-gray-500">Ready for AI Extraction</span>
                  </div>

                  <button 
                    onClick={() => {
                      setSelectedSub(sub);
                      setEditableData(sub.data || {});
                    }}
                    className="w-full flex items-center justify-center gap-2 bg-gray-900 hover:bg-black text-white py-2 rounded-lg font-medium transition-colors"
                  >
                    Review Request
                    <ChevronRight size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Review Modal */}
      {selectedSub && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">Review {selectedSub.player.name}'s Stats</h2>
              <button onClick={() => setSelectedSub(null)} className="text-gray-400 hover:text-gray-600">
                <XCircle size={28} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 flex gap-8">
              {/* Evidence/Source Images */}
              <div className="flex-1 space-y-4">
                <h3 className="font-bold text-gray-700 uppercase text-xs tracking-wider">Source Evidence</h3>
                {selectedSub.imageUrls && selectedSub.imageUrls.length > 0 ? (
                  <div className="grid grid-cols-1 gap-4">
                    {selectedSub.imageUrls.map((img, i) => (
                      <img 
                        key={i} 
                        src={img} 
                        onClick={() => setFullscreenImage(img)}
                        className="rounded-xl border border-gray-200 w-full object-contain bg-gray-50 max-h-64 cursor-zoom-in hover:opacity-90 transition-opacity" 
                        alt="Scorecard Evidence"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-xl p-8 text-center text-gray-500 border border-gray-200 border-dashed">
                    No evidence images provided.
                  </div>
                )}
              </div>

              {/* Extracted Stats */}
              <div className="w-1/3 flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-gray-700 uppercase text-xs tracking-wider">Extracted Data</h3>
                  <button 
                    onClick={() => handleExtract(selectedSub.id)}
                    disabled={extracting}
                    className="bg-purple-100 text-purple-700 text-xs px-3 py-1.5 rounded font-bold hover:bg-purple-200 disabled:opacity-50"
                  >
                    {extracting ? 'Extracting...' : '✨ Extract AI'}
                  </button>
                </div>
                
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 flex-1 overflow-y-auto space-y-3">
                  {Object.keys(editableData).length === 0 ? (
                    <div className="text-center text-sm text-gray-400 py-8 italic">
                      Click Extract AI to populate from screenshots, or manually approve.
                    </div>
                  ) : (
                    Object.entries(editableData).map(([k, v]) => (
                      <div key={k} className="flex justify-between items-center border-b border-gray-200 pb-2 last:border-0 last:pb-0">
                        <span className="text-gray-600 capitalize text-sm">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
                        <input
                          type="text"
                          value={v === null ? '' : v}
                          onChange={(e) => handleDataChange(k, e.target.value)}
                          className="font-bold text-gray-900 bg-white border border-gray-300 rounded px-2 py-1 w-20 text-right text-sm focus:border-cricket focus:ring-1 focus:ring-cricket outline-none"
                        />
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-4">
              <button 
                onClick={() => handleReject(selectedSub.id)}
                className="px-6 py-3 rounded-lg font-bold text-red-600 hover:bg-red-50 transition-colors"
              >
                Reject
              </button>
              <button 
                onClick={() => handleApprove(selectedSub.id)}
                className="px-6 py-3 rounded-lg font-bold bg-cricket text-white flex items-center gap-2 hover:bg-opacity-90 transition-colors shadow-sm"
              >
                <CheckCircle size={20} />
                Approve & Merge
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Overlay */}
      {fullscreenImage && (
        <div 
          className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setFullscreenImage(null)}
        >
          <img 
            src={fullscreenImage} 
            className="max-w-full max-h-[95vh] object-contain rounded-lg"
            alt="Fullscreen Evidence"
          />
          <button 
            className="absolute top-6 right-6 text-white/70 hover:text-white"
            onClick={(e) => { e.stopPropagation(); setFullscreenImage(null); }}
          >
            <XCircle size={36} />
          </button>
        </div>
      )}
    </div>
  );
}
