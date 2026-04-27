// Custom hook for device initialization
import { useState, useEffect } from 'react';
import DeviceIdentity from '../lib/DeviceIdentity';
import { registerDevice } from '../lib/api';

export function useDeviceIdentity(socket) {
  const [deviceId, setDeviceId] = useState(null);
  const [isBanned, setIsBanned] = useState(false);
  const [banInfo, setBanInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    initDevice();
  }, []);

  const initDevice = async () => {
    try {
      const id = await DeviceIdentity.getOrCreateDeviceId();
      setDeviceId(id);

      const banned = await DeviceIdentity.isDeviceBanned();
      if (banned) {
        setIsBanned(true);
        setBanInfo({ reason: 'Your device has been banned.' });
        setIsLoading(false);
        return;
      }

      await registerDevice(id);
      
      if (socket) {
        socket.emit('register-device', { deviceId: id });
      }

    } catch (error) {
      if (error.message === 'DEVICE_BANNED') {
        setIsBanned(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return { deviceId, isBanned, banInfo, isLoading };
}
