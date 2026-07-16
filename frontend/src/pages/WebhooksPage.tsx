import { useEffect, useState } from 'react';
import { fetchWebhookConfigs, fetchWebhookEvents, triggerTestWebhook } from '../api/webhooks';
import type { WebhookConfig, WebhookEvent } from '../api/webhooks';

export function WebhooksPage() {
  const [configs, setConfigs] = useState<WebhookConfig[]>([]);
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filterProvider, setFilterProvider] = useState('');

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [c, e] = await Promise.all([fetchWebhookConfigs(), fetchWebhookEvents(filterProvider || undefined)]);
      setConfigs(c);
      setEvents(e);
    } catch (err: any) {
      setError(err.message || 'Failed to load webhooks data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [filterProvider]);

  async function handleTest(provider: string) {
    try {
      await triggerTestWebhook(provider);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to trigger test webhook');
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Webhooks</h1>
        <button
          onClick={() => {/* open add modal */}}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
        >
          Add Webhook
        </button>
      </div>

      {error && <div className="mb-4 p-4 bg-red-900 text-red-100 rounded">{error}</div>}

      <div className="mb-8">
        <h2 className="text-lg font-medium mb-4">Registered Webhooks</h2>
        <div className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700">
          <table className="w-full text-left">
            <thead className="bg-gray-900/50">
              <tr>
                <th className="px-6 py-3 font-medium text-gray-400">Provider</th>
                <th className="px-6 py-3 font-medium text-gray-400">Status</th>
                <th className="px-6 py-3 font-medium text-gray-400">Last Received</th>
                <th className="px-6 py-3 font-medium text-gray-400">Total Count</th>
                <th className="px-6 py-3 font-medium text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {configs.map(config => (
                <tr key={config.provider}>
                  <td className="px-6 py-4 font-medium capitalize">{config.provider}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${config.status === 'active' ? 'bg-green-900 text-green-200' : 'bg-gray-700 text-gray-300'}`}>
                      {config.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-400 text-sm">
                    {config.lastReceived ? new Date(config.lastReceived).toLocaleString() : 'Never'}
                  </td>
                  <td className="px-6 py-4 text-gray-400">{config.totalCount || 0}</td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleTest(config.provider)}
                      className="text-blue-400 hover:text-blue-300 text-sm font-medium"
                    >
                      Test
                    </button>
                  </td>
                </tr>
              ))}
              {configs.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    No webhook configs found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium">Recent Events</h2>
          <select
            value={filterProvider}
            onChange={(e) => setFilterProvider(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-1 text-sm"
          >
            <option value="">All Providers</option>
            <option value="github">GitHub</option>
            <option value="npm">npm</option>
            <option value="stripe">Stripe</option>
          </select>
        </div>
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 max-h-96 overflow-y-auto">
          {events.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No recent events</p>
          ) : (
            <div className="space-y-3">
              {events.map(ev => (
                <div key={ev.id} className="flex items-center justify-between p-3 bg-gray-900/50 rounded">
                  <div className="flex items-center gap-3">
                    <span className="capitalize font-medium text-blue-400">{ev.provider}</span>
                    <span className="text-gray-300">{ev.event_type}</span>
                  </div>
                  <span className="text-gray-500 text-sm">{new Date(ev.received_at).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
