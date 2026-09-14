import { useEffect, useRef } from 'react';
import type { ClipSegment } from '../audio/types';

interface WaveformProps {
  data: Float32Array;
  sampleRate: number;
  segments: ClipSegment[];
  positionSeconds: number;
  onSeek: (seconds: number) => void;
}

/**
 * 声道波形（Canvas 2D）：
 * - 每个像素列取该采样区间的 min/max 包络，支持长录音整轨显示；
 * - 削波段以红色底纹 + 描边高亮；
 * - 点击波形按横轴比例定位到对应时刻。
 */
export default function Waveform({
  data,
  sampleRate,
  segments,
  positionSeconds,
  onSeek
}: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const duration = data.length / sampleRate;

  // 回调放在 ref 里，避免 Redraw 闭包过期
  const onSeekRef = useRef(onSeek);
  onSeekRef.current = onSeek;

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const cssWidth = wrap.clientWidth;
      const cssHeight = wrap.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(cssWidth * dpr));
      canvas.height = Math.max(1, Math.round(cssHeight * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssWidth, cssHeight);

      const mid = cssHeight / 2;

      // 中线与阈值参考线
      ctx.strokeStyle = 'rgba(147,163,187,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, mid + 0.5);
      ctx.lineTo(cssWidth, mid + 0.5);
      ctx.stroke();

      const xForTime = (t: number) =>
        duration <= 0 ? 0 : (t / duration) * cssWidth;

      // 削波高亮：红色全高底纹 + 红色包络
      for (const seg of segments) {
        const x0 = xForTime(seg.startSeconds);
        const x1 = Math.max(x0 + 1, xForTime(seg.endSeconds));
        ctx.fillStyle = 'rgba(255,77,79,0.22)';
        ctx.fillRect(x0, 0, x1 - x0, cssHeight);
      }

      // 波形包络
      ctx.strokeStyle = '#6ea8fe';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const n = data.length;
      for (let x = 0; x < cssWidth; x++) {
        const start = Math.floor((x / cssWidth) * n);
        const end = Math.max(start + 1, Math.ceil(((x + 1) / cssWidth) * n));
        let min = Infinity;
        let max = -Infinity;
        for (let i = start; i < end && i < n; i++) {
          const v = data[i]!;
          if (v < min) min = v;
          if (v > max) max = v;
        }
        if (min === Infinity) continue;
        const yMax = mid - max * (mid - 1);
        const yMin = mid - min * (mid - 1);
        ctx.moveTo(x + 0.5, yMax);
        ctx.lineTo(x + 0.5, yMin);
      }
      ctx.stroke();

      // 削波段描边边界
      ctx.strokeStyle = 'rgba(255,77,79,0.75)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const seg of segments) {
        const x0 = Math.round(xForTime(seg.startSeconds)) + 0.5;
        const x1 = Math.round(xForTime(seg.endSeconds)) - 0.5;
        ctx.moveTo(x0, 0);
        ctx.lineTo(x0, cssHeight);
        ctx.moveTo(x1, 0);
        ctx.lineTo(x1, cssHeight);
      }
      ctx.stroke();

      // 播放位置游标
      if (positionSeconds >= 0) {
        const px = Math.min(cssWidth - 1, Math.max(0, xForTime(positionSeconds)));
        ctx.strokeStyle = '#ffd34d';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px + 0.5, 0);
        ctx.lineTo(px + 0.5, cssHeight);
        ctx.stroke();
      }
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [data, sampleRate, segments, positionSeconds, duration]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || duration <= 0) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    onSeekRef.current(ratio * duration);
  };

  return (
    <div className="canvas-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        data-testid="waveform-canvas"
      />
    </div>
  );
}
