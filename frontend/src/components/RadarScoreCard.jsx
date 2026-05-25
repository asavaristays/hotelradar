import { useEffect, useMemo, useState } from 'react';
import { animate, motion } from 'framer-motion';
import {
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
} from 'recharts';
import { formatCurrency, formatPercent } from './dashboardUtils.js';
import { getRadarScoreCard } from '../services/intelligenceApi.js';

function scoreTone(score) {
  const safeScore = Number(score || 0);
  if (safeScore >= 80) return 'excellent';
  if (safeScore >= 60) return 'strong';
  return 'watch';
}

function positionTone(position) {
  const safePosition = Number(position || 0);
  if (safePosition <= -5) return 'opportunity';
  if (safePosition >= 5) return 'premium';
  return 'balanced';
}

function formatRupees(value) {
  return `₹${formatCurrency(value)}`;
}

export default function RadarScoreCard({ token = '', hotelId = '', fallbackData = null }) {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [animatedScore, setAnimatedScore] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadRadarScoreCard() {
      if (!String(hotelId || '').trim()) {
        setPayload(null);
        setLoading(false);
        setError('');
        return;
      }

      setLoading(true);
      setError('');

      try {
        const nextPayload = await getRadarScoreCard(token, hotelId, fallbackData || {});
        if (!active) return;
        setPayload(nextPayload);
      } catch (loadError) {
        if (!active) return;
        setError(loadError.message || 'Unable to load RADAR score card.');
      } finally {
        if (active) setLoading(false);
      }
    }

    loadRadarScoreCard();
    return () => {
      active = false;
    };
  }, [fallbackData, hotelId, token]);

  useEffect(() => {
    const targetScore = Number(payload?.radarScore || 0);
    const controls = animate(0, targetScore, {
      duration: 1.15,
      ease: 'easeOut',
      onUpdate(value) {
        setAnimatedScore(value);
      },
    });

    return () => controls.stop();
  }, [payload?.radarScore]);

  const score = Number(payload?.radarScore || 0);
  const gaugeData = useMemo(
    () => [{ name: 'score', value: Number(animatedScore.toFixed(1)) }],
    [animatedScore],
  );
  const tone = scoreTone(score);
  const marketPositionTone = positionTone(payload?.positionVsMarket);

  return (
    <motion.section
      className={`radarScoreHero radarScoreHero-${tone}`}
      aria-label="RADAR score hero"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    >
      <div className="radarScoreHeroAccent" aria-hidden="true" />
      <div className="radarScoreHeroInner">
        <div className="radarScoreHeroGaugeWrap">
          <div className="radarScoreHeroGaugeGlow" aria-hidden="true" />
          <div className="radarScoreHeroGauge">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart
                data={gaugeData}
                innerRadius="70%"
                outerRadius="96%"
                startAngle={210}
                endAngle={-30}
                barSize={22}
              >
                <defs>
                  <linearGradient id="radarScoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#00E5FF" />
                    <stop offset="100%" stopColor="#00FFA3" />
                  </linearGradient>
                </defs>
                <PolarAngleAxis
                  type="number"
                  domain={[0, 100]}
                  tick={false}
                  axisLine={false}
                />
                <RadialBar
                  background={{ fill: 'rgba(148, 163, 184, 0.14)' }}
                  clockWise
                  cornerRadius={999}
                  dataKey="value"
                  fill="url(#radarScoreGradient)"
                />
              </RadialBarChart>
            </ResponsiveContainer>

            <div className="radarScoreHeroGaugeValue">
              <span className="radarScoreHeroEyebrow">Radar Score</span>
              <strong>{Math.round(animatedScore)}</strong>
              <small>/ 100</small>
            </div>
          </div>
        </div>

        <div className="radarScoreHeroBody">
          <div className="radarScoreHeroHeader">
            <div>
              <p className="radarScoreHeroKicker">HotelRADAR Intelligence</p>
              <h2>Market-ready revenue signal</h2>
            </div>
            <span className={`radarScoreHeroBadge radarScoreHeroBadge-${tone}`}>
              {payload?.marketStatus || 'Market Watch'}
            </span>
          </div>

          {loading ? <p className="radarScoreHeroMuted">Loading RADAR score…</p> : null}
          {!loading && error ? <p className="errorText">{error}</p> : null}
          {!loading && !error && !payload ? (
            <p className="radarScoreHeroMuted">Select a hotel to view RADAR score intelligence.</p>
          ) : null}

          {!loading && !error && payload ? (
            <>
              <div className="radarScoreHeroMetrics">
                <article className="radarScoreHeroMetric">
                  <span>Market Status</span>
                  <strong>{payload.marketStatus}</strong>
                </article>
                <article className="radarScoreHeroMetric">
                  <span>Recommended Price</span>
                  <strong>{formatRupees(payload.recommendedPrice)}</strong>
                </article>
                <article className="radarScoreHeroMetric">
                  <span>Market Position</span>
                  <strong className={`radarScoreHeroPosition radarScoreHeroPosition-${marketPositionTone}`}>
                    {formatPercent(payload.positionVsMarket, 0)} vs Market
                  </strong>
                </article>
              </div>

              <div className="radarScoreHeroFooter">
                <p className="radarScoreHeroMuted">
                  Score blends pricing posture, demand alignment, reputation, and direct-booking strength.
                </p>
                {payload.generatedAt ? (
                  <span className="radarScoreHeroTimestamp">Updated {payload.generatedAt}</span>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </motion.section>
  );
}
