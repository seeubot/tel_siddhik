import { useState, useEffect } from 'react';
import DeviceIdentity from '../lib/DeviceIdentity';
import { registerDevice } from '../lib/api';

export function useDeviceIdentity(socketRef) {
  const [deviceId, setDeviceId] = useState(null);
  const [isBanned, setIsBanned] = useState(false);
  const [banInfo, setBanInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    initDevice();
  }, []);

  const initDevice = async () => {
    try {
      setIsLoading(true);
      
      // 1. Get or create permanent device ID
      const id = await DeviceIdentity.getOrCreateDeviceId();
      setDeviceId(id);
      console.log('Device ID initialized:', id?.substring(0, 12) + '...');

      // 2. Check local ban first
      const banned = await DeviceIdentity.isDeviceBanned();
      if (banned) {
        const info = await DeviceIdentity.getBanInfo();
        setBanInfo(info);
        setIsBanned(true);
        setIsLoading(false);
        console.log('Device is banned locally');
        return;
      }

      // 3. Check server ban
      try {
        const response = await fetch('/api/device/check-ban', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': 'oryx_2024_secure_key_change_this'
          },
          body: JSON.stringify({ deviceId: id })
        });

        if (response.status === 403) {
          const serverBanInfo = await response.json();
          await DeviceIdentity.storeBan(serverBanInfo);
          setBanInfo(serverBanInfo);
          setIsBanned(true);
          setIsLoading(false);
          console.log('Device is banned on server');
          return;
        }
      } catch (e) {
        console.log('Server ban check failed (may be offline)');
      }

      // 4. Register with server
      try {
        await registerDevice(id);
        console.log('Device registered with server');
      } catch (e) {
        console.log('Server registration failed (may be offline)');
      }

      // 5. Register with socket
      if (socketRef?.current?.connected) {
        socketRef.current.emit('register-device', { deviceId: id });
      }

      setIsLoading(false);

    } catch (error) {
      console.error('Device init error:', error);
      setIsLoading(false);
    }
  };

  return { deviceId, isBanned, banInfo, isLoading };
}
