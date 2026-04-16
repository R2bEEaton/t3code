import { derivePendingUserInputs, isLatestTurnSettled } from "./session-logic";
import { type Thread } from "./types";
import { type QueuedSendWhenDoneEntry } from "./messageQueueStore";

export interface ThreadNotificationChimeSnapshot {
  completedTurnId: string | null;
  pendingUserInputRequestId: string | null;
}

export interface AudioOutputDeviceOption {
  deviceId: string;
  label: string;
  available: boolean;
}

interface AudioOutputDeviceLike {
  deviceId: string;
  kind: string;
  label: string;
}

const SYSTEM_DEFAULT_AUDIO_OUTPUT_DEVICE_ID = "";
const SYSTEM_DEFAULT_AUDIO_OUTPUT_LABEL = "System default";
const UNAVAILABLE_AUDIO_OUTPUT_LABEL = "Previously selected device (unavailable)";

let notificationChimeUrl: string | null = null;
const activeNotificationAudios = new Set<HTMLAudioElement>();

export function buildThreadNotificationChimeSnapshotMap(
  threads: ReadonlyArray<Thread>,
): ReadonlyMap<string, ThreadNotificationChimeSnapshot> {
  return new Map(
    threads.map((thread) => [thread.id, deriveThreadNotificationChimeSnapshot(thread)]),
  );
}

export function shouldPlayNotificationChime(input: {
  previous: ReadonlyMap<string, ThreadNotificationChimeSnapshot>;
  next: ReadonlyMap<string, ThreadNotificationChimeSnapshot>;
  playChimeWithSendWhenDone: boolean;
  sendWhenDoneEntriesByThreadId: Readonly<Record<string, readonly QueuedSendWhenDoneEntry[]>>;
}): boolean {
  for (const [threadId, nextSnapshot] of input.next) {
    const previousSnapshot = input.previous.get(threadId);
    if (!previousSnapshot) {
      continue;
    }
    if (
      nextSnapshot.completedTurnId !== null &&
      nextSnapshot.completedTurnId !== previousSnapshot.completedTurnId
    ) {
      if (
        !input.playChimeWithSendWhenDone &&
        getNextSendWhenDoneEntryType(input.sendWhenDoneEntriesByThreadId[threadId]) === "message"
      ) {
        continue;
      }
      return true;
    }
    if (
      nextSnapshot.pendingUserInputRequestId !== null &&
      nextSnapshot.pendingUserInputRequestId !== previousSnapshot.pendingUserInputRequestId
    ) {
      return true;
    }
  }
  return false;
}

function getNextSendWhenDoneEntryType(
  queue: readonly QueuedSendWhenDoneEntry[] | undefined,
): QueuedSendWhenDoneEntry["type"] | null {
  return queue?.[0]?.type ?? null;
}

export function deriveAudioOutputDeviceOptions(
  devices: ReadonlyArray<AudioOutputDeviceLike>,
  selectedDeviceId: string,
): AudioOutputDeviceOption[] {
  const audioOutputs = devices.filter((device) => device.kind === "audiooutput");
  const options: AudioOutputDeviceOption[] = [
    {
      deviceId: SYSTEM_DEFAULT_AUDIO_OUTPUT_DEVICE_ID,
      label: SYSTEM_DEFAULT_AUDIO_OUTPUT_LABEL,
      available: true,
    },
  ];

  for (const [index, device] of audioOutputs.entries()) {
    if (device.deviceId === SYSTEM_DEFAULT_AUDIO_OUTPUT_DEVICE_ID) {
      continue;
    }
    options.push({
      deviceId: device.deviceId,
      label: device.label.trim().length > 0 ? device.label : `Audio output ${index + 1}`,
      available: true,
    });
  }

  const hasSelectedDevice =
    selectedDeviceId.length === 0 || options.some((option) => option.deviceId === selectedDeviceId);
  if (!hasSelectedDevice) {
    options.push({
      deviceId: selectedDeviceId,
      label: UNAVAILABLE_AUDIO_OUTPUT_LABEL,
      available: false,
    });
  }

  return options;
}

export function isAudioOutputSelectionSupported(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  if (typeof navigator.mediaDevices?.enumerateDevices !== "function") {
    return false;
  }
  if (typeof HTMLMediaElement === "undefined") {
    return false;
  }
  const mediaElementPrototype = HTMLMediaElement.prototype as HTMLMediaElement & {
    setSinkId?: (deviceId: string) => Promise<void>;
  };
  return typeof mediaElementPrototype.setSinkId === "function";
}

