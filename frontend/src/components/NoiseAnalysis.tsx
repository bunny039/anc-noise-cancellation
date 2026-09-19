/* ============================================================
   components/NoiseAnalysis.tsx
   Detected noise type + frequency characteristics panel
   ============================================================ */
import React from 'react';
import { Activity } from 'lucide-react';
import type { NoiseProfile, SpectrumPoint } from '../types';

interface NoiseAnalysisProps {
  noiseProfile: NoiseProfile;
  dominantFreqHz: number | null;
  spectrumData: SpectrumPoint[] | null;
  estimatedSnrDb: number | null;
}

const NOISE_INFO: Record<NoiseProfile, {
  label: string;
  freqRange: string;
  description: string;
  bands: number[]; // highlight these frequencies (Hz)
  color: string;
}> = {
  helicopter: {
    label: 'HELICOPTER / ROTOR NOISE',
    freqRange: '20 – 800 Hz (blade passage)',
    description: 'Broadband tonal noise from rotor blade passage frequency and harmonics. Dominant below 500 Hz.',
    bands: [80, 160, 320, 640],
    color: 'text-orange-700 bg-orange-50 border-orange-200',
  },
  engine: {
    label: 'ENGINE / VEHICLE NOISE',
    freqRange: '50 – 2000 Hz',
    description: 'Combustion engine harmonics and mechanical vibration. Strong low-to-mid frequency content.',
    bands: [50, 100, 200, 400, 800],
    color: 'text-red-700 bg-red-50 border-red-200',
  },
  gunfire: {
    label: 'GUNFIRE / BLAST',
    freqRange: 'Broadband impulse',
    description: 'High-energy impulse noise across full band. Can cause clipping. Transient in nature.',
    bands: [200, 500, 1000, 2000],
    color: 'text-red-800 bg-red-50 border-red-300',
  },
  wind: {
    label: 'WIND / GUST',
    freqRange: '20 – 400 Hz (infrasound to low)',
    description: 'Turbulent airflow noise. Mostly low-frequency rumble, can saturate microphone pre-amp.',
    bands: [40, 80, 150, 300],
    color: 'text-sky-700 bg-sky-50 border-sky-200',
  },
  environmental: {
    label: 'ENVIRONMENTAL',
    freqRange: 'Broadband',
    description: 'Mixed environmental background: ambient crowd, machinery, traffic. Spectrally diverse.',
    bands: [100, 300, 600, 1200, 2400],
    color: 'text-slate-700 bg-slate-50 border-slate-200',
  },
  custom: {
    label: 'CUSTOM NOISE PROFILE',
    freqRange: 'User-defined',
    description: 'Custom noise profile — analysis based on uploaded audio FFT.',
    bands: [],
    color: 'text-purple-700 bg-purple-50 border-purple-200',
  },
};

export const NoiseAnalysis: React.FC<NoiseAnalysisProps> = ({
  noiseProfile, dominantFreqHz, spectrumData: _spectrumData, estimatedSnrDb,
}) => {
  const info = NOISE_INFO[noiseProfile];

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title flex items-center gap-1.5">
          <Activity size={10} />
          Noise Analysis
        </span>
      </div>

      <div className="px-2.5 py-2">
        {/* Noise type badge */}
        <div className={`flex items-center gap-2 px-2 py-1.5 rounded-sm border mb-2 ${info.color}`}>
          <span className="status-dot bg-current opacity-60" />
          <span className="text-xs font-bold font-mono tracking-wide">{info.label}</span>
        </div>

        {/* Technical info grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mb-2">
          <div className="metric-row">
            <span className="metric-label">Dominant Frequency</span>
            <span className="metric-value">
              {dominantFreqHz !== null
                ? dominantFreqHz >= 1000
                  ? `${(dominantFreqHz / 1000).toFixed(2)} kHz`
                  : `${dominantFreqHz.toFixed(0)} Hz`
                : '—'}
            </span>
          </div>
          <div className="metric-row">
            <span className="metric-label">Typical Band</span>
            <span className="metric-value text-2xs">{info.freqRange}</span>
          </div>
          <div className="metric-row">
            <span className="metric-label">Est. Input SNR</span>
            <span className="metric-value">
              {estimatedSnrDb !== null ? `${estimatedSnrDb.toFixed(1)} dB` : 'N/A'}
            </span>
          </div>
          <div className="metric-row">
            <span className="metric-label">Profile</span>
            <span className="metric-value">{noiseProfile.toUpperCase()}</span>
          </div>
        </div>

        {/* Description */}
        <div className="text-2xs text-slate-500 leading-relaxed border-t border-slate-100 pt-2">
          {info.description}
        </div>

        {/* Highlighted frequency bands */}
        {info.bands.length > 0 && (
          <div className="mt-2 pt-2 border-t border-slate-100">
            <div className="field-label mb-1">Dominant Noise Bands</div>
            <div className="flex flex-wrap gap-1">
              {info.bands.map(f => (
                <span
                  key={f}
                  className="text-2xs font-mono px-1.5 py-0.5 bg-amber-100 text-amber-700 border border-amber-200 rounded-sm"
                >
                  {f >= 1000 ? `${(f / 1000).toFixed(1)} kHz` : `${f} Hz`}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
