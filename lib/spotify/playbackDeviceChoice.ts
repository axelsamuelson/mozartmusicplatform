export type PlaybackDevice = {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
  is_this_browser: boolean;
};

export type PlaybackDeviceChooser = (
  devices: PlaybackDevice[],
) => Promise<string | null>;

let chooser: PlaybackDeviceChooser | null = null;

/** Player bar registers a UI so skip/play can ask which speaker to use. */
export function registerPlaybackDeviceChooser(
  next: PlaybackDeviceChooser | null,
): void {
  chooser = next;
}

export async function requestPlaybackDeviceChoice(
  devices: PlaybackDevice[],
): Promise<string | null> {
  if (!chooser || devices.length === 0) return null;
  return chooser(devices);
}
