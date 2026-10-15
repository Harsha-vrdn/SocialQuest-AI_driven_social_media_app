import {useEvent} from 'expo';
import {useVideoPlayer} from 'expo-video';
import {useCallback, useLayoutEffect, useRef, useState} from 'react';

export function useReelPlayback(media: string | undefined, isActive: boolean) {
  const player = useVideoPlayer(media ?? null, video => {
    video.loop = true;
    video.muted = true;
    video.staysActiveInBackground = false;
    video.showNowPlayingNotification = false;
  });
  const {status} = useEvent(player, 'statusChange', {status: player.status});
  const {isPlaying} = useEvent(player, 'playingChange', {isPlaying: player.playing});
  const [paused, setPaused] = useState(false);
  const pauseIntent = useRef(false);
  const [hasFrame, setHasFrame] = useState(false);
  const shouldPlay = isActive && !!media && !paused;

  // Pause the outgoing slide before the next one plays, and before expo-video
  // releases its native player on unmount. Each slide is keyed by its source.
  useLayoutEffect(() => {
    player.muted = !shouldPlay;
    if (shouldPlay) player.play();
    else player.pause();
    return () => {player.muted = true; player.pause();};
  }, [player, shouldPlay]);

  const togglePlayback = useCallback(() => {
    if (!isActive || !media) return null;
    pauseIntent.current = !pauseIntent.current;
    setPaused(pauseIntent.current);
    return pauseIntent.current;
  }, [isActive, media]);

  return {
    player, status, isPlaying, paused, togglePlayback,
    onFirstFrameRender: useCallback(() => setHasFrame(true), []),
    loading: isActive && !!media && status !== 'error' && (!hasFrame || status === 'loading' || status === 'idle'),
  };
}
