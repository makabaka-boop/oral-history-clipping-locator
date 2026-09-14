import { useEffect, useRef, useState } from 'react';
import { loadAndScanWav, type LoadedWav } from './audio/decoder';
import { ERROR_MESSAGES, WavError, type ClipSegment } from './audio/types';
import Waveform from './components/Waveform';
import SegmentList from './components/SegmentList';

type Status = 'idle' | 'loading' | 'error' | 'done';

interface ErrorState {
  code: string;
  title: string;
  detail: string;
}

const CHANNEL_LABELS = ['左声道', '右声道', '中置声道'];

function channelLabel(index: number, total: number): string {
  if (total === 1) return '单声道';
  if (total === 2) return CHANNEL_LABELS[index] ?? `声道 ${index + 1}`;
  return CHANNEL_LABELS[index] ?? `声道 ${index + 1}`;
}

function formatSeconds(totalSeconds: number): string {
  return totalSeconds.toFixed(3);
}

export default function App() {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<ErrorState | null>(null);
  const [loaded, setLoaded] = useState<LoadedWav | null>(null);
  const [position, setPosition] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const handleFile = async (file: File | null | undefined) => {
    if (!file) return;
    setStatus('loading');
    setError(null);
    try {
      const next = await loadAndScanWav(file);
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = next.objectUrl;
      setLoaded(next);
      setPosition(0);
      setStatus('done');
    } catch (err) {
      if (err instanceof WavError) {
        setError({
          code: err.code,
          title: ERROR_MESSAGES[err.code],
          detail: err.message
        });
      } else {
        const detail = err instanceof Error ? err.message : String(err);
        setError({
          code: 'SCAN_FAILED',
          title: ERROR_MESSAGES.DECODE_FAILED,
          detail: `扫描过程中发生错误：${detail}`
        });
      }
      setLoaded(null);
      setStatus('error');
    }
  };

  const seekTo = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio || !loaded) return;
    const clamped = Math.min(
      loaded.result.durationSeconds,
      Math.max(0, seconds)
    );
    audio.currentTime = clamped;
    setPosition(clamped);
    void audio.play().catch(() => {
      /* 浏览器拦截自动播放时保持定位即可 */
    });
  };

  const locateSegment = (seg: ClipSegment) => seekTo(seg.startSeconds);

  const locateFirst = () => {
    if (loaded?.result.firstClip) {
      seekTo(loaded.result.firstClip.segment.startSeconds);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>口述史磁带 WAV 削波核验台</h1>
        <p>
          扫描归一化 PCM：|样本| ≥ 0.999 且连续 ≥ 3 帧成段；相邻段间隔 ≤ 2 帧合并。
          文件仅在本机浏览器内读取与解码，不上传、不访问任何在线服务。
        </p>
      </header>

      <section className="panel dropzone">
        <label htmlFor="file-input">
          <strong>选择本地单个 WAV 文件：</strong>
        </label>
        <input
          id="file-input"
          data-testid="file-input"
          type="file"
          accept=".wav,audio/wav,audio/x-wav,audio/wave"
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
        <span className="privacy-note">
          全程离线处理：文件不会离开当前设备，刷新页面即释放。
        </span>
        {status === 'loading' && (
          <span className="loading" data-testid="loading">
            正在本地解码与扫描…
          </span>
        )}
      </section>

      {status === 'error' && error && (
        <section className="panel error-box" data-testid="error-panel">
          <div className="error-title" data-testid="error-title">
            [{error.code}] {error.title}
          </div>
          <div className="error-detail" data-testid="error-detail">
            {error.detail}
          </div>
          <div className="error-detail" style={{ marginTop: 8, color: 'var(--muted)' }}>
            未生成任何扫描结果，请更换文件后重试。
          </div>
        </section>
      )}

      {status === 'done' && loaded && (
        <>
          <section className="panel" data-testid="summary-panel">
            <div>
              <span
                className={`verdict ${loaded.result.hasClip ? 'fail' : 'pass'}`}
                data-testid="verdict"
              >
                {loaded.result.hasClip ? '需重采' : '可交付'}
              </span>
            </div>
            <div className="summary-grid">
              <div className="metric">
                <span className="metric-label">文件</span>
                <span className="metric-value">{loaded.result.fileName}</span>
              </div>
              <div className="metric">
                <span className="metric-label">采样率</span>
                <span className="metric-value">{loaded.result.sampleRate} Hz</span>
              </div>
              <div className="metric">
                <span className="metric-label">声道数</span>
                <span className="metric-value">{loaded.result.channels.length}</span>
              </div>
              <div className="metric">
                <span className="metric-label">总时长</span>
                <span className="metric-value">
                  {formatSeconds(loaded.result.durationSeconds)} s
                </span>
              </div>
              <div className="metric">
                <span className="metric-label">总削波时长（各声道累加）</span>
                <span className="metric-value" data-testid="total-clip-ms">
                  {loaded.result.totalClipMs} ms
                </span>
              </div>
              <div className="metric">
                <span className="metric-label">削波段数（各声道合计）</span>
                <span className="metric-value">
                  {loaded.result.channels.reduce(
                    (n: number, ch) => n + ch.segments.length,
                    0
                  )}
                </span>
              </div>
            </div>
            <div className="toolbar">
              {loaded.result.hasClip && (
                <button
                  className="primary"
                  onClick={locateFirst}
                  data-testid="locate-first"
                >
                  定位首个异常（
                  {channelLabel(
                    loaded.result.firstClip!.channel,
                    loaded.result.channels.length
                  )}
                  {' '}
                  {loaded.result.firstClip!.segment.startMs} ms）
                </button>
              )}
              <span className="privacy-note">
                点击波形或区间行即可定位并试听。
              </span>
            </div>
            <audio
              ref={audioRef}
              controls
              src={loaded.objectUrl}
              data-testid="audio-player"
              onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
            />
          </section>

          {loaded.result.channels.map((ch) => (
            <section
              className="channel-card"
              key={ch.channel}
              data-testid="channel-card"
              data-channel={ch.channel}
            >
              <div className="channel-head">
                <h3>{channelLabel(ch.channel, loaded.result.channels.length)}</h3>
                <span
                  className={`channel-stat ${ch.segments.length > 0 ? 'clip-present' : ''}`}
                  data-testid="channel-stat"
                >
                  {ch.segments.length === 0
                    ? '无削波段'
                    : `${ch.segments.length} 段 · 合计 ${ch.totalClipMs} ms`}
                </span>
              </div>
              <Waveform
                data={loaded.result.channelData[ch.channel]!}
                sampleRate={loaded.result.sampleRate}
                segments={ch.segments}
                positionSeconds={position}
                onSeek={seekTo}
              />
              <div className="legend">
                <span>
                  <span className="swatch" style={{ background: '#6ea8fe' }} />
                  波形
                </span>
                <span>
                  <span className="swatch" style={{ background: 'rgba(255,77,79,0.5)' }} />
                  削波高亮
                </span>
                <span>
                  <span className="swatch" style={{ background: '#ffd34d' }} />
                  当前播放位置
                </span>
              </div>
              <SegmentList segments={ch.segments} onLocate={locateSegment} />
            </section>
          ))}
        </>
      )}
    </div>
  );
}
