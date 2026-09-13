import { useState } from 'react';
import { Brain } from 'lucide-react';

interface LastSession {
  duration?: number;
  focusScore?: number | null;
  totalDistractions?: number;
}

// Static tips shown after every session. The AI-generated debrief and
// false-positive feedback depended on the retired Express/Gemini server.
const ACTIONABLE_HABITS = [
  "Try the Pomodoro technique: 25 minutes focused work, 5 minutes break",
  "Create a distraction-free zone by silencing notifications"
];

const loadLastSession = (): LastSession | null => {
  try {
    const raw = localStorage.getItem('lastSession');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const StudyDebrief = () => {
  const [session] = useState<LastSession | null>(loadLastSession);

  // No real session data: show nothing rather than a made-up debrief
  if (!session) {
    return null;
  }

  const hasScore = typeof session.focusScore === 'number';

  return (
    <div className="mx-auto max-w-4xl px-8 py-12 space-y-8">
      {/* Overall Summary */}
      <div className="relative group animate-fade-in-up">
        <div className="absolute inset-0 bg-white/5 backdrop-blur-2xl rounded-3xl border border-white/10 shadow-2xl"></div>
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-white/5 to-transparent rounded-3xl"></div>
        <div className="absolute inset-0 bg-gradient-to-tl from-purple-500/10 via-transparent to-blue-500/10 rounded-3xl opacity-60"></div>

        <div className="relative p-8">
          <div className="flex items-center space-x-3 mb-6">
            <div className="w-12 h-12 bg-purple-600/20 rounded-xl flex items-center justify-center">
              <Brain className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold text-white">Study Debrief</h2>
              <p className="text-white/60 text-sm">Your session at a glance</p>
            </div>
          </div>

          <div className="flex items-center justify-center gap-16">
            <div className="text-center">
              <div className="text-5xl font-bold bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent mb-2">
                {hasScore ? session.focusScore : '--'}
              </div>
              <div className="text-white/70 text-sm font-medium">Focus Score</div>
            </div>
            <div className="text-center">
              <div className="text-5xl font-bold bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent mb-2">
                {session.totalDistractions ?? 0}
              </div>
              <div className="text-white/70 text-sm font-medium">Distractions</div>
            </div>
          </div>
        </div>
      </div>

      {/* Actionable Habits */}
      <div className="relative group animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
        <div className="absolute inset-0 bg-white/5 backdrop-blur-2xl rounded-3xl border border-white/10 shadow-2xl"></div>
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-cyan-500/10 rounded-3xl"></div>

        <div className="relative p-8">
          <div className="flex items-center space-x-3 mb-6">
            <Brain className="w-6 h-6 text-blue-400" />
            <h3 className="text-xl font-semibold text-white">Your Action Plan 🎯</h3>
          </div>
          <div className="space-y-3">
            {ACTIONABLE_HABITS.map((habit, index) => (
              <div key={index} className="flex items-start space-x-3 bg-white/5 rounded-xl p-4 border border-blue-500/20">
                <div className="w-6 h-6 bg-blue-600/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-blue-300 font-bold text-sm">{index + 1}</span>
                </div>
                <p className="text-white/90">{habit}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudyDebrief;
