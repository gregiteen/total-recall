import { useEffect, useState } from 'react';
import { fetchLeader, fetchNodes, forceReElection } from '../api/mesh';
import type { MeshNode, LeaderInfo } from '../api/mesh';

export function MeshPage() {
  const [nodes, setNodes] = useState<MeshNode[]>([]);
  const [leader, setLeader] = useState<LeaderInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [n, l] = await Promise.all([fetchNodes(), fetchLeader()]);
      setNodes(n);
      setLeader(l);
    } catch (err: any) {
      setError(err.message || 'Failed to load mesh data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  async function handleForceReElection() {
    try {
      await forceReElection();
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to force re-election');
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Mesh Network</h1>
        <button
          onClick={handleForceReElection}
          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
        >
          Force Re-Election
        </button>
      </div>

      {error && <div className="mb-4 p-4 bg-red-900 text-red-100 rounded">{error}</div>}

      <div className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700">
        <table className="w-full text-left">
          <thead className="bg-gray-900/50">
            <tr>
              <th className="px-6 py-3 font-medium text-gray-400">Hostname</th>
              <th className="px-6 py-3 font-medium text-gray-400">Mesh IP</th>
              <th className="px-6 py-3 font-medium text-gray-400">Role</th>
              <th className="px-6 py-3 font-medium text-gray-400">Status</th>
              <th className="px-6 py-3 font-medium text-gray-400">Last Heartbeat</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700/50">
            {nodes.map(node => (
              <tr key={node.hostname} className={node.hostname === leader?.hostname ? 'bg-blue-900/20' : ''}>
                <td className="px-6 py-4 font-medium flex items-center gap-2">
                  {node.hostname === leader?.hostname && <span className="text-blue-400" title="Leader">👑</span>}
                  {node.hostname}
                </td>
                <td className="px-6 py-4 text-gray-400">{node.ip}</td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${node.hostname === leader?.hostname ? 'bg-blue-900 text-blue-200' : 'bg-gray-700 text-gray-300'}`}>
                    {node.hostname === leader?.hostname ? 'LEADER' : 'FOLLOWER'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${node.status === 'online' ? 'bg-green-900 text-green-200' : 'bg-red-900 text-red-200'}`}>
                    {node.status.toUpperCase()}
                  </span>
                </td>
                <td className="px-6 py-4 text-gray-400 text-sm">
                  {new Date(node.lastHeartbeat).toLocaleString()}
                </td>
              </tr>
            ))}
            {nodes.length === 0 && !loading && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                  No mesh nodes found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
