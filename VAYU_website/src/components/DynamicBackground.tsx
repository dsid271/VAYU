
"use client";
import { useState, useEffect, useMemo, useRef } from 'react';
import type { FC } from 'react';
import { Sunrise, Sun, Sunset, Moon } from 'lucide-react';

type TimeOfDay = 'sunrise' | 'noon' | 'sunset' | 'night';

interface DynamicBackgroundProps {
  aqi: number;
}

const SYNC_INTERVAL_MS = 250;
const VIDEO_CONTENT_STARTS_AT_HOUR = 17;
const PARALLAX_STRENGTH = 20;
const VIDEO_SCALE_FACTOR = 1.20;
const FISHEYE_STRENGTH_DEG = 5;

const getTimeOfDay = (): TimeOfDay => {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 8) return 'sunrise';
  if (hour >= 8 && hour < 17) return 'noon';
  if (hour >= 17 && hour < 20) return 'sunset';
  return 'night';
};

const timeOfDayIcons: Record<TimeOfDay, JSX.Element> = {
  sunrise: <Sunrise className="h-6 w-6 sm:h-8 sm:w-8" />,
  noon: <Sun className="h-6 w-6 sm:h-8 sm:w-8" />,
  sunset: <Sunset className="h-6 w-6 sm:h-8 sm:w-8" />,
  night: <Moon className="h-6 w-6 sm:h-8 sm:w-8" />,
};

