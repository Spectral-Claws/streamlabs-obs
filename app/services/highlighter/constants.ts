import path from 'path';
import Utils from 'services/utils';
import electron from 'electron';

export const FFMPEG_DIR = Utils.isDevMode()
  ? path.resolve('node_modules', 'ffmpeg-ffprobe-static')
  : path.resolve(process.resourcesPath, 'node_modules', 'ffmpeg-ffprobe-static');

export const FFMPEG_EXE = path.join(FFMPEG_DIR, 'ffmpeg.exe');
export const FFPROBE_EXE = path.join(FFMPEG_DIR, 'ffprobe.exe');

// TODO: Used for test mode only
export const CLIP_DIR = path.resolve('C:/', 'Users', 'acree', 'Videos');

/**
 * Enable to use predefined clips instead of pulling from
 * the replay buffer.
 */
export const TEST_MODE = true;

export const SCRUB_WIDTH = 320;
export const SCRUB_HEIGHT = 180;
export const SCRUB_FRAMES = 20;
export const SCRUB_SPRITE_DIRECTORY = path.join(
  electron.remote.app.getPath('userData'),
  'highlighter',
);

export const FADE_OUT_DURATION = 1;

export const SUPPORTED_FILE_TYPES = ['mp4', 'mov', 'mkv'];
