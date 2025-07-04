
"use client";

import { useState, useEffect, useRef } from 'react';

interface PreloaderProps {
  onLoaded: () => void;
}

// --- SVG Bar/V Constants ---
const BAR_Y = 25; // Y-coordinate of the horizontal bar's centerline
const SEGMENT_LENGTH = 125; 
const BAR_START_X = 0; 
const BAR_MID_X = BAR_START_X + SEGMENT_LENGTH; // 125
const BAR_END_X = BAR_MID_X + SEGMENT_LENGTH;   // 250

const ROTATION_ANGLE_DEG = 60; 
const V_DOWNWARD_TRANSLATION_PX = 8; 

const STROKE_WIDTH = 25; 
const STROKE_LINECAP: "butt" | "round" | "square" | "inherit" = "butt";


// --- Animation Timings ---
const FILL_SEGMENT_DURATION = 750; // Duration for each half of the bar to fill
const FORM_V_DURATION = 500;      // Duration for the bar segments to rotate into V shape and translate
const HOLD_V_DURATION = 300;      // Duration to hold the completed V shape
const FADE_OUT_DURATION = 600;    // Duration for the entire preloader to fade out (increased from 300ms)

// --- Percentage Counter Constants ---
const PERCENTAGE_TRANSITION_DURATION = 200; // ms for the digit roll animation
const PERCENTAGE_UPDATE_INTERVAL = 20;    // ms interval for updating the percentage value
const DIGIT_CHARACTER_HEIGHT_EM = 1.2;    // Em height for each digit in the roller

// Sub-component for rendering a single rolling digit
const PercentageDigit: React.FC<{ digit: number }> = ({ digit }) => {
  const numberStripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (numberStripRef.current) {
      numberStripRef.current.style.transform = `translateY(-${digit * DIGIT_CHARACTER_HEIGHT_EM}em)`;
    }
  }, [digit]);

  return (
    <div
      className="h-[var(--digit-char-height)] overflow-hidden"
      style={{ '--digit-char-height': `${DIGIT_CHARACTER_HEIGHT_EM}em` } as React.CSSProperties}
    >
      <div
        ref={numberStripRef}
        className="flex flex-col"
        style={{ transition: `transform ${PERCENTAGE_TRANSITION_DURATION}ms ease-out` }}
      >
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="h-[var(--digit-char-height)] flex items-center justify-center"
            style={{ '--digit-char-height': `${DIGIT_CHARACTER_HEIGHT_EM}em` } as React.CSSProperties}
          >
            {i}
          </div>
        ))}
      </div>
    </div>
  );
};