const DynamicBackground: FC<DynamicBackgroundProps> = ({ aqi }) => {
  const [currentTimeOfDay, setCurrentTimeOfDay] = useState<TimeOfDay>('noon');
  const [formattedTime, setFormattedTime] = useState<string>('');
  const [isMounted, setIsMounted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoError, setVideoError] = useState<string | null>(null);

  useEffect(() => {
    setIsMounted(true);
    const updateTOD = () => {
      setCurrentTimeOfDay(getTimeOfDay());
    };
    updateTOD();
    const todIntervalId = setInterval(updateTOD, 60000);

    const updateDisplayTime = () => {
      const now = new Date();
      setFormattedTime(now.toLocaleTimeString([], { hour: 'numeric', minute: 'numeric' }));
    };
    updateDisplayTime();
    const timeIntervalId = setInterval(updateDisplayTime, 1000);

    return () => {
      clearInterval(todIntervalId);
      clearInterval(timeIntervalId);
    };
  }, []);

  useEffect(() => {
    if (!isMounted) return;

    const video = videoRef.current;
    if (!video) return;

    let syncIntervalId: NodeJS.Timeout | null = null;
    let hasVideoSetupRun = false;

    const syncVideoToRealTime = () => {
      if (!videoRef.current || !videoRef.current.duration || !isFinite(videoRef.current.duration)) {
        return;
      }
      const currentVideoElement = videoRef.current;

      const now = new Date();
      const currentHour = now.getHours();
      const effectiveHourForVideo = (currentHour - VIDEO_CONTENT_STARTS_AT_HOUR + 24) % 24;

      const secondsSinceVideoCycleStart = effectiveHourForVideo * 3600 + now.getMinutes() * 60 + now.getSeconds();
      const totalSecondsInDay = 24 * 3600;
      const fractionOfVideoCycle = secondsSinceVideoCycleStart / totalSecondsInDay;

      const targetTime = fractionOfVideoCycle * currentVideoElement.duration;

      currentVideoElement.currentTime = targetTime;
    };

    const onVideoReady = () => {
      if (hasVideoSetupRun || !video.duration || !isFinite(video.duration)) return;
      hasVideoSetupRun = true;

      video.muted = true;
      video.playsInline = true;
      video.pause();

      syncVideoToRealTime();

      if (syncIntervalId) clearInterval(syncIntervalId);
      syncIntervalId = setInterval(syncVideoToRealTime, SYNC_INTERVAL_MS);
    };

    const onVideoElementError = (event: Event) => {
      const mediaError = (event.target as HTMLVideoElement).error;
      let msg = "Video element error. ";
      if (mediaError) {
        msg += `Code ${mediaError.code}; Message: ${mediaError.message}. `;
      }
      msg += "CRITICAL: The video file MUST be located at 'public/videos/timelapse.mp4'. This means a 'public' folder at the VERY ROOT of your project, containing a 'videos' subfolder, which in turn contains 'timelapse.mp4'. Also verify 'timelapse.mp4' is a valid MP4. Check browser console (F12) for more details like 404 Not Found errors.";
      console.error(msg, mediaError);
      if (!videoError) setVideoError(msg);
    };

    video.addEventListener('loadedmetadata', onVideoReady);
    video.addEventListener('canplay', onVideoReady);
    video.addEventListener('error', onVideoElementError);

    video.muted = true;
    video.playsInline = true;

    const initialPlayPromise = video.play();
    if (initialPlayPromise !== undefined) {
        initialPlayPromise.catch(err => {
            console.warn("Initial autoplay attempt failed (may be due to browser policy, onVideoReady will manage):", err.message);
             if (!videoError && err.name === 'NotAllowedError') {
                setVideoError("Autoplay was prevented by the browser. User interaction might be needed to start the video, or check browser autoplay policies.");
            }
        }).then(() => {
          if (video && video.paused === false && !hasVideoSetupRun) {
            video.pause();
          }
        });
    }

    return () => {
      if (syncIntervalId) clearInterval(syncIntervalId);
      if (video) {
        video.removeEventListener('loadedmetadata', onVideoReady);
        video.removeEventListener('canplay', onVideoReady);
        video.removeEventListener('error', onVideoElementError);
        if (!video.paused) {
          video.pause();
        }
      }
    };
  }, [isMounted, videoError]);


  useEffect(() => {
    if (!isMounted || !videoRef.current) {
      return;
    }
    const videoElement = videoRef.current;

    if (videoElement.style.transform === '' || !videoElement.style.transform.includes('scale')) {
        videoElement.style.transform = `scale(${VIDEO_SCALE_FACTOR}) translate(0px, 0px) rotateX(0deg) rotateY(0deg)`;
    }


    const handleMouseMove = (event: MouseEvent) => {
      if (!videoRef.current) return;
      const { clientX, clientY } = event;
      const { innerWidth, innerHeight } = window;

      const normX = clientX / innerWidth - 0.5;
      const normY = clientY / innerHeight - 0.5;

      const moveX = -normX * PARALLAX_STRENGTH * 2;
      const moveY = -normY * PARALLAX_STRENGTH * 2;

      const rotateYdeg = normX * FISHEYE_STRENGTH_DEG * 2;
      const rotateXdeg = -normY * FISHEYE_STRENGTH_DEG * 2;

      videoRef.current.style.transform = `scale(${VIDEO_SCALE_FACTOR}) translate(${moveX}px, ${moveY}px) rotateX(${rotateXdeg}deg) rotateY(${rotateYdeg}deg)`;
    };

    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (videoRef.current) {
        videoRef.current.style.transform = `scale(${VIDEO_SCALE_FACTOR}) translate(0px, 0px) rotateX(0deg) rotateY(0deg)`;
      }
    };
  }, [isMounted]);

  const fogOpacity = useMemo(() => {
    if (aqi < 0) return 0;
    const normalizedAqi = Math.min(aqi, 500);
    // Max opacity of 0.8 at AQI 500+. Starts subtly even at low AQI.
    // Increase base for lower AQI to make fog more visible earlier
    if (normalizedAqi <= 50) return Math.min(0.7, (normalizedAqi / 50) * 0.2 + 0.05); // More visible fog at low AQI
    return Math.min(0.7, ((normalizedAqi - 50) / 450) * 0.5 + 0.2); // Scale up to 0.7 max
  }, [aqi]);

  const layer1Opacity = useMemo(() => fogOpacity * 0.6, [fogOpacity]);
  const layer2Opacity = useMemo(() => fogOpacity * 0.4, [fogOpacity]);


  const currentIcon = timeOfDayIcons[currentTimeOfDay];

  if (!isMounted) {
    return <div className="fixed inset-0 z-[-1] bg-muted" />;
  }

  return (
    <>
      {videoError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 pointer-events-none">
          <div className="bg-destructive text-destructive-foreground p-6 rounded-lg shadow-lg max-w-md text-center">
            <h3 className="text-lg font-semibold mb-2">Video Playback Issue</h3>
            <p className="text-sm">{videoError}</p>
          </div>
        </div>
      )}
      <div
        className="fixed inset-0 w-full h-full z-[-1] pointer-events-none"
        style={{ perspective: '1000px' }}
      >
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          style={{
            transformOrigin: 'center center',
            transform: `scale(${VIDEO_SCALE_FACTOR}) translate(0px, 0px) rotateX(0deg) rotateY(0deg)` // Initial scale and transform for parallax
          }}
          playsInline // For iOS Safari
          muted // Autoplay usually requires muted
          onError={(e) => { // More direct error handling on video element
             const mediaError = (e.target as HTMLVideoElement).error;
             let msg = "Video element error (onError prop). ";
             if (mediaError) {
                msg += `Code ${mediaError.code}; Message: ${mediaError.message}. `;
             }
             msg += "CRITICAL: The video file MUST be located at 'public/videos/timelapse.mp4'. This means a 'public' folder at the VERY ROOT of your project, containing a 'videos' subfolder, which in turn contains 'timelapse.mp4'. Also verify 'timelapse.mp4' is a valid MP4. Check browser console (F12) for more details like 404 Not Found errors.";
             console.error(msg, mediaError);
             if(!videoError) setVideoError(msg);
          }}
        >
          <source
            src="/videos/timelapse.mp4"
            type="video/mp4"
            onError={() => { // Fallback error on source element
              const errorMsg = "Video source error: The browser could not load '/videos/timelapse.mp4'. CRITICAL: This file MUST be placed at 'public/videos/timelapse.mp4' (the 'public' folder at the VERY ROOT of your project). Also, verify 'timelapse.mp4' is a valid MP4. Check browser console (F12) for detailed network errors (like 404 Not Found).";
              console.error(errorMsg);
              if(!videoError) setVideoError(errorMsg);
            }}
          />
          Your browser does not support the video tag, or the video source could not be loaded.
          Ensure the video file 'timelapse.mp4' is a valid MP4 and located at 'public/videos/timelapse.mp4' (the 'public' folder at the VERY ROOT of your project).
        </video>
      </div>

      {/* Animated Fog Layer 1 */}
      <div
        className="fixed inset-0 z-[0] bg-fog animate-drift1 pointer-events-none transition-opacity duration-[3000ms] ease-in-out"
        style={{ opacity: layer1Opacity }}
        aria-hidden="true"
      />
      {/* Animated Fog Layer 2 */}
      <div
        className="fixed inset-0 z-[1] bg-fog animate-drift2 pointer-events-none transition-opacity duration-[3000ms] ease-in-out"
        style={{ opacity: layer2Opacity }}
        aria-hidden="true"
      />
      
      <div className="absolute top-4 left-4 sm:top-8 sm:left-8 z-10 flex items-center space-x-2 sm:space-x-3">
        {/* Time Display Card */}
        <div className="text-primary-foreground p-2 sm:p-3 bg-card/30 backdrop-blur-xl shadow-2xl border border-foreground/10 rounded-lg flex items-center space-x-1 sm:space-x-2">
          {currentIcon}
          <span className="font-medium tabular-nums">{formattedTime}</span>
        </div>
        {/* VAYU Text */}
        <div
          className="font-headlineAlt text-lg sm:text-xl font-bold text-transparent tracking-wider [-webkit-text-stroke-width:1px] [-webkit-text-stroke-color:hsl(var(--primary-foreground))]"
        >
          VAYU
        </div>
      </div>
    </>
  );
};

export default DynamicBackground;
