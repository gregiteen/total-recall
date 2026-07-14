import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';

export function MobilePairing() {
  const [localIpUrl, setLocalIpUrl] = useState<string>('');

  useEffect(() => {
    // Attempt to guess the local LAN IP, or just use window.location.host
    const protocol = window.location.protocol;
    const host = window.location.host;
    
    // In a real implementation we might fetch the actual LAN IP from the backend
    // Since the backend knows its bind address.
    setLocalIpUrl(`${protocol}//${host}`);
  }, []);

  return (
    <div className="mobile-pairing" style={{ padding: '20px', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border)' }}>
      <h3>Mobile Device Pairing</h3>
      <p style={{ color: 'var(--text-tertiary)', fontSize: '13px', marginBottom: '16px' }}>
        Scan this QR code with your phone's camera to connect to this Total Recall instance. Ensure your phone is on the same Wi-Fi network.
      </p>
      <div style={{ background: '#fff', padding: '16px', borderRadius: '8px', display: 'inline-block' }}>
        {localIpUrl ? (
          <QRCodeSVG value={localIpUrl} size={150} level="H" />
        ) : (
          <div style={{ width: 150, height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            Loading...
          </div>
        )}
      </div>
      <p style={{ marginTop: '16px', fontSize: '12px', color: 'var(--text-tertiary)' }}>
        URL: {localIpUrl}
      </p>
    </div>
  );
}
