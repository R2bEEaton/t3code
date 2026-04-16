import { useCallback, useEffect, useState } from "react";
import {
  deriveAudioOutputDeviceOptions,
  isAudioOutputSelectionSupported,
  listAudioOutputDevices,
  type AudioOutputDeviceOption,
} from "../notificationChime";

const EMPTY_AUDIO_OUTPUT_DEVICES: AudioOutputDeviceOption[] = deriveAudioOutputDeviceOptions(
  [],
  "",
);

export function useAudioOutputDevices(selectedDeviceId: string) {
  const audioOutputSelectionSupported = isAudioOutputSelectionSupported();
  const [audioOutputDevices, setAudioOutputDevices] = useState<AudioOutputDeviceOption[]>(() =>
    deriveAudioOutputDeviceOptions([], selectedDeviceId),
  );
  const [audioOutputDevicesLoading, setAudioOutputDevicesLoading] = useState(false);
  const [audioOutputDevicesError, setAudioOutputDevicesError] = useState<string | null>(null);

  const refreshAudioOutputDevices = useCallback(async () => {
    if (!audioOutputSelectionSupported) {
      setAudioOutputDevices(deriveAudioOutputDeviceOptions([], selectedDeviceId));
      setAudioOutputDevicesLoading(false);
      setAudioOutputDevicesError(null);
      return;
    }

    setAudioOutputDevicesLoading(true);
    setAudioOutputDevicesError(null);

    try {
      const devices = await listAudioOutputDevices();
      setAudioOutputDevices(deriveAudioOutputDeviceOptions(devices, selectedDeviceId));
    } catch (error) {
      setAudioOutputDevices(deriveAudioOutputDeviceOptions([], selectedDeviceId));
      setAudioOutputDevicesError(
        error instanceof Error ? error.message : "Unable to enumerate audio output devices.",
      );
    } finally {
      setAudioOutputDevicesLoading(false);
    }
  }, [audioOutputSelectionSupported, selectedDeviceId]);

  useEffect(() => {
    if (!audioOutputSelectionSupported) {
      setAudioOutputDevices(
        selectedDeviceId.length > 0
          ? deriveAudioOutputDeviceOptions([], selectedDeviceId)
          : EMPTY_AUDIO_OUTPUT_DEVICES,
      );
      setAudioOutputDevicesLoading(false);
      setAudioOutputDevicesError(null);
      return;
    }

    let cancelled = false;
    const syncDevices = async () => {
      setAudioOutputDevicesLoading(true);
      setAudioOutputDevicesError(null);
      try {
        const devices = await listAudioOutputDevices();
        if (cancelled) {
          return;
        }
        setAudioOutputDevices(deriveAudioOutputDeviceOptions(devices, selectedDeviceId));
      } catch (error) {
        if (cancelled) {
          return;
        }
        setAudioOutputDevices(deriveAudioOutputDeviceOptions([], selectedDeviceId));
        setAudioOutputDevicesError(
          error instanceof Error ? error.message : "Unable to enumerate audio output devices.",
        );
      } finally {
        if (!cancelled) {
          setAudioOutputDevicesLoading(false);
        }
      }
    };

    void syncDevices();

    const mediaDevices = navigator.mediaDevices;
    const onDeviceChange = () => {
      void syncDevices();
    };

    if (typeof mediaDevices?.addEventListener === "function") {
      mediaDevices.addEventListener("devicechange", onDeviceChange);
    }

    return () => {
      cancelled = true;
      if (typeof mediaDevices?.removeEventListener === "function") {
        mediaDevices.removeEventListener("devicechange", onDeviceChange);
      }
    };
  }, [audioOutputSelectionSupported, selectedDeviceId]);

  return {
    audioOutputDevices,
    audioOutputDevicesError,
    audioOutputDevicesLoading,
    audioOutputSelectionSupported,
    refreshAudioOutputDevices,
  };
}
