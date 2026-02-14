import React, { useState, useEffect, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, BarChart, Bar, Cell,
  Area, AreaChart, ReferenceLine
} from 'recharts';

const PLAYER_COLORS = [
  '#e8002d', '#f5c518', '#00e701', '#3671c6', '#ff8000',
  '#ff87bc', '#27f4d2', '#6692ff', '#cd7f32', '#c0c0c0'
];

function App() {
  const [teams, setTeams] = useState(null);
  const [predictions, setPredictions] = useState(null);
  const [results, setResults] = useState(null);
  const [activeTab, setActiveTab] = useState('leaderboard');
  const [selectedRace, setSelectedRace] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/data/teams.json').then(r => r.json()),
      fetch('/data/predictions.json').then(r => r.json()),
      fetch('/data/results.json').then(r => r.json()),
    ]).then(([teamsData, predsData, resultsData]) => {
      setTeams(teamsData);
      setPredictions(predsData);
      setResults(resultsData);
      if (resultsData.results.length > 0) {
        setSelectedRace(resultsData.results.length - 1);
      }
      setLoading(false);
    });
  }, []);

  const teamMap = useMemo(() => {
    if (!teams) return {};
    const map = {};
    teams.teams.forEach(t => { map[t.id] = t; });
    return map;
  }, [teams]);

  // Calculate cumulative standings after each race
  const cumulativeStandings = useMemo(() => {
    if (!results || !teams) return [];
    const teamPoints = {};
    teams.teams.forEach(t => { teamPoints[t.id] = 0; });

    // Points system: position in constructor standings (lower = better)
    // We track cumulative average position
    const cumulative = [];

    results.results.forEach((race, raceIdx) => {
      const racePoints = {};
      race.standings.forEach(s => {
        racePoints[s.teamId] = s.position;
      });

      // After each race, calculate current constructor standings
      // based on average position across all races so far
      const avgPositions = {};
      teams.teams.forEach(t => {
        teamPoints[t.id] = (teamPoints[t.id] || 0) + (racePoints[t.id] || 11);
        avgPositions[t.id] = teamPoints[t.id] / (raceIdx + 1);
      });

      // Sort teams by average position (lower = better)
      const sorted = Object.entries(avgPositions)
        .sort((a, b) => a[1] - b[1])
        .map(([id], idx) => ({ teamId: id, position: idx + 1, avgPos: avgPositions[id] }));

      cumulative.push({
        race: race.race,
        raceIndex: raceIdx,
        standings: sorted
      });
    });

    return cumulative;
  }, [results, teams]);

  // Calculate deviations for each player after each race
  const playerDeviations = useMemo(() => {
    if (!predictions || !cumulativeStandings.length) return [];

    return predictions.players.map(player => {
      const predMap = {};
      player.predictions.forEach(p => { predMap[p.teamId] = p.position; });

      const deviationsOverTime = cumulativeStandings.map((raceStandings, raceIdx) => {
        let totalDeviation = 0;
        const details = [];

        raceStandings.standings.forEach(s => {
          const predicted = predMap[s.teamId] || 11;
          const actual = s.position;
          const dev = Math.abs(predicted - actual);
          totalDeviation += dev;
          details.push({
            teamId: s.teamId,
            predicted,
            actual,
            deviation: dev
          });
        });

        return {
          race: raceStandings.race,
          raceIndex: raceIdx,
          totalDeviation,
          details
        };
      });

      return {
        name: player.name,
        predictions: player.predictions,
        deviationsOverTime
      };
    });
  }, [predictions, cumulativeStandings]);

  // Current leaderboard
  const leaderboard = useMemo(() => {
    if (!playerDeviations.length) return [];
    return playerDeviations
      .map(p => ({
        name: p.name,
        score: p.deviationsOverTime.length > 0
          ? p.deviationsOverTime[p.deviationsOverTime.length - 1].totalDeviation
          : 0,
        deviationsOverTime: p.deviationsOverTime
      }))
      .sort((a, b) => a.score - b.score);
  }, [playerDeviations]);

  // Team positions chart data
  const teamPositionsData = useMemo(() => {
    if (!cumulativeStandings.length || !teams) return [];
    return cumulativeStandings.map(race => {
      const entry = { race: race.race.substring(0, 3).toUpperCase() };
      race.standings.forEach(s => {
        entry[s.teamId] = s.position;
      });
      return entry;
    });
  }, [cumulativeStandings, teams]);

  // Race-by-race team positions (actual race results, not cumulative)
  const raceTeamPositions = useMemo(() => {
    if (!results || !teams) return [];
    return results.results.map(race => {
      const entry = { race: race.race.substring(0, 3).toUpperCase() };
      race.standings.forEach(s => {
        entry[s.teamId] = s.position;
      });
      return entry;
    });
  }, [results, teams]);

  // Player deviation chart data
  const playerDeviationChartData = useMemo(() => {
    if (!playerDeviations.length) return [];
    const maxRaces = Math.max(...playerDeviations.map(p => p.deviationsOverTime.length));
    const data = [];
    for (let i = 0; i < maxRaces; i++) {
      const entry = {
        race: cumulativeStandings[i]?.race.substring(0, 3).toUpperCase() || `R${i + 1}`
      };
      playerDeviations.forEach(p => {
        if (p.deviationsOverTime[i]) {
          entry[p.name] = -p.deviationsOverTime[i].totalDeviation;
        }
      });
      data.push(entry);
    }
    return data;
  }, [playerDeviations, cumulativeStandings]);

  // Player ranking over time
  const playerRankingData = useMemo(() => {
    if (!playerDeviations.length) return [];
    const maxRaces = Math.max(...playerDeviations.map(p => p.deviationsOverTime.length));
    const data = [];
    for (let i = 0; i < maxRaces; i++) {
      const scores = playerDeviations
        .map(p => ({
          name: p.name,
          score: p.deviationsOverTime[i]?.totalDeviation ?? Infinity
        }))
        .sort((a, b) => a.score - b.score);

      const entry = {
        race: cumulativeStandings[i]?.race.substring(0, 3).toUpperCase() || `R${i + 1}`
      };
      scores.forEach((s, idx) => {
        entry[s.name] = idx + 1;
      });
      data.push(entry);
    }
    return data;
  }, [playerDeviations, cumulativeStandings]);

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="custom-tooltip">
        <div className="label">{label}</div>
        {payload.map((p, i) => (
          <div key={i} className="item">
            <div className="dot" style={{ background: p.color }} />
            <span>{p.name || p.dataKey}</span>
            <span className="value">{typeof p.value === 'number' ? (p.value > 0 ? p.value : p.value) : p.value}</span>
          </div>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ fontFamily: 'Oswald', fontSize: 24, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 4 }}>
          Загрузка...
        </div>
      </div>
    );
  }

  const completedRaces = results.results.length;
  const totalRaces = teams.races.length;

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-content">
          <h1>F1 Prediction</h1>
          <span className="season">2025</span>
          <div className="subtitle">Кто лучше предскажет расстановку сил в конструкторах?</div>
          <div className="race-progress">
            <span className="race-progress-label">Сезон</span>
            <div className="race-progress-bar">
              <div
                className="race-progress-fill"
                style={{ width: `${(completedRaces / totalRaces) * 100}%` }}
              />
            </div>
            <span className="race-progress-count">{completedRaces}/{totalRaces}</span>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="tabs">
        {[
          { id: 'leaderboard', label: 'Рейтинг' },
          { id: 'teams', label: 'Команды' },
          { id: 'predictions', label: 'Предикты' },
          { id: 'details', label: 'Детали' },
        ].map(tab => (
          <button
            key={tab.id}
            className={`tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Leaderboard Tab */}
      {activeTab === 'leaderboard' && (
        <>
          <div className="grid-2">
            <div className="card">
              <h2 className="section-title">Текущий рейтинг</h2>
              <p className="section-subtitle">Меньше отклонение = лучше предикт</p>
              {leaderboard.map((player, idx) => (
                <div className="leaderboard-row" key={player.name}>
                  <div className={`lb-position ${idx === 0 ? 'gold' : idx === 1 ? 'silver' : idx === 2 ? 'bronze' : ''}`}>
                    {idx + 1}
                  </div>
                  <div className="lb-name">{player.name}</div>
                  <div>
                    <div className={`lb-score ${idx === 0 ? 'leading' : ''}`}>
                      {player.score}
                    </div>
                    <div className="lb-label">отклонение</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="card">
              <h2 className="section-title">Динамика позиций</h2>
              <p className="section-subtitle">Место в рейтинге после каждого этапа</p>
              <div className="chart-container">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={playerRankingData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      dataKey="race"
                      tick={{ fill: 'var(--text-muted)', fontSize: 11, fontFamily: 'Oswald' }}
                      axisLine={{ stroke: 'var(--border)' }}
                    />
                    <YAxis
                      reversed
                      domain={[1, predictions.players.length]}
                      ticks={predictions.players.map((_, i) => i + 1)}
                      tick={{ fill: 'var(--text-muted)', fontSize: 12, fontFamily: 'Oswald' }}
                      axisLine={{ stroke: 'var(--border)' }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    {predictions.players.map((player, idx) => (
                      <Line
                        key={player.name}
                        type="monotone"
                        dataKey={player.name}
                        stroke={PLAYER_COLORS[idx]}
                        strokeWidth={3}
                        dot={{ r: 5, fill: PLAYER_COLORS[idx] }}
                        activeDot={{ r: 7 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="card">
            <h2 className="section-title">Очки отклонения</h2>
            <p className="section-subtitle">Суммарное отклонение от реальных позиций (ниже = лучше)</p>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={playerDeviationChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="race"
                    tick={{ fill: 'var(--text-muted)', fontSize: 11, fontFamily: 'Oswald' }}
                    axisLine={{ stroke: 'var(--border)' }}
                  />
                  <YAxis
                    tick={{ fill: 'var(--text-muted)', fontSize: 12, fontFamily: 'Oswald' }}
                    axisLine={{ stroke: 'var(--border)' }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine y={0} stroke="var(--border)" />
                  {predictions.players.map((player, idx) => (
                    <Area
                      key={player.name}
                      type="monotone"
                      dataKey={player.name}
                      stroke={PLAYER_COLORS[idx]}
                      fill={PLAYER_COLORS[idx]}
                      fillOpacity={0.1}
                      strokeWidth={2}
                      dot={{ r: 4, fill: PLAYER_COLORS[idx] }}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      {/* Teams Tab */}
      {activeTab === 'teams' && (
        <>
          <div className="card">
            <h2 className="section-title">Позиции команд по этапам</h2>
            <p className="section-subtitle">Как менялись позиции в Кубке Конструкторов</p>
            <div className="chart-container-tall">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={teamPositionsData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="race"
                    tick={{ fill: 'var(--text-muted)', fontSize: 11, fontFamily: 'Oswald' }}
                    axisLine={{ stroke: 'var(--border)' }}
                  />
                  <YAxis
                    reversed
                    domain={[1, 11]}
                    ticks={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]}
                    tick={{ fill: 'var(--text-muted)', fontSize: 12, fontFamily: 'Oswald' }}
                    axisLine={{ stroke: 'var(--border)' }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    formatter={(value) => teamMap[value]?.name || value}
                    wrapperStyle={{ fontFamily: 'Oswald', fontSize: 12, letterSpacing: 1 }}
                  />
                  {teams.teams.map(team => (
                    <Line
                      key={team.id}
                      type="monotone"
                      dataKey={team.id}
                      name={team.name}
                      stroke={team.color}
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: team.color }}
                      activeDot={{ r: 6 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card">
            <h2 className="section-title">Текущая расстановка</h2>
            {cumulativeStandings.length > 0 && (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Поз</th>
                      <th>Команда</th>
                      <th className="center">Ср. позиция</th>
                      {results.results.map((r, i) => (
                        <th key={i} className="center">{r.race.substring(0, 3)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cumulativeStandings[cumulativeStandings.length - 1].standings.map((s, idx) => (
                      <tr key={s.teamId}>
                        <td className={`pos-cell ${idx === 0 ? 'top-1' : idx === 1 ? 'top-2' : idx === 2 ? 'top-3' : ''}`}>
                          {s.position}
                        </td>
                        <td>
                          <div className="team-cell">
                            <div className="team-color-bar" style={{ background: teamMap[s.teamId]?.color }} />
                            {teamMap[s.teamId]?.name || s.teamId}
                          </div>
                        </td>
                        <td className="deviation-cell" style={{ color: 'var(--text-secondary)' }}>
                          {s.avgPos.toFixed(1)}
                        </td>
                        {results.results.map((race, ri) => {
                          const pos = race.standings.find(x => x.teamId === s.teamId)?.position;
                          return (
                            <td key={ri} className="deviation-cell" style={{ color: 'var(--text-secondary)' }}>
                              {pos}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Predictions Tab */}
      {activeTab === 'predictions' && (
        <>
          <h2 className="section-title">Предикты игроков</h2>
          <p className="section-subtitle" style={{ marginBottom: 32 }}>Расстановка сил по мнению каждого игрока</p>
          <div className="grid-3">
            {predictions.players.map((player, pIdx) => {
              const sortedPreds = [...player.predictions].sort((a, b) => a.position - b.position);
              const deviation = playerDeviations[pIdx]?.deviationsOverTime;
              const currentDev = deviation?.length > 0 ? deviation[deviation.length - 1].totalDeviation : 0;

              return (
                <div className="prediction-card" key={player.name}>
                  <div className="prediction-card-header">
                    <div className="prediction-card-name" style={{ color: PLAYER_COLORS[pIdx] }}>
                      {player.name}
                    </div>
                    <div className="prediction-card-score" style={{ color: PLAYER_COLORS[pIdx] }}>
                      {currentDev}
                    </div>
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: 40 }}>#</th>
                        <th>Команда</th>
                        <th className="center">Факт</th>
                        <th className="center">Откл</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedPreds.map(pred => {
                        const currentStandings = cumulativeStandings.length > 0
                          ? cumulativeStandings[cumulativeStandings.length - 1].standings
                          : [];
                        const actual = currentStandings.find(s => s.teamId === pred.teamId);
                        const actualPos = actual?.position || '—';
                        const dev = actual ? Math.abs(pred.position - actual.position) : 0;

                        return (
                          <tr key={pred.teamId}>
                            <td className="pos-cell" style={{ fontSize: 14 }}>{pred.position}</td>
                            <td>
                              <div className="team-cell">
                                <div className="team-color-bar" style={{ background: teamMap[pred.teamId]?.color, height: 18 }} />
                                <span style={{ fontSize: 13 }}>{teamMap[pred.teamId]?.name}</span>
                              </div>
                            </td>
                            <td className="deviation-cell" style={{ fontSize: 14 }}>{actualPos}</td>
                            <td className={`deviation-cell ${dev === 0 ? 'deviation-zero' : 'deviation-positive'}`} style={{ fontSize: 14 }}>
                              {dev === 0 ? '✓' : `−${dev}`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Details Tab */}
      {activeTab === 'details' && (
        <>
          <h2 className="section-title">Результаты по этапам</h2>
          <div className="race-pills">
            {teams.races.map((race, idx) => {
              const isCompleted = idx < results.results.length;
              return (
                <button
                  key={race}
                  className={`race-pill ${selectedRace === idx ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
                  onClick={() => isCompleted && setSelectedRace(idx)}
                  disabled={!isCompleted}
                  style={!isCompleted ? { opacity: 0.3, cursor: 'not-allowed' } : {}}
                >
                  {race}
                </button>
              );
            })}
          </div>

          {selectedRace !== null && selectedRace < results.results.length && (
            <div className="grid-2">
              <div className="card">
                <h2 className="section-title" style={{ fontSize: 18 }}>
                  {results.results[selectedRace].race} — Результат
                </h2>
                <table>
                  <thead>
                    <tr>
                      <th>Поз</th>
                      <th>Команда</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.results[selectedRace].standings
                      .sort((a, b) => a.position - b.position)
                      .map((s, idx) => (
                        <tr key={s.teamId}>
                          <td className={`pos-cell ${idx === 0 ? 'top-1' : idx === 1 ? 'top-2' : idx === 2 ? 'top-3' : ''}`}>
                            {s.position}
                          </td>
                          <td>
                            <div className="team-cell">
                              <div className="team-color-bar" style={{ background: teamMap[s.teamId]?.color }} />
                              {teamMap[s.teamId]?.name}
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              <div className="card">
                <h2 className="section-title" style={{ fontSize: 18 }}>
                  Отклонения после {results.results[selectedRace].race}
                </h2>
                <table>
                  <thead>
                    <tr>
                      <th>Игрок</th>
                      <th className="center">Отклонение</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playerDeviations
                      .map(p => ({
                        name: p.name,
                        dev: p.deviationsOverTime[selectedRace]?.totalDeviation || 0,
                        details: p.deviationsOverTime[selectedRace]?.details || []
                      }))
                      .sort((a, b) => a.dev - b.dev)
                      .map((p, idx) => (
                        <tr key={p.name}>
                          <td>
                            <div className="team-cell">
                              <div className="team-color-bar" style={{
                                background: PLAYER_COLORS[predictions.players.findIndex(pl => pl.name === p.name)],
                                height: 18
                              }} />
                              <span style={{ fontWeight: 600 }}>{p.name}</span>
                            </div>
                          </td>
                          <td className="deviation-cell">
                            <span className={`total-deviation ${p.dev === 0 ? 'deviation-zero' : 'deviation-positive'}`}>
                              {p.dev}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>

                {/* Detail breakdown */}
                <div style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 20 }}>
                  <div style={{ fontFamily: 'Oswald', fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 12 }}>
                    Разбивка по командам
                  </div>
                  <div className="table-wrapper">
                    <table>
                      <thead>
                        <tr>
                          <th>Команда</th>
                          {predictions.players.map(p => (
                            <th key={p.name} className="center">{p.name}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {teams.teams.map(team => {
                          const actualStandings = cumulativeStandings[selectedRace]?.standings;
                          const actualPos = actualStandings?.find(s => s.teamId === team.id)?.position || '—';

                          return (
                            <tr key={team.id}>
                              <td>
                                <div className="team-cell">
                                  <div className="team-color-bar" style={{ background: team.color, height: 16 }} />
                                  <span style={{ fontSize: 13 }}>{team.name}</span>
                                  <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>
                                    (факт: {actualPos})
                                  </span>
                                </div>
                              </td>
                              {predictions.players.map((player, pIdx) => {
                                const pred = player.predictions.find(p => p.teamId === team.id);
                                const predPos = pred?.position || 11;
                                const dev = typeof actualPos === 'number' ? Math.abs(predPos - actualPos) : 0;

                                return (
                                  <td key={player.name} className={`deviation-cell ${dev === 0 ? 'deviation-zero' : 'deviation-positive'}`}
                                    style={{ fontSize: 13 }}>
                                    {predPos}→{actualPos} ({dev === 0 ? '✓' : `±${dev}`})
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default App;