export async function listAudioOutputDevices(): Promise<AudioOutputDeviceLike[]> {
  if (
    typeof navigator === "undefined" ||
    typeof navigator.mediaDevices?.enumerateDevices !== "function"
  ) {
    return [];
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((device) => device.kind === "audiooutput")
    .map((device) => ({
      deviceId: device.deviceId,
      kind: device.kind,
      label: device.label,
    }));
}

export async function playNotificationChime(
  outputDeviceId: string | null | undefined,
): Promise<void> {
  if (typeof Audio === "undefined") {
    return;
  }

  const audio = new Audio(getNotificationChimeUrl());
  audio.preload = "auto";
  audio.volume = 0.42;

  const cleanup = () => {
    activeNotificationAudios.delete(audio);
    audio.src = "";
    audio.load();
  };

  activeNotificationAudios.add(audio);
  audio.addEventListener("ended", cleanup, { once: true });
  audio.addEventListener("error", cleanup, { once: true });

  try {
    await routeNotificationAudioOutput(
      audio,
      outputDeviceId ?? SYSTEM_DEFAULT_AUDIO_OUTPUT_DEVICE_ID,
    );
    await audio.play();
  } catch (error) {
    cleanup();
    throw error;
  }
}

function deriveThreadNotificationChimeSnapshot(thread: Thread): ThreadNotificationChimeSnapshot {
  const pendingUserInputRequestId =
    derivePendingUserInputs(thread.activities)[0]?.requestId ?? null;
  const latestTurn = thread.latestTurn;
  const completedTurnId =
    latestTurn?.state === "completed" && isLatestTurnSettled(latestTurn, thread.session)
      ? latestTurn.turnId
      : null;

  return {
    completedTurnId,
    pendingUserInputRequestId,
  };
}

async function routeNotificationAudioOutput(
  audio: HTMLAudioElement,
  outputDeviceId: string,
): Promise<void> {
  if (outputDeviceId.length === 0) {
    return;
  }
  const audioWithSinkId = audio as HTMLAudioElement & {
    setSinkId?: (deviceId: string) => Promise<void>;
  };
  if (typeof audioWithSinkId.setSinkId !== "function") {
    return;
  }
  try {
    await audioWithSinkId.setSinkId(outputDeviceId);
  } catch {
    await audioWithSinkId.setSinkId(SYSTEM_DEFAULT_AUDIO_OUTPUT_DEVICE_ID);
  }
}

function getNotificationChimeUrl(): string {
  if (notificationChimeUrl) {
    return notificationChimeUrl;
  }
  const blob = new Blob([buildNotificationChimeWav()], { type: "audio/wav" });
  notificationChimeUrl = URL.createObjectURL(blob);
  return notificationChimeUrl;
}

function buildNotificationChimeWav(): ArrayBuffer {
  const sampleRate = 24_000;
  const notes = [
    { frequency: 740, durationMs: 90, gain: 0.22, delayMs: 0 },
    { frequency: 988, durationMs: 130, gain: 0.18, delayMs: 70 },
  ] as const;
  const totalDurationMs = notes.reduce(
    (max, note) => Math.max(max, note.delayMs + note.durationMs),
    0,
  );
  const totalSamples = Math.ceil((sampleRate * totalDurationMs) / 1_000);
  const dataByteLength = totalSamples * 2;
  const buffer = new ArrayBuffer(44 + dataByteLength);
  const view = new DataView(buffer);

  writeWaveString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataByteLength, true);
  writeWaveString(view, 8, "WAVE");
  writeWaveString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeWaveString(view, 36, "data");
  view.setUint32(40, dataByteLength, true);

  for (let sampleIndex = 0; sampleIndex < totalSamples; sampleIndex += 1) {
    const timeMs = (sampleIndex / sampleRate) * 1_000;
    let sampleValue = 0;

    for (const note of notes) {
      const noteTimeMs = timeMs - note.delayMs;
      if (noteTimeMs < 0 || noteTimeMs > note.durationMs) {
        continue;
      }
      const progress = noteTimeMs / note.durationMs;
      const attack = Math.min(1, progress / 0.18);
      const decay = Math.max(0, 1 - progress);
      const envelope = attack * decay;
      sampleValue +=
        Math.sin((2 * Math.PI * note.frequency * noteTimeMs) / 1_000) * note.gain * envelope;
    }

    const clipped = Math.max(-1, Math.min(1, sampleValue));
    view.setInt16(44 + sampleIndex * 2, Math.round(clipped * 0x7fff), true);
  }

  return buffer;
}

function writeWaveString(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}