const Preloader: React.FC<PreloaderProps> = ({ onLoaded }) => {
  const [animationPhase, setAnimationPhase] = useState<
    'initial' | 'fillingLeftSegment' | 'fillingRightSegment' | 'formingV' | 'holdingV' | 'fadingOut'
  >('initial');
  const [currentPercentage, setCurrentPercentage] = useState(0);
  const [showPercentage, setShowPercentage] = useState(false);

  const preloaderRef = useRef<HTMLDivElement>(null);
  const leftSegmentRef = useRef<SVGLineElement>(null);
  const rightSegmentRef = useRef<SVGLineElement>(null);
  const groupRef = useRef<SVGGElement>(null);


  useEffect(() => {
    let timer: NodeJS.Timeout;
    let percentageIntervalId: NodeJS.Timeout | undefined;

    const clearPercentageInterval = () => {
      if (percentageIntervalId) {
        clearInterval(percentageIntervalId);
        percentageIntervalId = undefined;
      }
    };

    switch (animationPhase) {
      case 'initial':
        setCurrentPercentage(0);
        setShowPercentage(false);
        timer = setTimeout(() => setAnimationPhase('fillingLeftSegment'), 50);
        break;

      case 'fillingLeftSegment':
        setShowPercentage(true);
        let progressLeft = 0;
        percentageIntervalId = setInterval(() => {
          progressLeft += PERCENTAGE_UPDATE_INTERVAL;
          const newPercentage = Math.min(Math.floor((50 * progressLeft) / FILL_SEGMENT_DURATION), 50);
          setCurrentPercentage(newPercentage);
          if (progressLeft >= FILL_SEGMENT_DURATION) clearPercentageInterval();
        }, PERCENTAGE_UPDATE_INTERVAL);
        timer = setTimeout(() => setAnimationPhase('fillingRightSegment'), FILL_SEGMENT_DURATION);
        break;

      case 'fillingRightSegment':
        let progressRight = 0;
        percentageIntervalId = setInterval(() => {
          progressRight += PERCENTAGE_UPDATE_INTERVAL;
          const newPercentage = Math.min(50 + Math.floor((50 * progressRight) / FILL_SEGMENT_DURATION), 100);
          setCurrentPercentage(newPercentage);
          if (progressRight >= FILL_SEGMENT_DURATION) {
            clearPercentageInterval();
            setCurrentPercentage(100); 
          }
        }, PERCENTAGE_UPDATE_INTERVAL);
        timer = setTimeout(() => setAnimationPhase('formingV'), FILL_SEGMENT_DURATION);
        break;

      case 'formingV':
        clearPercentageInterval();
        setCurrentPercentage(100); 
        setShowPercentage(true); 
        timer = setTimeout(() => setAnimationPhase('holdingV'), FORM_V_DURATION);
        break;

      case 'holdingV':
        clearPercentageInterval();
        setCurrentPercentage(100);
        setShowPercentage(true);
        timer = setTimeout(() => setAnimationPhase('fadingOut'), HOLD_V_DURATION);
        break;

      case 'fadingOut':
        clearPercentageInterval();
        setCurrentPercentage(100);
        setShowPercentage(true); 
        if (preloaderRef.current) {
          preloaderRef.current.classList.add('animate-preloader-zoom-fade-out');
        }
        timer = setTimeout(() => {
          setShowPercentage(false); 
          onLoaded();
        }, FADE_OUT_DURATION);
        break;
    }

    return () => {
      clearTimeout(timer);
      clearPercentageInterval();
    };
  }, [animationPhase, onLoaded]);

  const getSegmentStyle = (segmentName: 'left' | 'right'): React.CSSProperties => {
    const style: React.CSSProperties = {
        strokeDasharray: SEGMENT_LENGTH,
        strokeDashoffset: SEGMENT_LENGTH,
        transformOrigin: `${BAR_MID_X}px ${BAR_Y}px`,
        transform: 'rotate(0deg)',
        transition: 'none', // Default to no transition
    };

    if (animationPhase === 'fillingLeftSegment' && segmentName === 'left') {
        // Transition is handled by animate-preloader-draw class
    } else if (animationPhase === 'fillingRightSegment') {
        style.strokeDashoffset = segmentName === 'left' ? 0 : SEGMENT_LENGTH;
        // Transition for right segment handled by animate-preloader-draw
    } else if (animationPhase === 'formingV' || animationPhase === 'holdingV' || animationPhase === 'fadingOut') {
        style.strokeDashoffset = 0;
        const rotation = segmentName === 'left' ? ROTATION_ANGLE_DEG : -ROTATION_ANGLE_DEG;
        style.transform = `rotate(${rotation}deg)`;
        if (animationPhase === 'formingV') {
            style.transition = `transform ${FORM_V_DURATION}ms ease-in-out`;
        }
    } else if (segmentName === 'left') { // Initial state for left if not filling
        style.strokeDashoffset = SEGMENT_LENGTH;
    } else if (segmentName === 'right') { // Initial state for right if not filling
         style.strokeDashoffset = SEGMENT_LENGTH;
    }
     if(animationPhase !== 'fillingLeftSegment' && animationPhase !== 'fillingRightSegment' && segmentName === 'left') {
       if(leftSegmentRef.current) leftSegmentRef.current.classList.remove('animate-preloader-draw');
    }
    if(animationPhase !== 'fillingRightSegment' && segmentName === 'right') {
       if(rightSegmentRef.current) rightSegmentRef.current.classList.remove('animate-preloader-draw');
    }


    return style;
  };

  const getGroupStyle = (): React.CSSProperties => {
    const style: React.CSSProperties = {
      transform: `translateY(0px)`,
      transition: `none`, 
    };
    if (animationPhase === 'formingV') {
      style.transform = `translateY(${V_DOWNWARD_TRANSLATION_PX}px)`;
      style.transition = `transform ${FORM_V_DURATION}ms ease-in-out`;
    } else if (animationPhase === 'holdingV' || animationPhase === 'fadingOut') {
      style.transform = `translateY(${V_DOWNWARD_TRANSLATION_PX}px)`;
    }
    return style;
  };
  

  const hundreds = Math.floor(currentPercentage / 100);
  const tens = Math.floor((currentPercentage % 100) / 10);
  const ones = currentPercentage % 10;

  return (
    <div
      ref={preloaderRef}
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black text-white"
      style={{ opacity: 1 }}
    >
      <svg viewBox="0 0 250 100" className="w-60 h-[100px] overflow-visible"> {/* Adjusted viewBox height */}
        <g ref={groupRef} style={getGroupStyle()}>
          <line
            ref={leftSegmentRef}
            x1={BAR_START_X} y1={BAR_Y}
            x2={BAR_MID_X} y2={BAR_Y}
            stroke="currentColor"
            strokeWidth={STROKE_WIDTH}
            strokeLinecap={STROKE_LINECAP}
            className={(animationPhase === 'fillingLeftSegment') ? 'animate-preloader-draw' : ''}
            style={{
              ...(getSegmentStyle('left')),
              animationDuration: animationPhase === 'fillingLeftSegment' ? `${FILL_SEGMENT_DURATION}ms` : undefined,
            }}
          />
          <line
            ref={rightSegmentRef}
            x1={BAR_MID_X} y1={BAR_Y}
            x2={BAR_END_X} y2={BAR_Y}
            stroke="currentColor"
            strokeWidth={STROKE_WIDTH}
            strokeLinecap={STROKE_LINECAP}
            className={(animationPhase === 'fillingRightSegment') ? 'animate-preloader-draw' : ''}
            style={{
              ...(getSegmentStyle('right')),
              animationDuration: animationPhase === 'fillingRightSegment' ? `${FILL_SEGMENT_DURATION}ms` : undefined,
            }}
          />
        </g>
      </svg>
      
      {showPercentage && (
        <div
          className="absolute flex font-bold text-5xl"
          style={{ bottom: '2rem', right: '2rem' }} 
        >
          <PercentageDigit digit={hundreds} />
          <PercentageDigit digit={tens} />
          <PercentageDigit digit={ones} />
        </div>
      )}
    </div>
  );
};

export default Preloader;
    
